// Shared by the collector, static renderer and browser; no model service is involved.
export function freshness(observedAt, now = new Date()) {
  if (!observedAt) return 'missing';
  const age = (now.getTime() - Date.parse(observedAt)) / 3600000;
  return !Number.isFinite(age) || age < -0.25 ? 'invalid' : age > 2 ? 'stale' : 'recent';
}

export function levelAnalysis(station) {
  const {level, thresholds, observedAt} = station.latest;
  const valid = level !== null && thresholds && ['alert','warning','danger'].every(k => Number.isFinite(thresholds[k])) && thresholds.alert < thresholds.warning && thresholds.warning < thresholds.danger;
  const status = !valid ? 'unknown' : level >= thresholds.danger ? 'danger' : level >= thresholds.warning ? 'warning' : level >= thresholds.alert ? 'alert' : 'normal';
  const previous = station.history.filter(p => p.observedAt < observedAt && p.level !== null).at(-1);
  const hours = previous ? (Date.parse(observedAt) - Date.parse(previous.observedAt)) / 3600000 : null;
  // Widely separated snapshots do not describe a current rate of rise.
  const rate = level !== null && hours > 0 && hours <= 2 ? (level - previous.level) / hours : null;
  return {status, gap:valid ? thresholds.alert - level : null, rate, hours};
}

export function rainAnalysis(station) {
  const daily = station.latest.daily;
  const complete = daily.length === 6 && daily.every(p => p.value !== null);
  return {sixDayTotal:complete ? daily.reduce((sum,p) => sum + p.value,0) : null, wetDays:complete ? daily.filter(p => p.value > 0).length : null};
}

export const hydroLabels = {normal:'低于关注阈值',alert:'达到关注阈值',warning:'达到警戒阈值',danger:'达到危险阈值',unknown:'阈值或读数缺失',recent:'近期观测',stale:'观测超过 2 小时',missing:'观测时间缺失',invalid:'观测时间异常'};
export const hydroTime = value => value ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Kuala_Lumpur',hour12:false}) : '未提供';
export const hydroNumber = (value,digits=1) => value === null || value === undefined ? '缺测' : Number(value).toFixed(digits);
export const hydroEscape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function rainChart(station) {
  const rows = [...station.latest.daily,{date:station.latest.day,value:station.latest.sinceMidnight}];
  const max = Math.max(1,...rows.map(p=>p.value ?? 0));
  return `<div class="rain-bars" role="img" aria-label="过去六天完整日雨量与当天截至观测时的累计雨量">${rows.map((p,i)=>`<div><strong>${hydroNumber(p.value)}</strong><span class="rain-bar-track"><span class="rain-bar ${i===6?'partial-day':''}" style="height:${p.value===null?0:Math.max(1,p.value/max*100)}%"></span></span><small>${hydroEscape(p.date.slice(5))}${i===6?'*':''}</small></div>`).join('')}</div>`;
}

export function levelChart(station) {
  const rows = station.history;
  const valid = rows.filter(p=>p.level!==null);
  if (!valid.length) return '<p>尚无有效水位观测。</p>';
  const minTime = Math.min(...rows.map(p=>Date.parse(p.observedAt)));
  const maxTime = Math.max(minTime+3600000,...rows.map(p=>Date.parse(p.observedAt)));
  const low = Math.min(...valid.map(p=>p.level)), high = Math.max(...valid.map(p=>p.level));
  const pad = Math.max(0.1,(high-low)*0.15), yMin=low-pad, yMax=high+pad;
  const point = p => [52+(Date.parse(p.observedAt)-minTime)/(maxTime-minTime)*520,200-(p.level-yMin)/(yMax-yMin)*170];
  const segments=[];
  let segment=[];
  for(const p of rows) {
    if(p.level===null || (segment.length && Date.parse(p.observedAt)-Date.parse(segment.at(-1).observedAt)>7200000)) {if(segment.length)segments.push(segment);segment=[];}
    if(p.level!==null)segment.push(p);
  }
  if(segment.length)segments.push(segment);
  return `<svg class="level-chart" viewBox="0 0 610 250" role="img" aria-label="水位观测过程线，单位米；缺测或超过两小时的间隔断开"><path d="M52 20V200H580" fill="none" stroke="#aab9af"/><text x="4" y="32">${hydroNumber(yMax,2)}</text><text x="4" y="200">${hydroNumber(yMin,2)}</text><text x="52" y="225">${hydroEscape(hydroTime(rows[0].observedAt))}</text><text x="580" y="244" text-anchor="end">${hydroEscape(hydroTime(rows.at(-1).observedAt))}</text>${segments.map(s=>`<polyline points="${s.map(point).map(p=>p.join(',')).join(' ')}" fill="none" stroke="#096c62" stroke-width="2"/>`).join('')}${valid.map(p=>{const [x,y]=point(p);return `<circle cx="${x}" cy="${y}" r="3" fill="#096c62"><title>${hydroEscape(hydroTime(p.observedAt))} · ${hydroNumber(p.level,2)} m</title></circle>`;}).join('')}</svg>`;
}

export function stationDetail(station,now=new Date()) {
  const e=hydroEscape, latest=station.latest;
  const old=freshness(latest.observedAt,now)!=='recent';
  const analysis=station.type==='rain'?rainAnalysis(station):levelAnalysis(station);
  const metrics=station.type==='rain'
    ? `<div><span>最近一小时 · 官方值</span><strong>${hydroNumber(latest.oneHour)} mm</strong></div><div><span>当天累计 · 截至观测时</span><strong>${hydroNumber(latest.sinceMidnight)} mm</strong></div><div><span>过去六个完整日</span><strong>${hydroNumber(analysis.sixDayTotal)} mm</strong></div>`
    : `<div><span>水位 · 官方值</span><strong>${hydroNumber(latest.level,2)} m</strong></div><div><span>关注阈值减水位</span><strong>${hydroNumber(analysis.gap,2)} m</strong></div><div><span>相邻观测平均变化${analysis.hours?' · '+hydroNumber(analysis.hours,2)+' h':''}</span><strong>${hydroNumber(analysis.rate,3)} m/h</strong></div>`;
  return `<h2>${e(station.name)}</h2><p class="panel-note">${e(station.id || '官方站号未提供')} · ${e(station.district)}${station.basin?' · '+e(station.basin):''} · <a href="${e(station.url)}" target="_blank" rel="noopener noreferrer">官方站点图表 ↗</a></p><p class="hydro-age ${old?'outdated':''}" data-hydro-time="${e(latest.observedAt ?? '')}">${e(hydroLabels[freshness(latest.observedAt,now)])} · 观测 ${e(hydroTime(latest.observedAt))} UTC+8</p><div class="hydro-metrics">${metrics}</div>${station.type==='rain'?rainChart(station):levelChart(station)}${station.type==='rain'?'<p class="panel-note">* 当天尚未结束。日累计不是滚动 24 小时雨量；最近一小时值有重叠，不能逐次相加。缺测日不参与完整累计。</p>':`<p class="panel-note">按该站阈值比较：${e(hydroLabels[analysis.status])}。${old?'观测已旧或时间异常，不能据此判断当前状态。':''}关注 / 警戒 / 危险：${['alert','warning','danger'].map(k=>hydroNumber(latest.thresholds[k],2)).join(' / ')} m。</p><p class="panel-note">水位不是流量。曲线仅保存接入后的官方时间点；缺测或超过两小时的间隔断开，不插值。${station.history.filter(p=>p.level!==null).length<2?'目前只有一个有效时间点，趋势尚未形成。':''} 变化率为相邻观测的平均值。</p>`}`;
}
