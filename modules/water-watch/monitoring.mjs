import { readFile } from 'node:fs/promises';
import { officialUrl } from './official-url.mjs';
import { validateRecords } from './collector.mjs';

const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = value => value ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Kuala_Lumpur',hour12:false})+' UTC+8' : '尚无成功记录';
const instant = value => typeof value==='string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
const read = async (name,fallback) => {
  try{return JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));}
  catch(error){if(error.code==='ENOENT')return fallback;throw error;}
};

export function validateMonitoring(content, config, collection, data) {
  if(collection.version!==1 || data.version!==1 || !Array.isArray(collection.sources) || !Array.isArray(data.datasets)) throw new Error('Invalid monitoring format');
  if(collection.checkedAt!==null && !instant(collection.checkedAt)) throw new Error('Invalid collection timestamp');
  if(data.checkedAt!==null && !instant(data.checkedAt)) throw new Error('Invalid data timestamp');
  const sourceMap=new Map(content.sources.map(s=>[s.id,s]));
  const seen=new Set();
  for(const row of collection.sources) {
    if(!sourceMap.has(row.id) || seen.has(row.id) || !['ok','limited','error'].includes(row.status) || !instant(row.checkedAt)) throw new Error('Invalid source status');
    seen.add(row.id);
    officialUrl(row.url,sourceMap.get(row.id).hosts);
    if(row.lastSuccessAt!==null && !instant(row.lastSuccessAt)) throw new Error('Invalid successful collection date');
    if(row.observedCount!==null && (!Number.isInteger(row.observedCount) || row.observedCount<0 || row.observedCount>100)) throw new Error('Invalid candidate count');
  }
  const datasetMap=new Map(config.datasets.map(d=>[d.id,d]));
  const ids=new Set();
  for(const dataset of data.datasets) {
    if(!datasetMap.has(dataset.id) || ids.has(dataset.id) || !['ok','error'].includes(dataset.status) || !instant(dataset.checkedAt)) throw new Error('Invalid dataset status');
    ids.add(dataset.id);
    const expected=datasetMap.get(dataset.id);
    if(dataset.url!==expected.url || dataset.page!==expected.page) throw new Error('Dataset provenance changed');
    if(dataset.dataFetchedAt!==null && !instant(dataset.dataFetchedAt)) throw new Error('Invalid snapshot time');
    if(!dataset.dataFetchedAt && dataset.records.length) throw new Error('Data without a successful fetch time');
    validateRecords(expected,dataset.records);
  }
  return {collection,data};
}

export async function loadMonitoring(content) {
  const [config,collection,data]=await Promise.all([
    read('./collection-config.json',{datasets:[]}),
    read('./collection.json',{version:1,checkedAt:null,sources:[]}),
    read('./data.json',{version:1,checkedAt:null,datasets:[]}),
  ]);
  return validateMonitoring(content,config,collection,data);
}

export function renderMonitoring(content, monitoring) {
  const collection=monitoring?.collection ?? {sources:[],checkedAt:null};
  const data=monitoring?.data ?? {datasets:[]};
  const rows=new Map(collection.sources.map(row=>[row.id,row]));
  const labels={ok:'发现候选链接',limited:'需核查动态页面',error:'连接失败'};
  const sourceCards=content.sources.map(source=>{
    const row=rows.get(source.id);
    const status=row ? labels[row.status] : '尚未检测';
    const note=row ? row.status==='ok' ? `本次发现 ${row.observedCount} 个候选链接，待核对原文` : row.status==='limited' ? '未识别到候选链接，不代表没有公告' : '本次读取失败，不代表没有公告' : '等待首次核查';
    return `<div class="source-card"><a href="${escape(row?.url ?? source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escape(source.name)} ↗</strong></a><span class="source-status ${escape(row?.status ?? '')}">${escape(status)}</span><p>${escape(source.description)}</p><small>${escape(note)}</small>${row ? `<small>本次检测 ${escape(time(row.checkedAt))}</small>${row.status!=='ok' ? `<small>上次成功 ${escape(time(row.lastSuccessAt))}</small>` : ''}` : ''}</div>`;
  }).join('');
  const datasets=data.datasets.map(dataset=>`<div class="dataset"><div><a href="${escape(dataset.page)}" target="_blank" rel="noopener noreferrer"><strong>${escape(dataset.name)} ↗</strong></a><span class="source-status ${escape(dataset.status)}">${dataset.status==='ok' ? '读取成功' : '本次读取失败'}</span></div><p>${escape(dataset.scope)}</p><small>保留 ${dataset.records.length} 条记录 · 最近成功采集 ${escape(time(dataset.dataFetchedAt))}</small>${dataset.status==='error' && dataset.records.length ? '<p>本次失败，保留的是上次成功的旧快照。</p>' : ''}</div>`).join('');
  return `<section id="monitoring"><div class="section-heading"><h2>官方来源与采集记录</h2><span>${content.sources.length} 个登记来源</span></div><p class="monitor-note">每日 08:30（马来西亚时间）核查。公告链接变化只是选稿线索；连接失败或动态页面不能解释成没有资讯。最近检测：${escape(time(collection.checkedAt))}。</p><details class="source-details"><summary>查看全部来源及读取状态</summary><div class="source-grid">${sourceCards}</div></details><div class="data-panel"><h3>官方数据快照</h3><p class="monitor-note">这些是采集时的记录，页面不会实时刷新。预警记录可能已过期或不完整，不能据此判断当前风险；请核对官方原文与有效期。</p>${datasets || '<p>尚无成功采集的数据快照。</p>'}<p class="data-download"><a href="data.json" download>下载带来源及采集时间的 JSON</a> · <a href="https://data.gov.my/" target="_blank" rel="noopener noreferrer">来源 data.gov.my</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p></div></section>`;
}
