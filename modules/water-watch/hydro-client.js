import {stationDetail,freshness,hydroLabels,hydroTime} from './hydro-analysis.js';

const rows=[...document.querySelectorAll('[data-station]')];
const query=document.querySelector('#hydro-query'),region=document.querySelector('#hydro-region'),type=document.querySelector('#hydro-type');
let data;
const snapshot=fetch('hydro.json').then(response=>{if(!response.ok)throw new Error('Snapshot unavailable');return response.json();}).then(value=>{data=value;return value;});
// Report loading failures without an unhandled rejection; server-rendered observations remain readable.
snapshot.catch(()=>{document.querySelector('#hydro-detail').insertAdjacentHTML('beforeend','<p>图表数据读取失败，请重试；下方已保存的站点表仍可阅读。</p>');});
function filter() {
  for(const row of rows)row.hidden=Boolean((region.value && row.dataset.region!==region.value) || (type.value && row.dataset.type!==type.value) || (query.value && !row.dataset.search.includes(query.value.trim().toLowerCase())));
  const count=rows.filter(r=>!r.hidden).length;
  document.querySelector('#hydro-count').textContent=`${count} 个站点`;
  document.querySelector('#hydro-empty').hidden=count>0;
}
for(const input of [query,region,type])input.addEventListener('input',filter);
document.querySelector('#hydro-reset').addEventListener('click',()=>{query.value='';region.value='';type.value='';filter();});
let selected=null;
for(const row of rows)row.querySelector('button').addEventListener('click',async()=>{
  selected=row.dataset.station;
  try {
    const snapshotData=await snapshot;
    if(selected!==row.dataset.station)return;
    const station=snapshotData.stations.find(s=>s.key===selected);
    if(!station)throw new Error('Station unavailable');
    document.querySelector('#hydro-detail').innerHTML=stationDetail(station);
    for(const item of rows)item.classList.toggle('selected-station',item===row);
    document.querySelector('#hydro-detail').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  } catch {document.querySelector('#hydro-count').textContent='图表读取失败，站点表仍可阅读';}
});
function updateAges() {
  for(const item of document.querySelectorAll('[data-hydro-time]')) {
    const time=item.dataset.hydroTime,status=freshness(time);
    item.classList.toggle('outdated',status!=='recent');
    item.textContent=hydroLabels[status]+(item.dataset.levelStatus?' · '+hydroLabels[item.dataset.levelStatus]:' · 观测 '+hydroTime(time || null)+' UTC+8');
  }
}
updateAges();setInterval(updateAges,60000);

document.querySelector('#hydro-csv').addEventListener('click',async()=>{
  try {
    await snapshot;
    const keys=new Set(rows.filter(r=>!r.hidden).map(r=>r.dataset.station));
    // Prevent spreadsheet formula execution when source station names are exported.
    const cell=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
    const body=[['region','type','station_id','source_id','station_name','district','basin','observed_at_UTC+8','one_hour_mm','since_midnight_mm','water_level_m','alert_m','warning_m','danger_m','source_url'],...data.stations.filter(s=>keys.has(s.key)).map(s=>[s.region,s.type,s.id,s.sourceId,s.name,s.district,s.basin,s.latest.observedAt,s.latest.oneHour,s.latest.sinceMidnight,s.latest.level,s.latest.thresholds?.alert,s.latest.thresholds?.warning,s.latest.thresholds?.danger,s.url])].map(row=>row.map(cell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+body],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='malaysia-water-watch-observations.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch {document.querySelector('#hydro-count').textContent='CSV 数据读取失败，请重试';}
});
