import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseHydro,observationTime,numeric,mergeHydro,validateHydro} from '../hydro.mjs';
import {levelAnalysis,rainAnalysis,freshness,levelChart,stationDetail} from '../hydro-analysis.js';

const now=new Date('2026-10-08T17:30:00+08:00');
const config={retentionDays:7,regions:[{id:'SEL',name:'Selangor'}]};
const table=(headers,values,href)=>`<table><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr><tr>${values.map((v,i)=>`<td${i===1?' data-th="Station ID"':''}>${i===(values.length===13?11:7)?`<a href="${href}">${v}</a>`:v}</td>`).join('')}</tr></table>`;
const rainHtml=table(['Total 1 Hour(Now)','Rainfall from Midnight (08/10/2026)',...['02','03','04','05','06','07'].map(d=>`${d}/10/2026`)],['1','0240731RF','Kolam Takungan Sg. Merab (F2)','Sepang','08/10/2026 16:45:00','4.0','0.5','0.0','3.0','0.0','0.0','2.0','2.0'],'/index.php/rf-graph/?stationid=27441');
const levelHtml=table(['Waspada','Bahaya'],['1','3516424','Sg. Selangor di Ampang Pecah','Hulu Selangor','Sungai Selangor','Sg. Selangor','08/10/2026 17:00','51.60','50.10','51.30','51.60','51.90'],'/index.php/wl-graph/?stationid=3516025_');
const sample=(type='level')=>parseHydro(type==='level'?levelHtml:rainHtml,'SEL',type,now)[0];

test('official table parsing preserves graph identity, daily boundaries and distinct rain periods',()=>{
  const s=sample('rain');
  assert.equal(s.id,'0240731RF');assert.equal(s.sourceId,'27441');
  assert.equal(s.latest.oneHour,2);assert.equal(s.latest.sinceMidnight,2);
  assert.deepEqual(s.latest.daily.map(p=>p.value),[4,0.5,0,3,0,0]);
  assert.equal(rainAnalysis(s).sixDayTotal,7.5);
  assert.equal(sample().latest.level,51.6);
  assert.equal(levelAnalysis(sample()).status,'warning');
  assert.throws(()=>parseHydro(rainHtml.replace('Total 1 Hour(Now)','Unspecified rainfall'),'SEL','rain',now));
  assert.throws(()=>parseHydro(rainHtml.replace('02/10/2026','01/10/2026'),'SEL','rain',now));
  assert.throws(()=>parseHydro(levelHtml.replace('/index.php/wl-graph/?stationid=3516025_','https://evil.example/wl-graph/?stationid=123'),'SEL','level',now));
});
test('malformed dates, negative rainfall and missing sentinels are never invented observations',()=>{
  assert.equal(observationTime('31/02/2026 16:45'),null);
  assert.equal(observationTime('08/10/2026 16:45'),'2026-10-08T16:45:00+08:00');
  for(const text of ['-9999.0','-','N/A',''])assert.equal(numeric(text,'level'),null);
  assert.equal(numeric('-0.25','level'),-0.25);assert.equal(numeric('-0.25','rain'),null);
  assert.equal(numeric('0.0','rain'),0);
  const s=sample('rain');s.latest.daily[1].value=null;
  assert.equal(rainAnalysis(s).sixDayTotal,null);
  assert.throws(()=>parseHydro(levelHtml.replace('17:00','18:00'),'SEL','level',now));
});
test('history deduplicates corrections, keeps failures honest and rejects cached regression',()=>{
  const station=sample();
  let result=mergeHydro(null,config,[{region:'SEL',type:'level',stations:[station]}],now);
  const next=sample();next.latest.level=51.65;
  result=mergeHydro(result,config,[{region:'SEL',type:'level',stations:[next]}],now);
  assert.equal(result.stations[0].history.length,1);assert.equal(result.stations[0].history[0].level,51.65);
  const success=result.statuses[0].lastSuccessAt;
  const failed=mergeHydro(result,config,[{region:'SEL',type:'level',error:'HTTP 503'}],new Date(now.getTime()+3600000));
  assert.deepEqual(failed.stations,result.stations);assert.equal(failed.statuses[0].lastSuccessAt,success);assert.equal(failed.statuses[0].status,'error');
  const cached=sample();cached.latest.observedAt='2026-10-08T16:00:00+08:00';
  const kept=mergeHydro(result,config,[{region:'SEL',type:'level',stations:[cached]}],now);
  assert.equal(kept.stations[0].latest.observedAt,'2026-10-08T17:00:00+08:00');
  const trimmed=mergeHydro(result,config,[{region:'SEL',type:'level',error:'offline'}],new Date(now.getTime()+8*86400000));
  assert.equal(trimmed.stations[0].history.length,0);
  validateHydro(result);
  assert.throws(()=>validateHydro({...result,stations:[result.stations[0],result.stations[0]]}));
});
test('water level rate uses actual intervals; gaps and missing thresholds stay unknown',()=>{
  const s=sample();s.history=[{observedAt:'2026-10-08T16:30:00+08:00',level:51.3},{observedAt:s.latest.observedAt,level:s.latest.level}];
  assert.ok(Math.abs(levelAnalysis(s).rate-0.6)<1e-10);assert.ok(Math.abs(levelAnalysis(s).gap+0.3)<1e-10);
  s.history[0].observedAt='2026-10-08T12:00:00+08:00';assert.equal(levelAnalysis(s).rate,null);
  assert.equal((levelChart(s).match(/<polyline/g)??[]).length,2);
  s.latest.thresholds.alert=null;assert.equal(levelAnalysis(s).status,'unknown');
  assert.equal(freshness(s.latest.observedAt,new Date('2026-10-08T20:00:00+08:00')),'stale');
  s.name='<img src=x onerror=alert(1)>';
  assert.ok(!stationDetail(s,now).includes('<img src=x'));
  assert.match(stationDetail(s,new Date('2026-10-08T20:00:00+08:00')),/不能据此判断当前状态/);
});
