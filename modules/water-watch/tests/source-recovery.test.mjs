import assert from 'node:assert/strict';
import {test} from 'node:test';
import {recoverSource} from '../source-recovery.mjs';
import {publicCollection} from '../collector.mjs';

const url='https://jps.penang.gov.my/index.php/ms/';
const content={sources:[{id:'jps-penang',hosts:['jps.penang.gov.my']}],articles:[]};
const config={version:1,sources:[{id:'jps-penang',url,kind:'html'}],datasets:[]};
const previous={version:1,checkedAt:'2026-10-09T03:00:00Z',sources:[{id:'jps-penang',lastSuccessAt:'2026-10-08T03:00:00Z',links:[{url:url+'old',title:'Old flood mitigation announcement'}]},{id:'other',checkedAt:'2026-10-08T03:00:00Z'}],datasets:[{id:'weather-kl',dataFetchedAt:'2026-10-08T03:00:00Z',records:[{date:'2026-10-08'}]}]};

test('single-source recovery changes only its source, retains cycle/data timestamps, and records reader provenance',async()=>{
  let calls=0;
  const result=await recoverSource(content,config,previous,'jps-penang',{reader:'github-actions',now:new Date('2026-10-09T10:00:00Z'),fetchFn:async target=>{
    calls++;assert.equal(target,url);
    return new Response('<a href="/flood">Flood mitigation project update in Penang</a>',{headers:{'content-type':'text/html'}});
  }});
  assert.equal(calls,1);assert.equal(result.row.status,'ok');
  assert.equal(result.state.checkedAt,previous.checkedAt);
  assert.deepEqual(result.state.datasets,previous.datasets);
  assert.equal(result.state.sources[1],previous.sources[1]);
  assert.equal(result.row.lastSuccessAt,'2026-10-09T10:00:00.000Z');
  assert.equal(publicCollection(result.state).sources[0].reader,'github-actions');
});

test('recovery does not retry access denials or fake success and cannot target an unregistered host',async()=>{
  let calls=0;
  const result=await recoverSource(content,config,previous,'jps-penang',{fetchFn:async()=>{calls++;return new Response('Denied',{status:403});}});
  assert.equal(calls,1);assert.equal(result.row.status,'error');
  assert.deepEqual(result.row.links,previous.sources[0].links);
  assert.equal(result.row.lastSuccessAt,previous.sources[0].lastSuccessAt);
  await assert.rejects(recoverSource(content,config,previous,'unknown'),/registered source/);
  await assert.rejects(recoverSource(content,{...config,sources:[{...config.sources[0],url:'https://evil.test/'}]},previous,'jps-penang'),/HTTPS link/);
});
