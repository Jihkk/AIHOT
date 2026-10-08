import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CATEGORIES } from '../../industry/taxonomy.ts';
import { SITE } from '../../site/site.ts';
import { officialUrl } from './official-url.mjs';
import { loadMonitoring } from './monitoring.mjs';
import { renderLayout } from './page-layout.mjs';
export { officialUrl } from './official-url.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
export const outputDirectory = fileURLToPath(new URL('../../.data/water-watch/', import.meta.url));
const categoryNames = new Map(CATEGORIES.map(c => [c.key, c.label]));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: expected non-empty text`);
};
const day = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`${label}: invalid date`);
};

export function validateContent(content, now = new Date()) {
  if (content.version !== 1 || !Array.isArray(content.sources) || !Array.isArray(content.articles)) throw new Error('Unsupported content format');
  day(content.reviewedAt, 'reviewedAt');
  const today = now.toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'});
  if (content.reviewedAt > today) throw new Error('Review date is in the future');
  const sources = new Map();
  for (const source of content.sources) {
    text(source.id, 'source.id'); text(source.name, 'source.name'); text(source.description, 'source.description');
    if (sources.has(source.id)) throw new Error('Duplicate source id');
    if (!Array.isArray(source.hosts) || !source.hosts.length || source.hosts.some(host => !/^[a-z0-9.-]+$/.test(host) || !host.includes('.'))) throw new Error('Invalid source hosts');
    officialUrl(source.url, source.hosts);
    sources.set(source.id, source);
  }
  const ids = new Set(), urls = new Set();
  for (const article of content.articles) {
    if (!/^[a-z0-9-]+$/.test(article.id)) throw new Error('Invalid article id');
    if (ids.has(article.id)) throw new Error('Duplicate article id');
    ids.add(article.id);
    const source = sources.get(article.source);
    if (!source) throw new Error('Unknown article source');
    const url = officialUrl(article.url, source.hosts);
    if (urls.has(url)) throw new Error('Duplicate article URL');
    urls.add(url);
    if (!categoryNames.has(article.category)) throw new Error('Unknown category');
    if (!['ms', 'en', 'zh'].includes(article.language)) throw new Error('Unknown source language');
    for (const key of ['title', 'summary', 'region', 'stage', 'dateEvidence', 'evidence']) text(article[key], key);
    if (!Array.isArray(article.tags) || article.tags.some(tag => typeof tag !== 'string')) throw new Error('Invalid article tags');
    day(article.checkedAt, 'checkedAt');
    if (article.checkedAt > content.reviewedAt) throw new Error('Article review is after edition review');
    for (const key of ['publishedAt', 'eventDate']) {
      if (article[key] !== null) {
        day(article[key], key);
        if (article[key] > article.checkedAt) throw new Error(`${key}: future date must not be a published/event fact`);
      }
    }
    if (article.category === 'flood-alerts') {
      text(article.validUntil, 'validUntil');
      if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(article.validUntil) || Number.isNaN(Date.parse(article.validUntil))) throw new Error('Alert expiry must include timezone');
    }
  }
  return content;
}

export const sortedArticles = content => [...content.articles].sort((a,b) => (b.publishedAt ?? b.eventDate ?? '').localeCompare(a.publishedAt ?? a.eventDate ?? '') || a.id.localeCompare(b.id));
export const matches = (article, filters) => (!filters.category || article.category === filters.category) && (!filters.source || article.source === filters.source) && (!filters.query || [article.title, article.summary, article.region, ...article.tags].join(' ').toLowerCase().includes(filters.query.toLowerCase()));

export function renderPage(content, monitoring = null) {
  const sources = new Map(content.sources.map(source => [source.id, source]));
  const articles = sortedArticles(content).map(article => {
    const source = sources.get(article.source);
    const date = article.publishedAt ? `发布 ${article.publishedAt}` : article.eventDate ? `活动 ${article.eventDate} · 发布日未标明` : '发布日期未标明';
    // Alerts are always historical references here; current conditions belong to the issuing authority.
    const alert = article.category === 'flood-alerts' ? `<p class="alert-note">历史预警记录 · 原有效期至 ${escape(article.validUntil)} · 当前状态请查官方</p>` : '';
    return `<article class="story" data-category="${escape(article.category)}" data-source="${escape(article.source)}" data-search="${escape([article.title,article.summary,article.region,...article.tags].join(' ').toLowerCase())}">
      <div class="story-meta"><span class="category">${escape(categoryNames.get(article.category))}</span><span>${escape(source.name)}</span><span>${escape(date)}</span></div>
      <h3><a href="${escape(article.url)}" target="_blank" rel="noopener noreferrer">${escape(article.title)} <span aria-hidden="true">↗</span></a></h3>
      ${alert}<p>${escape(article.summary)}</p>
      <div class="tags"><span>${escape(article.region)}</span><span>${escape(article.stage)}</span>${article.tags.map(tag=>`<span>${escape(tag)}</span>`).join('')}</div>
      <details><summary>来源与日期核对</summary><p>${escape(article.evidence)}</p><p>${escape(article.dateEvidence)}</p><p>原文语言：${escape({ms:'马来文',en:'英文',zh:'中文'}[article.language])} · 查阅 ${escape(article.checkedAt)} · <a href="${escape(article.url)}" target="_blank" rel="noopener noreferrer">打开官方原文 ↗</a></p></details>
    </article>`;
  }).join('');
  return renderLayout({content,monitoring,site:SITE,categories:CATEGORIES,articles});
}

export async function loadContent() {
  return validateContent(JSON.parse(await readFile(resolve(directory, 'content.json'), 'utf8')));
}

export async function build() {
  const content = await loadContent();
  const monitoring = await loadMonitoring(content);
  await mkdir(outputDirectory, {recursive:true});
  await writeFile(resolve(outputDirectory, 'index.html'), renderPage(content, monitoring));
  await copyFile(resolve(directory,'style.css'), resolve(outputDirectory,'style.css'));
  await copyFile(resolve(directory,'client.js'), resolve(outputDirectory,'client.js'));
  await copyFile(new URL('../../site/brand/logo.svg', import.meta.url), resolve(outputDirectory,'logo.svg'));
  await writeFile(resolve(outputDirectory,'content.json'), JSON.stringify(content,null,2)+'\n');
  await writeFile(resolve(outputDirectory,'collection.json'), JSON.stringify(monitoring.collection,null,2)+'\n');
  await writeFile(resolve(outputDirectory,'data.json'), JSON.stringify(monitoring.data,null,2)+'\n');
  console.log(`Built ${content.articles.length} articles in ${outputDirectory}`);
}
