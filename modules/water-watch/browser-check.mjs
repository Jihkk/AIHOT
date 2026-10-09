import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { loadContent, sortedArticles } from './publication.mjs';
import { loadMonitoring } from './monitoring.mjs';
import { forecastRows } from './reader-panels.mjs';
import {loadHydro} from './hydro.mjs';
import {tenderStatus} from './industry-desks.mjs';
import {matchesNews} from './news-filters.mjs';

const content=await loadContent();
const monitoring=await loadMonitoring(content);
const forecastCount=forecastRows(monitoring.data.datasets.find(d=>d.id==='weather-kl')).length;
const hydro=await loadHydro();
const projectCount=content.articles.filter(a=>a.category==='projects').length;
const pahangCount=content.articles.filter(a=>a.category==='projects' && [a.title,a.summary,a.region,...a.tags].join(' ').toLowerCase().includes('pahang')).length;

// Pages project sites run below the repository name; verify real relative links there.
const base='http://127.0.0.1:4174/AIHOT/';
const server = spawn(process.execPath,[fileURLToPath(new URL('./preview.mjs',import.meta.url))],{stdio:['ignore','pipe','inherit'],env:{...process.env,WATER_WATCH_PORT:'4174',WATER_WATCH_BASE_PATH:'/AIHOT'}});
let buffer='';
const ready=new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('Preview did not start')),30000);
  server.stdout.on('data',data=>{buffer+=data;if(buffer.includes('Preview:')){clearTimeout(timeout);resolve();}});
  server.on('error',reject);
  server.on('exit',code=>{clearTimeout(timeout);reject(new Error(`Preview exited ${code}`));});
});
let browser;
try {
  await ready;
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  assert.equal(await page.locator('.story:visible').count(),content.articles.length);
  if(content.articles.length) assert.equal(await page.locator('.story h3').first().innerText(),`${sortedArticles(content)[0].title} ↗`);
  assert.equal(await page.locator('.forecast-row').count(),forecastCount,'district and territory forecasts must not duplicate days');
  assert.equal(await page.locator('#official').count(),1,'official links have one home');
  assert.ok(!await page.locator('.source-details').evaluate(el=>el.open),'collection diagnostics start collapsed');
  assert.equal(await page.locator('.directory-source:visible').count(),content.sources.length,'every source is visible without opening collection diagnostics');
  assert.ok(!await page.locator('.data-panel').evaluate(el=>el.open),'raw data starts collapsed');
  if(content.articles.length) assert.ok((await page.locator('.story h3').first().boundingBox()).y<650,'news is visible in the first desktop screen');
  await page.screenshot({path:fileURLToPath(new URL('../../.data/water-watch-desktop-viewport.png',import.meta.url))});
  await page.screenshot({path:fileURLToPath(new URL('../../.data/water-watch-desktop.png',import.meta.url)),fullPage:true});
  await page.locator('#category').selectOption('projects');
  assert.equal(await page.locator('.story:visible').count(),projectCount);
  await page.locator('#query').fill('pahang');
  assert.equal(await page.locator('.story:visible').count(),pahangCount);
  await page.locator('#query').fill('nonexistent-search-fixture-791823');
  assert.equal(await page.locator('.story:visible').count(),0);
  assert.ok(await page.locator('#empty').isVisible());
  await page.locator('#reset').click();
  assert.equal(await page.locator('.story:visible').count(),content.articles.length);
  await page.locator('#source').selectOption('nahrim');
  assert.equal(await page.locator('.story:visible').count(),content.articles.filter(a=>a.source==='nahrim').length);
  await page.locator('#reset').click();
  await page.clock.setFixedTime(new Date(`${content.reviewedAt}T12:00:00+08:00`));
  await page.locator('#state').selectOption('sarawak');
  await page.locator('#period').selectOption('7');
  assert.equal(await page.locator('.story:visible').count(),content.articles.filter(a=>matchesNews(a,{state:'sarawak',period:'7'},content.reviewedAt)).length);
  const shared=await page.locator('#share-link').getAttribute('href');
  assert.ok(shared.includes('state=sarawak'));assert.ok(shared.endsWith('#news'));
  const recipient=await browser.newPage();
  await recipient.clock.setFixedTime(new Date(`${content.reviewedAt}T12:00:00+08:00`));
  await recipient.goto(shared);
  assert.equal(await recipient.locator('#state').inputValue(),'sarawak');
  assert.equal(await recipient.locator('#period').inputValue(),'7');
  assert.equal(await recipient.locator('.story:visible').count(),await page.locator('.story:visible').count());
  await recipient.close();
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('#share').click();
  await page.waitForFunction(()=>document.querySelector('#share-status').textContent.includes('已复制'));
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),shared);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Denied'))}}));
  await page.locator('#share').click();
  await page.waitForFunction(()=>document.querySelector('#share-status').textContent.includes('长按'));
  await page.locator('#period').selectOption('unknown');
  assert.equal(await page.locator('.story:visible').count(),content.articles.filter(a=>matchesNews(a,{state:'sarawak',period:'unknown'},content.reviewedAt)).length);
  await page.locator('#reset').click();
  assert.equal(new URL(page.url()).search,'');
  await page.goto(`${base}?keep=1&state=invalid&period=365&query=%3Cscript%3E#news`);
  assert.equal(await page.locator('#state').inputValue(),'');
  assert.equal(await page.locator('#period').inputValue(),'');
  assert.equal(await page.locator('#query').inputValue(),'<script>');
  await page.locator('#reset').click();
  assert.equal(new URL(page.url()).search,'?keep=1');
  await page.evaluate(()=>history.pushState(null,'','?state=pahang#news'));
  await page.goto(`${base}?state=sarawak#news`);
  await page.goBack();
  await page.waitForFunction(()=>document.querySelector('#state').value==='pahang');
  assert.equal(await page.locator('#state').inputValue(),'pahang');
  assert.equal(await page.locator('.story:visible').count(),content.articles.filter(a=>a.states.includes('pahang')).length);
  await page.locator('#reset').click();
  await page.clock.setFixedTime(new Date());
  await page.locator('.story details summary').first().click();
  assert.ok(await page.locator('.story details[open]').first().isVisible());
  await page.locator('.source-details > summary').click();
  assert.equal(await page.locator('.source-card').count(),content.sources.length);
  for(const source of monitoring.collection.sources.filter(source=>source.documentCount>0 && source.pages?.filter(item=>item.kind!=='pdf').every(item=>item.status==='error'))) {
    const card=page.locator('.source-card').filter({has:page.locator(`a[href="${source.url}"]`)});
    assert.match(await card.innerText(),/新闻列表仍不可用/);
    await card.locator('details > summary').click();
    assert.equal(await card.locator('li a').filter({hasText:'官方历史 PDF'}).count(),source.documentCount);
  }
  assert.equal(await page.locator('.dataset').count(),3);
  const dataResponse=await page.request.get(`${base}data.json`);
  assert.equal(dataResponse.status(),200);
  assert.equal((await dataResponse.json()).datasets.length,3);
  for(const file of ['terms.html','privacy.html']) {
    const notice=await page.request.get(`${base}${file}`);
    assert.equal(notice.status(),200);
    assert.ok((await notice.text()).includes('GitHub 账号 Jihkk'));
    assert.equal(await page.locator(`footer a[href="${file}"]`).count(),1);
  }
  await page.locator('.source-details > summary').click();
  if(forecastCount) {
    await page.locator('.forecast-details summary').click();
    assert.equal(await page.locator('.period-day:visible').count(),forecastCount);
    await page.locator('.forecast-details summary').click();
  }
  for(const width of [375,390,768,1024,1440]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${width}px layout must not overflow`);
    await page.locator('.source-details > summary').click();
    await page.locator('.source-card details').evaluateAll(elements=>elements.forEach(element=>{element.open=true;}));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${width}px collection diagnostics must not overflow`);
    await page.locator('.source-details > summary').click();
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:fileURLToPath(new URL('../../.data/water-watch-mobile.png',import.meta.url)),fullPage:true});
  assert.deepEqual(errors,[]);
  const offline=await browser.newPage({javaScriptEnabled:false});
  await page.goto(`${base}projects.html`);
  assert.equal(await page.locator('.project-card').count(),content.projects.length);
  assert.equal(await page.locator('.project-timeline li').count(),content.projects.reduce((sum,p)=>sum+p.articleIds.length,0));
  await page.locator('a[href="tenders.html"]').first().click();
  assert.equal(page.url(),`${base}tenders.html`);
  const tenders=content.articles.filter(article=>article.category==='tenders');
  assert.equal(await page.locator('[data-tender]:visible').count(),tenders.filter(a=>a.tender && tenderStatus(a.tender)!=='closed').length);
  await page.locator('#tender-status').selectOption('all');
  assert.equal(await page.locator('[data-tender]:visible').count(),tenders.length);
  await page.locator('#tender-query').fill('FT234');
  assert.equal(await page.locator('[data-tender]:visible').count(),1);
  assert.match(await page.locator('[data-tender]:visible').innerText(),/强制说明会日期已过/);
  await page.locator('#tender-query').fill('not-a-real-tender-1234');
  assert.ok(await page.locator('#tender-empty').isVisible());
  await page.locator('#tender-reset').click();
  await page.locator('#tender-status').selectOption('closed');
  assert.equal(await page.locator('[data-tender]:visible').count(),tenders.filter(a=>a.tender && tenderStatus(a.tender)==='closed').length);
  for(const file of ['projects.html','tenders.html']) {
    await page.goto(`${base}${file}`);
    for(const width of [375,768,1024,1440]) {
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${file} ${width}px must not overflow`);
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:fileURLToPath(new URL(`../../.data/water-watch-${file.split('.')[0]}.png`,import.meta.url))});
    await offline.goto(`${base}${file}`);
    assert.equal(await offline.locator(file==='projects.html'?'.project-card':'[data-tender]').count(),file==='projects.html'?content.projects.length:tenders.length);
  }
  assert.deepEqual(errors,[]);
  await offline.goto(base);
  assert.equal(await offline.locator('.story').count(),content.articles.length);
  assert.equal(await offline.locator('.forecast-row').count(),forecastCount);
  for(const file of ['style.css','client.js','logo.svg','desk-client.js','industry-desks.mjs','news-filters.mjs']) assert.equal((await page.request.get(`${base}${file}`)).status(),200);
  const noticePage=await browser.newPage({viewport:{width:375,height:844}});
  for(const file of ['terms.html','privacy.html']) {
    await noticePage.goto(`${base}${file}`);
    assert.equal(await noticePage.locator('h1').count(),1);
    assert.ok(await noticePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'public notice must fit a mobile screen');
    await noticePage.locator('a.brand').click();
    assert.equal(noticePage.url(),base,'notice home link must retain the Pages repository prefix');
  }
  await page.goto(`${base}hydro.html`);
  assert.equal(await page.locator('[data-station]').count(),hydro.stations.length);
  await page.locator('#hydro-region').selectOption('WLH');
  await page.locator('#hydro-type').selectOption('level');
  assert.equal(await page.locator('[data-station]:visible').count(),hydro.stations.filter(s=>s.region==='WLH' && s.type==='level').length);
  const levelStation=hydro.stations.find(s=>s.region==='WLH' && s.type==='level');
  await page.locator(`[data-station="${levelStation.key}"] .station-open`).click();
  await page.waitForFunction(name=>document.querySelector('#hydro-detail h2')?.textContent===name,levelStation.name);
  assert.match(await page.locator('#hydro-detail').innerText(),/水位不是流量/);
  assert.equal(await page.locator('#hydro-detail a').getAttribute('href'),levelStation.url);
  const downloadEvent=page.waitForEvent('download');
  await page.locator('#hydro-csv').click();
  const download=await downloadEvent;
  assert.equal(download.suggestedFilename(),'malaysia-water-watch-observations.csv');
  const stream=await download.createReadStream();
  let csv='';for await(const chunk of stream)csv+=chunk.toString('utf8');
  assert.ok(csv.includes('observed_at_UTC+8'));assert.ok(csv.includes(levelStation.name));
  assert.equal(csv.split('\r\n').length,hydro.stations.filter(s=>s.region==='WLH' && s.type==='level').length+1);
  await page.locator('#hydro-query').fill('not-a-real-station-887798');
  assert.ok(await page.locator('#hydro-empty').isVisible());
  await page.locator('#hydro-reset').click();
  assert.equal(await page.locator('[data-station]:visible').count(),hydro.stations.length);
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:fileURLToPath(new URL('../../.data/water-watch-hydro-desktop.png',import.meta.url))});
  for(const width of [375,390,768,1024,1440]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`hydrology ${width}px must not overflow`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:fileURLToPath(new URL('../../.data/water-watch-hydro-mobile.png',import.meta.url))});
  await offline.goto(`${base}hydro.html`);
  assert.equal(await offline.locator('[data-station]').count(),hydro.stations.length);
  for(const file of ['hydro.json','hydro-client.js','hydro-analysis.js'])assert.equal((await page.request.get(`${base}${file}`)).status(),200);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: news, hydro filters/charts/CSV, Pages prefix, mobile layout and no-JS reading');
} finally {
  await browser?.close();
  const exited=once(server,'exit');
  server.kill();
  await exited;
}
