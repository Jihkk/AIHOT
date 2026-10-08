import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {extractCandidates,linkChanges,readPublic,validateRecords,collect,publicCollection,publicData} from '../collector.mjs';
import {validateMonitoring,renderMonitoring} from '../monitoring.mjs';

const page='https://www.water.gov.my/news';
const content={sources:[{id:'jps',name:'JPS',url:page,hosts:['water.gov.my'],description:'Official source'}]};
const config={version:1,sources:[{id:'jps',url:page,kind:'html'}],datasets:[]};
const at=new Date('2026-10-08T03:30:00Z');
const html='<article><header><a href="/news/flood">Flood mitigation works announced in Pahang</a></header></article>';

test('listing extraction preserves article headings and titled PDF downloads but excludes unsafe and navigation links',()=>{
  const links=extractCandidates(`${html}<nav><a href="/nav">Flood mitigation navigation link</a></nav><a href="https://water.gov.my.evil.test/flood">Flood news on an unregistered host</a><a href="javascript:alert(1)">Flood news in a script link</a><a href="/guide.pdf" title="Water resources planning guideline 2026">Download</a>`,page,['water.gov.my']);
  assert.deepEqual(links.map(item=>item.url),['https://www.water.gov.my/guide.pdf','https://www.water.gov.my/news/flood']);
  assert.equal(links[1].title,'Flood mitigation works announced in Pahang');
  const revised=links.map(item=>({...item})).reverse();
  assert.deepEqual(linkChanges(links,revised),[]);
  revised[0].title='Flood mitigation construction award announced';
  assert.equal(linkChanges(links,revised).length,1);
});

test('plain procurement rows retain their listing provenance and distinct tender identities',()=>{
  const table='<table><tr><td>JPS/01/2026</td><td>Flood mitigation works at Sungai Example</td></tr><tr><td>JPS/02/2026</td><td>Water supply project at Sungai Other</td></tr></table>';
  const links=extractCandidates(table,page,['water.gov.my']);
  assert.equal(links.length,2);
  assert.ok(links.every(item=>item.url===page && item.listingOnly));
  assert.notEqual(links[0].key,links[1].key);
  assert.deepEqual(linkChanges(links,extractCandidates(table,page,['water.gov.my'])),[]);
  const revised=extractCandidates(table.replace('JPS/01/2026</td>','JPS/01/2026</td><td>21/10/2026</td>'),page,['water.gov.my']);
  assert.equal(linkChanges(links,revised).length,1,'a table amendment with the same title is still detected');
});

test('fetch validates each redirect before following it and refuses oversized bodies and denied responses',async()=>{
  let calls=0;
  await assert.rejects(readPublic(page,['water.gov.my'],async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.example/'}});}),/HTTPS link/);
  assert.equal(calls,1);
  await assert.rejects(readPublic(page,['water.gov.my'],async()=>new Response('Denied',{status:403})),/HTTP 403/);
  await assert.rejects(readPublic(page,['water.gov.my'],async()=>new Response('Large',{headers:{'content-length':'2000001'}})),/2 MB/);
});

test('a failed or limited collection retains the last successful baseline instead of announcing no news',async()=>{
  const good=await collect(content,config,{}, {now:at,fetchFn:async()=>new Response(html,{headers:{'content-type':'text/html'}})});
  assert.equal(good.sources[0].status,'ok');
  const failed=await collect(content,config,good,{now:new Date(+at+60000),fetchFn:async()=>new Response('Error',{status:503})});
  assert.equal(failed.sources[0].status,'error');
  assert.equal(failed.sources[0].lastSuccessAt,good.checkedAt);
  assert.deepEqual(failed.sources[0].links,good.sources[0].links);
  assert.deepEqual(failed.changed,[]);
  const limited=await collect(content,config,failed,{now:new Date(+at+120000),fetchFn:async()=>new Response('<main>JavaScript required</main>',{headers:{'content-type':'text/html'}})});
  assert.equal(limited.sources[0].status,'limited');
  assert.deepEqual(limited.sources[0].links,good.sources[0].links);
  const recovered=await collect(content,config,limited,{now:new Date(+at+180000),fetchFn:async()=>new Response(html,{headers:{'content-type':'text/html'}})});
  assert.deepEqual(recovered.changed,[]);
  assert.ok(!('links' in publicCollection(good).sources[0]),'candidate intake is not a public news feed');
});

test('official no-advisory records can have null validity; ordinary warnings still require validity',()=>{
  const dataset={id:'weather-warnings',required:['warning_issue','valid_from','valid_to']};
  const advisory={warning_issue:{issued:'2026-10-08T10:30:00',title_en:'No Advisory'},valid_from:null,valid_to:null};
  assert.deepEqual(validateRecords(dataset,[advisory]),[advisory]);
  assert.throws(()=>validateRecords(dataset,[{...advisory,warning_issue:{...advisory.warning_issue,title_en:'Flood warning'}}]));
  assert.throws(()=>validateRecords(dataset,[{warning_issue:{}}]));
});

test('API failures keep old snapshots with their old fetch time and monitoring validates provenance',async()=>{
  const dataset={id:'weather-kl',name:'KL',url:'https://api.data.gov.my/weather/forecast?limit=1',page:'https://developer.data.gov.my/realtime-api/weather',scope:'KL only',required:['location','date','summary_forecast']};
  const cfg={...config,datasets:[dataset]};
  const records=[{location:{location_name:'Kuala Lumpur'},date:'2026-10-08',summary_forecast:'Hujan'}];
  const fetchFn=async url=>new Response(url.includes('api.data.gov.my')?JSON.stringify(records):html,{headers:{'content-type':url.includes('api.data.gov.my')?'application/json':'text/html'}});
  const good=await collect(content,cfg,{}, {now:at,fetchFn});
  const failed=await collect(content,cfg,good,{now:new Date(+at+60000),fetchFn:async url=>url.includes('api.data.gov.my')?new Response('Error',{status:503}):fetchFn(url)});
  assert.equal(failed.datasets[0].status,'error');
  assert.equal(failed.datasets[0].dataFetchedAt,good.checkedAt);
  assert.deepEqual(failed.datasets[0].records,records);
  const report=publicCollection(failed),data=publicData(failed);
  validateMonitoring(content,cfg,report,data);
  const rendered=renderMonitoring(content,{collection:report,data});
  assert.match(rendered,/上次成功的旧快照/);
  assert.match(rendered,/不能据此判断当前风险/);
  const tampered=structuredClone(data);tampered.datasets[0].url='https://evil.example/';
  assert.throws(()=>validateMonitoring(content,cfg,report,tampered));
});

test('every registered official source is included in the collector configuration',async()=>{
  const registered=JSON.parse(await readFile(new URL('../content.json',import.meta.url),'utf8'));
  const configured=JSON.parse(await readFile(new URL('../collection-config.json',import.meta.url),'utf8'));
  assert.deepEqual(new Set(configured.sources.map(s=>s.id)),new Set(registered.sources.map(s=>s.id)));
});
