import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateContent, renderPage, sortedArticles, matches, officialUrl } from '../publication.mjs';
import {renderNotice,notices} from '../public-notices.mjs';

const fixture = JSON.parse(await readFile(new URL('../content.json', import.meta.url),'utf8'));
const now = new Date(`${fixture.reviewedAt}T12:00:00+08:00`);
const edited = edit => { const value = structuredClone(fixture); edit(value); return value; };

test('public notices match the static site and escape content with no visitor scripts',()=>{
  for(const kind of ['terms','privacy']) {
    const html=renderNotice(kind);
    assert.match(html,/href="\.\/"/);
    assert.match(html,/GitHub 账号 Jihkk/);
    assert.ok(!html.includes('<script'));
    assert.ok(!html.includes('请填写'));
  }
  notices.terms.sections.push(['<script>alert(1)</script>','<img src=x onerror=alert(1)>']);
  try {
    const html=renderNotice('terms');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<img src=x'));
  } finally {notices.terms.sections.pop();}
  assert.throws(()=>renderNotice('unknown'));
});

test('publications require exact official-host links, provenance and honest dates', () => {
  validateContent(fixture, now);
  for (const url of ['http://www.water.gov.my/', 'https://water.gov.my.evil.example/', 'https://water.gov.my@evil.example/', 'javascript:alert(1)', 'https://www.water.gov.my:444/']) assert.throws(()=>officialUrl(url,['water.gov.my']));
  assert.equal(officialUrl('https://wpkl.water.gov.my/en/',['water.gov.my']),'https://wpkl.water.gov.my/en/');
  for (const edit of [
    c=>c.articles[0].source='unknown',
    c=>c.articles[0].evidence='',
    c=>c.articles[0].dateEvidence='',
    c=>c.articles[0].publishedAt='2026-02-30',
    c=>c.articles[0].publishedAt='2099-10-09',
    c=>c.articles[0].category='made-up',
    c=>c.articles.push({...c.articles[0]}),
    c=>c.articles.push({...c.articles[0],id:'different-id'}),
  ]) assert.throws(()=>validateContent(edited(edit), now));
});

test('a future alert expiry is allowed but the page never presents it as live', () => {
  const content = edited(c=>Object.assign(c.articles[0],{category:'flood-alerts',validUntil:'2026-10-09T18:00:00+08:00'}));
  validateContent(content,now);
  assert.match(renderPage(content),/历史预警记录/);
  delete content.articles[0].validUntil;
  assert.throws(()=>validateContent(content,now));
});

test('titles and source evidence cannot become executable HTML', () => {
  const content=edited(c=>{
    c.articles[0].title='<img src=x onerror=alert(1)>';
    c.articles[0].evidence='</details><script>alert(1)</script>';
  });
  const html=renderPage(validateContent(content,now));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert'));
  assert.match(html,/发布日未标明/);
  assert.ok(html.includes(`资料核查 ${fixture.reviewedAt}`));
  assert.match(html,/这不代表没有事件或官方公告/);
});

test('sorting uses the original publication/event dates and filters intersect', () => {
  const sample={articles:[
    {...fixture.articles[0],id:'older',publishedAt:'2026-04-01',eventDate:null},
    {...fixture.articles[0],id:'event',publishedAt:null,eventDate:'2026-05-01'},
    {...fixture.articles[0],id:'latest',publishedAt:'2026-06-01',eventDate:null},
  ]};
  assert.deepEqual(sortedArticles(sample).map(a=>a.id),['latest','event','older']);
  const article={...fixture.articles[0],region:'Pahang',source:'nahrim',category:'projects'};
  assert.ok(matches(article,{query:'pahang',source:'nahrim',category:'projects'}));
  assert.ok(!matches(article,{query:'pahang',source:'jps'}));
  const html=renderPage({...fixture,articles:[]});
  assert.match(html,/<div id="stories"><\/div>/);
  assert.ok(!html.includes('class="empty" hidden'));
});
