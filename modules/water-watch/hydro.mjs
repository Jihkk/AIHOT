import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {officialUrl} from './official-url.mjs';
import {hydroEscape as escape,hydroTime,hydroNumber,freshness,levelAnalysis,hydroLabels,stationDetail} from './hydro-analysis.js';

export const hydroHost='https://publicinfobanjir.water.gov.my';
export function hydroUrl(region,type) {
  if(!/^[A-Z]{3}$/.test(region) || !['rain','level'].includes(type)) throw new Error('Invalid hydrological source');
  return type==='rain' ? `${hydroHost}/wp-content/themes/shapely/agency/searchresultrainfall.php?state=${region}&district=ALL&station=ALL&loginStatus=0&language=1` : `${hydroHost}/aras-air/data-paras-air/aras-air-data/?state=${region}&district=ALL&station=ALL`;
}
export function observationTime(value) {
  const m=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if(!m) return null;
  const iso=`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+08:00`;
  const date=new Date(iso);
  if(!Number.isFinite(date.getTime()) || new Date(date.getTime()+28800000).toISOString().slice(0,19)!==iso.slice(0,19)) return null;
  return iso;
}
const day = value => observationTime(`${value} 00:00:00`)?.slice(0,10) ?? null;
export function numeric(value,type) {
  if(!/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const n=Number(value);
  return n<=-9999 || (type==='rain' && n<0) ? null : n;
}

export function parseHydro(html,region,type,now=new Date()) {
  const dom=load(html),table=dom('table').filter((i,e)=>dom(e).find('td[data-th="Station ID"]').length>0).first();
  const headers=table.find('th').map((i,e)=>dom(e).text().replace(/\s+/g,' ').trim()).get();
  if(type==='rain' && (!headers.includes('Total 1 Hour(Now)') || !headers.some(h=>h.startsWith('Rainfall from Midnight')))) throw new Error('Rainfall table schema changed');
  if(type==='level' && (!headers.includes('Waspada') || !headers.includes('Bahaya'))) throw new Error('Water-level table schema changed');
  const dates=type==='rain'?headers.filter(h=>/^\d{2}\/\d{2}\/\d{4}$/.test(h)).map(day):[];
  const today=type==='rain'?day(headers.find(h=>h.startsWith('Rainfall from Midnight'))?.match(/\((\d{2}\/\d{2}\/\d{4})\)/)?.[1] ?? ''):null;
  if(type==='rain' && (dates.length!==6 || dates.includes(null) || !today || dates.some((d,i)=>Date.parse(d)!==Date.parse(today)-(6-i)*86400000))) throw new Error('Rainfall day boundaries changed');
  const stations=[];
  table.find('tr').each((i,row)=>{
    const cells=dom(row).children('td');
    if(!cells.length) return;
    const values=cells.map((j,e)=>dom(e).text().trim()).get();
    if(values.length!==(type==='rain'?13:12)) throw new Error('Station column count changed');
    const href=cells.find('a[href*="-graph/"]').first().attr('href');
    if(!href || !values[2] || !values[3]) throw new Error('Station identity missing');
    const url=officialUrl(new URL(href,hydroHost).href,['publicinfobanjir.water.gov.my']);
    const sourceId=new URL(url).searchParams.get('stationid');
    if(!sourceId || sourceId.length>100) throw new Error('Station source ID missing');
    const observedAt=observationTime(values[type==='rain'?4:6]);
    if(observedAt && Date.parse(observedAt)>now.getTime()+900000) throw new Error('Future observation rejected');
    const latest=type==='rain'?{observedAt,day:today,daily:dates.map((date,j)=>({date,value:numeric(values[j+5],type)})),sinceMidnight:numeric(values[11],type),oneHour:numeric(values[12],type)}:{observedAt,level:numeric(values[7],type),thresholds:{normal:numeric(values[8],type),alert:numeric(values[9],type),warning:numeric(values[10],type),danger:numeric(values[11],type)}};
    stations.push({key:`${region}:${type}:${sourceId}`,type,region,id:values[1],sourceId,name:values[2],district:values[3],basin:type==='level'?values[4]:null,url,latest,history:[]});
  });
  if(!stations.length || new Set(stations.map(s=>s.key)).size!==stations.length) throw new Error('Empty or duplicate station table');
  return stations;
}

export function mergeHydro(previous,config,results,now=new Date()) {
  const cutoff=now.getTime()-config.retentionDays*86400000;
  const byKey=new Map((previous?.stations ?? []).map(s=>[s.key,structuredClone(s)]));
  const statuses=[];
  for(const result of results) {
    const old=previous?.statuses.find(s=>s.region===result.region && s.type===result.type);
    const success=!result.error;
    if(success) {
      const incomingKeys=new Set(result.stations.map(s=>s.key));
      for(const [key,oldStation] of byKey) if(oldStation.region===result.region && oldStation.type===result.type && !incomingKeys.has(key)) byKey.delete(key);
      for(const current of result.stations) {
        const existing=byKey.get(current.key),points=new Map((existing?.history ?? []).map(p=>[p.observedAt,p]));
        const latest=current.latest;
        if(latest.observedAt) points.set(latest.observedAt,current.type==='rain'?{observedAt:latest.observedAt,oneHour:latest.oneHour,sinceMidnight:latest.sinceMidnight}:{observedAt:latest.observedAt,level:latest.level});
        current.history=[...points.values()].filter(p=>Date.parse(p.observedAt)>=cutoff).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
        // A source returning an older cached reading must not move the latest observation backwards.
        if(existing?.latest.observedAt && latest.observedAt && latest.observedAt<existing.latest.observedAt) current.latest=existing.latest;
        byKey.set(current.key,current);
      }
    }
    statuses.push({region:result.region,type:result.type,url:hydroUrl(result.region,result.type),checkedAt:now.toISOString(),lastSuccessAt:success?now.toISOString():old?.lastSuccessAt ?? null,status:success?'ok':'error',stationCount:success?result.stations.length:old?.stationCount ?? 0,error:result.error ?? null});
  }
  const stations=[...byKey.values()].filter(s=>config.regions.some(r=>r.id===s.region)).map(s=>({...s,history:s.history.filter(p=>Date.parse(p.observedAt)>=cutoff)})).sort((a,b)=>a.key.localeCompare(b.key));
  return {version:1,checkedAt:now.toISOString(),retentionDays:config.retentionDays,regions:config.regions,statuses,stations};
}

export function validateHydro(data) {
  if(data.version!==1 || !Array.isArray(data.stations) || !Array.isArray(data.statuses) || !Array.isArray(data.regions) || !Number.isFinite(Date.parse(data.checkedAt)) || data.retentionDays!==7) throw new Error('Invalid hydrology snapshot');
  const ids=new Set();
  const number=value=>{if(value!==null && !Number.isFinite(value))throw new Error('Invalid observation value');};
  for(const s of data.stations) {
    if(ids.has(s.key) || s.key!==`${s.region}:${s.type}:${s.sourceId}` || !data.regions.some(r=>r.id===s.region) || !['rain','level'].includes(s.type) || typeof s.name!=='string' || !s.name || !Array.isArray(s.history)) throw new Error('Invalid station');
    ids.add(s.key);officialUrl(s.url,['publicinfobanjir.water.gov.my']);
    if(s.latest.observedAt!==null && !Number.isFinite(Date.parse(s.latest.observedAt)))throw new Error('Invalid observation time');
    if(s.type==='rain') {number(s.latest.oneHour);number(s.latest.sinceMidnight);if(s.latest.daily.length!==6)throw new Error('Invalid daily rainfall');for(const p of s.latest.daily)number(p.value);} else {number(s.latest.level);for(const v of Object.values(s.latest.thresholds))number(v);}
    let prior='';
    for(const p of s.history) {if(!Number.isFinite(Date.parse(p.observedAt)) || p.observedAt<=prior)throw new Error('History must have unique ordered observation times');prior=p.observedAt;if(s.type==='rain'){number(p.oneHour);number(p.sinceMidnight);}else number(p.level);}
  }
  for(const s of data.statuses){officialUrl(s.url,['publicinfobanjir.water.gov.my']);if(!['ok','error'].includes(s.status) || !Number.isFinite(Date.parse(s.checkedAt)))throw new Error('Invalid source status');}
  return data;
}
export async function loadHydro() {return validateHydro(JSON.parse(await readFile(new URL('./hydro.json',import.meta.url),'utf8')));}

export function hydroTableRows(stations,now=new Date()) {
  return stations.map(s=>{
    const l=s.latest,age=freshness(l.observedAt,now),analysis=s.type==='level'?levelAnalysis(s):null;
    const status=s.type==='rain'?hydroLabels[age]:`${hydroLabels[age]} · ${hydroLabels[analysis.status]}`;
    return `<tr data-station="${escape(s.key)}" data-region="${escape(s.region)}" data-type="${s.type}" data-search="${escape([s.name,s.id,s.district,s.basin??''].join(' ').toLowerCase())}"><td><button type="button" class="station-open">${escape(s.name)}</button><small>${escape(s.id || '站号未提供')} · ${escape(s.district)}</small></td><td>${s.type==='rain'?'雨量':'水位'}</td><td>${s.type==='rain'?hydroNumber(l.oneHour)+' mm':hydroNumber(l.level,2)+' m'}</td><td>${s.type==='rain'?hydroNumber(l.sinceMidnight)+' mm':hydroNumber(analysis.gap,2)+' m'}</td><td><span class="hydro-age ${age!=='recent'?'outdated':''}" data-hydro-time="${escape(l.observedAt??'')}" data-level-status="${analysis?.status??''}">${escape(status)}</span><small>${escape(hydroTime(l.observedAt))}</small></td></tr>`;
  }).join('');
}

export function renderHydroPage(data) {
  const initial=data.stations.find(s=>s.type==='rain' && s.latest.oneHour>0 && freshness(s.latest.observedAt)==='recent') ?? data.stations[0];
  const e=escape;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>降雨与水位监测 · Malaysia Water Watch</title><link rel="icon" href="logo.svg" type="image/svg+xml"><link rel="stylesheet" href="style.css"><script type="module" src="hydro-client.js"></script></head><body><a class="skip" href="#hydro-stations">跳到站点</a><header><div class="header-inner"><a class="brand" href="./"><img src="logo.svg" width="40" height="40" alt=""><span>Malaysia Water Watch<small>马来西亚水利观察</small></span></a><nav aria-label="主导航"><a href="./">资讯首页</a><a href="hydro.html" aria-current="page">降雨与水位</a><a href="./#official">官方来源</a></nav></div></header><main class="hydro-page"><section class="editorial-intro"><div><p class="eyebrow">RAINFALL · RIVER LEVEL</p><h1>降雨与水位监测</h1><p>第一阶段：${data.regions.map(r=>e(r.name)).join('、')} · Public Infobanjir 公开站点观测</p></div><div class="edition"><span>最后采集尝试</span><strong class="hydro-collected">${e(hydroTime(data.checkedAt))}</strong><small>UTC+8 · ${data.collectionPaused?'定时采集已暂停':'云端每半小时尝试采集'}</small></div></section><p class="data-caution">${data.collectionPaused?'定时采集已暂停，保留已有数据供查看功能。':''}本站显示最近保存的观测快照，不是即时推送或官方预警。页面不会自动刷新；调度可能延迟。观测超过两小时会标记为旧数据，缺测不会当作零。</p><div class="hydro-summary"><span>雨量站 <strong>${data.stations.filter(s=>s.type==='rain').length}</strong></span><span>水位站 <strong>${data.stations.filter(s=>s.type==='level').length}</strong></span><a href="hydro.json" download>下载观测与近七天历史 JSON</a><button id="hydro-csv" type="button">下载当前筛选 CSV</button></div><section class="hydro-detail" id="hydro-detail" aria-live="polite">${initial?stationDetail(initial):'<p>尚未取得有效站点数据，请查看采集状态。</p>'}</section><section id="hydro-stations"><div class="section-heading"><h2>站点观测</h2><span id="hydro-count" role="status">${data.stations.length} 个站点</span></div><form class="filters hydro-filters" onsubmit="return false" role="search"><label>搜索站名、站号或流域<input id="hydro-query" type="search" placeholder="例如 Klang、Bernam、Gombak"></label><label>地区<select id="hydro-region"><option value="">全部地区</option>${data.regions.map(r=>`<option value="${e(r.id)}">${e(r.name)}</option>`).join('')}</select></label><label>观测类型<select id="hydro-type"><option value="">雨量与水位</option><option value="rain">雨量</option><option value="level">水位</option></select></label><button type="button" id="hydro-reset">重置</button></form><noscript><p>未启用 JavaScript，仍可阅读全部站点和初始图表；切换图表、筛选与 CSV 下载需要 JavaScript。</p></noscript><div class="hydro-table-scroll" tabindex="0" role="region" aria-label="站点观测表，可横向滚动"><table class="hydro-table"><thead><tr><th>站点</th><th>类型</th><th>一小时雨量 / 水位</th><th>当天雨量 / 距关注阈值</th><th>数据状态与观测时间 UTC+8</th></tr></thead><tbody>${hydroTableRows(data.stations)}</tbody></table></div><p id="hydro-empty" hidden>没有符合筛选的站点；这不代表当地无雨或没有洪水。</p></section><details class="source-details"><summary>采集状态与计算说明</summary>${data.statuses.map(s=>`<p>${e(data.regions.find(r=>r.id===s.region)?.name??s.region)} · ${s.type==='rain'?'雨量':'水位'}：${s.status==='ok'?'读取成功':'读取失败，保留上次数据'} · ${s.stationCount} 个站点 · 最后成功 ${e(hydroTime(s.lastSuccessAt))}${s.error?' · '+e(s.error):''}</p>`).join('')}<p>雨量来自官方“Total 1 Hour(Now)”、午夜起累计及六天日雨量栏，不以天气预报估计雨量。最近一小时值不能逐次相加成三小时或滚动二十四小时。</p><p>水位阈值采用官方各站值，状态为本站按数值比较，不能取代官方警情。距关注阈值 = 关注阈值 − 水位，负值表示已超过该阈值。变化率 = 两次水位差 ÷ 实际观测间隔，只在有效间隔不超过两小时时计算。</p><p>历史按官方观测时间去重保存最近七天；同一时间的官方修正覆盖旧值。缺测和 -9999 哨兵值保存为空，不插值。本站尚未接入蒸发或实测流量，也未进行模型预测。</p><p>来源：<a href="${hydroHost}/hujan/data-hujan/?state=SEL&lang=en" target="_blank" rel="noopener noreferrer">Public Infobanjir 雨量 ↗</a> · <a href="${hydroHost}/aras-air/data-paras-air/?state=SEL&lang=en" target="_blank" rel="noopener noreferrer">官方水位 ↗</a>。公开遥测可能有延迟、错误或校正，不作为经过质量审核的设计资料。</p></details></main><footer><span>Malaysia Water Watch · 来源：JPS Public Infobanjir</span><span><a href="./">资讯首页</a> · <a href="terms.html">使用规则</a> · <a href="privacy.html">隐私说明</a></span></footer></body></html>`;
}
