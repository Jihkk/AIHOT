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
    if(row.observedCount!==null && (!Number.isInteger(row.observedCount) || row.observedCount<0 || row.observedCount>1000)) throw new Error('Invalid candidate count');
    if(row.documentCount!==undefined && (!Number.isInteger(row.documentCount) || row.documentCount<0 || row.documentCount>9)) throw new Error('Invalid document count');
    if(row.pages) for(const page of row.pages) officialUrl(page.url,sourceMap.get(row.id).hosts);
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
  const labels={ok:'发现候选链接',limited:'读取范围有限',error:'读取失败'};
  const sourceCards=content.sources.map(source=>{
    const row=rows.get(source.id);
    const status=row ? labels[row.status] : '尚未检测';
    const referenceOnly=row?.documentCount>0 && row.pages?.filter(page=>page.kind!=='pdf').every(page=>page.status==='error');
    const note=referenceOnly ? `已读取 ${row.documentCount} 份官方历史 PDF；新闻列表仍不可用，无法据此发现新公告` : row ? row.status==='ok' ? `本次发现 ${row.observedCount} 个候选链接，待核对原文${row.pages?.length>1 ? `；已查 ${row.pages.length} 个栏目页面` : ''}` : row.status==='limited' ? row.observedCount>0 ? `本次发现 ${row.observedCount} 个候选链接，部分栏目未能完整读取；待核对原文` : '未识别到候选链接，不代表没有公告' : '本次读取失败，不代表没有公告' : '等待首次核查';
    const details=row?.pages?.filter(page=>page.status==='error' || page.kind==='pdf').map(page=>`<li><a href="${escape(page.url)}" target="_blank" rel="noopener noreferrer">${page.kind==='pdf' ? '官方历史 PDF' : '栏目页面'} ↗</a>：${escape(page.status==='error' ? page.error : '已读取附件；不代表新闻列表恢复')}</li>`).join('');
    return `<div class="source-card"><a href="${escape(row?.url ?? source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escape(source.name)} ↗</strong></a><span class="source-status ${escape(row?.status ?? '')}">${escape(status)}</span><p>${escape(source.description)}</p><small>${escape(note)}</small>${row ? `<small>本次检测 ${escape(time(row.checkedAt))}</small>${row.status!=='ok' ? `<small>上次完整读取 ${escape(time(row.lastSuccessAt))}</small>` : ''}` : ''}${details ? `<details><summary>页面读取详情</summary><ul>${details}</ul></details>` : ''}</div>`;
  }).join('');
  const datasets=data.datasets.map(dataset=>`<div class="dataset"><div><a href="${escape(dataset.page)}" target="_blank" rel="noopener noreferrer"><strong>${escape(dataset.name)} ↗</strong></a><span class="source-status ${escape(dataset.status)}">${dataset.status==='ok' ? '读取成功' : '本次读取失败'}</span></div><p>${escape(dataset.scope)}</p><small>保留 ${dataset.records.length} 条记录 · 最近成功采集 ${escape(time(dataset.dataFetchedAt))}</small>${dataset.status==='error' && dataset.records.length ? '<p>本次失败，保留的是上次成功的旧快照。</p>' : ''}</div>`).join('');
  const portals=content.sources.filter(source=>source.portal).map(source=>`<a class="portal" href="${escape(source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escape(source.name)} ↗</strong><span>${escape(source.description)}</span></a>`).join('');
  const directory=content.sources.map(source=>`<a class="directory-source" href="${escape(rows.get(source.id)?.url ?? source.url)}" target="_blank" rel="noopener noreferrer"><strong>${escape(source.name)} ↗</strong><small>${escape(source.description)}</small></a>`).join('');
  return `<section id="official" class="official-section"><span id="monitoring"></span><div class="section-heading"><h2>常用官方入口</h2><span>${content.sources.filter(source=>source.portal).length} 个快捷链接</span></div><p class="monitor-note">水位、最新警情及投标条件，请到原网站核对。下方列出全部登记来源。</p><div class="portals">${portals}</div><div class="section-heading directory-heading"><h3>全部官方来源</h3><span>${content.sources.length} 个登记来源</span></div><div class="source-directory">${directory}</div><details class="source-details"><summary>采集状态 · 最近检测 ${escape(time(collection.checkedAt))}</summary><p class="monitor-note">每日 08:30（马来西亚时间）核查。连接失败或动态页面不能解释成没有公告；识别到候选链接也不代表完整覆盖该站。</p><div class="source-grid">${sourceCards}</div></details><details class="data-panel"><summary>数据出处与原始记录下载</summary><p class="monitor-note">右侧天气、气象公告与水质使用以下快照。预警记录可能已过期或不完整，不能据此判断当前风险；请核对官方原文与有效期。</p>${datasets || '<p>尚无成功采集的数据快照。</p>'}<p class="data-download"><a href="data.json" download>下载带来源及采集时间的 JSON</a> · <a href="https://data.gov.my/" target="_blank" rel="noopener noreferrer">来源 data.gov.my</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p></details></section>`;
}
