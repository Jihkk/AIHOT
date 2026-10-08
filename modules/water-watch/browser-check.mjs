import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { loadContent, sortedArticles } from './publication.mjs';

const content=await loadContent();
const projectCount=content.articles.filter(a=>a.category==='projects').length;
const pahangCount=content.articles.filter(a=>a.category==='projects' && [a.title,a.summary,a.region,...a.tags].join(' ').toLowerCase().includes('pahang')).length;

const server = spawn(process.execPath,[fileURLToPath(new URL('./preview.mjs',import.meta.url))],{stdio:['ignore','pipe','inherit']});
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
  await page.goto('http://127.0.0.1:4173');
  assert.equal(await page.locator('.story:visible').count(),content.articles.length);
  if(content.articles.length) assert.equal(await page.locator('.story h3').first().innerText(),`${sortedArticles(content)[0].title} ↗`);
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
  await page.locator('details summary').first().click();
  assert.ok(await page.locator('details[open]').first().isVisible());
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),'mobile layout must not overflow');
  await page.screenshot({path:fileURLToPath(new URL('../../.data/water-watch-mobile.png',import.meta.url)),fullPage:true});
  assert.deepEqual(errors,[]);
  const offline=await browser.newPage({javaScriptEnabled:false});
  await offline.goto('http://127.0.0.1:4173');
  assert.equal(await offline.locator('.story').count(),content.articles.length);
  console.log('Browser checks passed: ordering, combined filters, reset, empty states, provenance, mobile layout, no-JS reading');
} finally {
  await browser?.close();
  const exited=once(server,'exit');
  server.kill();
  await exited;
}
