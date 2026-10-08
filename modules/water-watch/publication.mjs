import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CATEGORIES } from '../../industry/taxonomy.ts';
import { SITE } from '../../site/site.ts';

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

export function officialUrl(value, hosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error('Expected an HTTPS link on the registered official source');
  return url.href;
}

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

export function renderPage(content) {
  const sources = new Map(content.sources.map(source => [source.id, source]));
  const option = (value, label) => `<option value="${escape(value)}">${escape(label)}</option>`;
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
  const portals = content.sources.filter(s=>s.portal).map(source => `<a class="portal" href="${escape(source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escape(source.name)} <span aria-hidden="true">↗</span></strong><span>${escape(source.description)}</span></a>`).join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(SITE.description)}"><title>${escape(SITE.homeTitle)}</title><link rel="icon" href="logo.svg" type="image/svg+xml"><link rel="stylesheet" href="style.css"><script src="client.js" defer></script></head>
<body><a class="skip" href="#news">跳到资讯</a><header><div class="header-inner"><a class="brand" href="./"><img src="logo.svg" width="38" height="38" alt=""><span>Malaysia Water Watch<small>马来西亚水利观察</small></span></a><nav aria-label="主导航"><a href="#news">资讯</a><a href="#official">官方入口</a><a href="#about">关于</a><a href="${escape(SITE.github)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></nav></div></header>
<main><section class="hero"><div><p class="eyebrow">MALAYSIA · WATER & FLOOD</p><h1>从降雨到河流，<br>看清水利与防洪动态。</h1><p class="intro">中文摘要，官方原文。关注马来西亚的洪水预警、水文降雨、工程、政策、水资源与招标。</p><a class="button" href="#news">浏览收录资讯 <span aria-hidden="true">↓</span></a></div><div class="river-art" aria-hidden="true"><svg viewBox="0 0 420 330"><path class="contour" d="M-30 40Q100 5 195 90T460 95M-30 80Q100 45 195 130T460 135M-30 120Q100 85 195 170T460 175M-30 160Q100 125 195 210T460 215M-30 200Q100 165 195 250T460 255"/><path class="river" d="M20 305C250 295 230 200 160 175S150 70 370 25"/><circle cx="160" cy="175" r="9"/><circle cx="370" cy="25" r="7"/></svg><span>OBSERVE · UNDERSTAND · PREPARE</span></div></section>
<section class="edition-note" aria-label="资料更新状态"><strong>资料核查 ${escape(content.reviewedAt)}</strong><span>${content.articles.length} 条收录 · 马来西亚 UTC+8</span><p>这是编辑收录资料，不是实时警报。日期较早的内容仍保留原始日期；最新预警、水位及招标状态请查官方。</p></section>
<section id="official"><div class="section-heading"><h2>官方实时信息与采购入口</h2><span>直接前往原网站</span></div><div class="portals">${portals}</div></section>
<section id="news"><div class="section-heading"><h2>行业资讯</h2><span id="count" role="status" aria-live="polite">${content.articles.length} 条</span></div><form class="filters" role="search" onsubmit="return false"><label>关键词<input id="query" type="search" placeholder="搜索机构、地区、项目或技术" autocomplete="off"></label><label>分类<select id="category">${option('','全部分类')}${CATEGORIES.map(c=>option(c.key,c.label)).join('')}</select></label><label>来源<select id="source">${option('','全部来源')}${content.sources.filter(s=>content.articles.some(a=>a.source===s.id)).map(s=>option(s.id,s.name)).join('')}</select></label><button id="reset" type="button">重置</button></form><noscript><p>浏览器未启用 JavaScript，下面仍可阅读全部资讯；搜索和筛选暂不可用。</p></noscript><div id="stories">${articles}</div><p id="empty" class="empty" ${content.articles.length ? 'hidden' : ''}>没有符合条件的收录。这不代表没有事件或官方公告，请查阅官方入口。</p></section>
<section id="about" class="about"><h2>读懂资料，也保留它的边界。</h2><p>Malaysia Water Watch 是独立的中文阅读索引，不是政府机构。摘要保留工程阶段、时间和地区，不把建议写成完成，也不把旧警报写成现行风险。原文版权归各来源；本站提供摘要与链接。</p><p>资讯通过编辑查阅更新，暂无定时自动采集。页面不使用广告、追踪代码或登录表单；浏览搜索在浏览器内完成。预览版仅供审阅，公开使用规则与隐私说明须由站主确认。</p><div class="source-list">关注来源：${content.sources.filter(s=>!s.portal).map(s=>`<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.name)}</a>`).join(' · ')}</div></section></main><footer><span>Malaysia Water Watch · 马来西亚水利观察</span><a href="${escape(SITE.github)}" target="_blank" rel="noopener noreferrer">代码与内容在 GitHub ↗</a></footer></body></html>`;
}

export async function loadContent() {
  return validateContent(JSON.parse(await readFile(resolve(directory, 'content.json'), 'utf8')));
}

export async function build() {
  const content = await loadContent();
  await mkdir(outputDirectory, {recursive:true});
  await writeFile(resolve(outputDirectory, 'index.html'), renderPage(content));
  await copyFile(resolve(directory,'style.css'), resolve(outputDirectory,'style.css'));
  await copyFile(resolve(directory,'client.js'), resolve(outputDirectory,'client.js'));
  await copyFile(new URL('../../site/brand/logo.svg', import.meta.url), resolve(outputDirectory,'logo.svg'));
  await writeFile(resolve(outputDirectory,'content.json'), JSON.stringify(content,null,2)+'\n');
  console.log(`Built ${content.articles.length} articles in ${outputDirectory}`);
}
