const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = value => value ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Kuala_Lumpur',hour12:false})+' UTC+8' : '尚未成功读取';
const forecasts = new Map([
  ['Tiada Hujan','无雨'], ['Jerebu','霾'], ['Hujan di beberapa tempat','局部有雨'],
  ['Ribut petir di beberapa tempat','局部雷雨'], ['Hujan','有雨'], ['Ribut petir','雷雨'],
]);
const weather = value => forecasts.get(value) ?? value ?? '未提供';
const temperature = value => Number.isFinite(value) ? `${value}°` : '—';
const warningTitles=new Map([['Strong Winds and Rough Seas Warning','强风与海浪警报'],['Thunderstorms Warning','雷暴警报'],['No Advisory','专项通告记录：No Advisory']]);

export function forecastRows(dataset) {
  // The API returns both district and federal-territory forecasts; never merge their days.
  const records=dataset?.records ?? [];
  const location=records.find(row=>row.location?.location_id==='Ds058')?.location ?? records[0]?.location;
  if(!location) return [];
  return records.filter(row=>row.location?.location_id===location.location_id).sort((a,b)=>a.date.localeCompare(b.date));
}

export function renderWeather(data) {
  const dataset=data?.datasets.find(d=>d.id==='weather-kl');
  const rows=forecastRows(dataset);
  const first=rows[0];
  const icon='<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M13 30a9 9 0 0 1-1-18 12 12 0 0 1 23 3 8 8 0 0 1 0 15H13Z" stroke="currentColor" stroke-width="2"/></svg>';
  return `<section id="weather" class="weather-panel"><div class="panel-heading"><h2>吉隆坡天气</h2><span>METMalaysia</span></div><p class="snapshot-label" data-snapshot-at="${escape(dataset?.dataFetchedAt ?? '')}">预报快照 · ${escape(time(dataset?.dataFetchedAt))}</p>${dataset?.status==='error' ? '<p class="data-caution">本次读取失败，以下保留上次数据。</p>' : ''}${first ? `<div class="weather-main">${icon}<div><span class="weather-date">${escape(first.date)} · 首个预报日</span><strong>${escape(temperature(first.min_temp))}–${escape(temperature(first.max_temp))}<small>C</small></strong><span>${escape(weather(first.summary_forecast))}</span></div></div><div class="forecast-list">${rows.map(row=>`<div class="forecast-row"><time datetime="${escape(row.date)}">${escape(row.date.slice(5).replace('-','/'))}</time><span title="${escape(row.summary_forecast)}">${escape(weather(row.summary_forecast))}</span><strong>${escape(temperature(row.min_temp))} / ${escape(temperature(row.max_temp))}</strong></div>`).join('')}</div><details class="forecast-details"><summary>查看上午、下午及夜间预报</summary><div class="forecast-periods">${rows.map(row=>`<div class="period-day"><strong>${escape(row.date)}</strong>${[['上午','morning_forecast'],['下午','afternoon_forecast'],['夜间','night_forecast']].map(([label,key])=>`<p><span>${label}</span><span title="${escape(row[key])}">${escape(weather(row[key]))}</span></p>`).join('')}</div>`).join('')}</div></details><p class="panel-note">地区：${escape(first.location.location_name)}。中文译文供阅读，悬停可看马来文；未识别词保留原文。页面不会实时刷新。</p>` : '<p>暂时没有可展示的预报，请到官网查看。</p>'}<a class="panel-link" href="https://www.met.gov.my/" target="_blank" rel="noopener noreferrer">前往气象局核对最新预报 ↗</a></section>`;
}

export function renderWarnings(data) {
  const dataset=data?.datasets.find(d=>d.id==='weather-warnings');
  const groups=new Map();
  for(const record of dataset?.records ?? []) {
    const issue=record.warning_issue;
    const key=JSON.stringify([issue.issued,issue.title_en]);
    if(!groups.has(key)) groups.set(key,{...issue,periods:[]});
    groups.get(key).periods.push([record.valid_from,record.valid_to]);
  }
  return `<section class="warning-panel"><div class="panel-heading"><h2>气象公告</h2><span>采集时记录</span></div><p class="panel-note">当前警情以气象局为准。以下仅列采集记录，可能已更新或失效。</p>${[...groups.values()].sort((a,b)=>b.issued.localeCompare(a.issued)).slice(0,3).map(issue=>`<div class="warning-record"><strong>${escape(warningTitles.get(issue.title_en) ?? issue.title_en ?? issue.title_bm)}</strong><small>${escape(issue.title_en ?? issue.title_bm)} · 原发布时间 ${escape(issue.issued.replace('T',' '))}（马来西亚时间）</small><details><summary>查看原列有效期</summary>${issue.periods.map(([from,to])=>from && to ? `<p class="panel-note">${escape(from.replace('T',' '))} 至 ${escape(to.replace('T',' '))}（马来西亚时间）</p>` : '<p class="panel-note">此条记录未列有效期；No Advisory 标签不代表没有其他预警。</p>').join('')}</details></div>`).join('') || '<p>暂无已读取记录；这不代表没有预警。</p>'}<a class="panel-link" href="https://www.met.gov.my/" target="_blank" rel="noopener noreferrer">查看官方最新预警 ↗</a></section>`;
}

export function renderWaterQuality(data) {
  const dataset=data?.datasets.find(d=>d.id==='water-pollution');
  const latest=[...new Set(dataset?.records.map(row=>row.date) ?? [])].sort().at(-1);
  const rows=dataset?.records.filter(row=>row.date===latest && row.measure==='nh3n') ?? [];
  const values=['clean','slightly__polluted','polluted'].map(status=>rows.find(row=>row.status===status));
  const labels=['清洁','轻度污染','污染'];
  const complete=values.every(Boolean);
  return `<section class="quality-panel"><div class="panel-heading"><h2>流域水质</h2><span>年度数据</span></div>${complete ? `<p class="quality-year">${escape(latest.slice(0,4))}<span>年 · 氨氮 NH₃-N 单项分类</span></p><div class="quality-counts">${values.map((row,i)=>`<div><strong>${row.n_basins}</strong><span>${labels[i]}</span></div>`).join('')}</div><p class="panel-note">${values[0].basins_monitored} 个监测流域，按氨氮指标分类，不代表综合 WQI 或实时水质。</p>` : '<p class="panel-note">当前快照未提供完整年度分类。</p>'}${dataset?.status==='error' ? '<p class="data-caution">本次读取失败，保留上次数据。</p>' : ''}<a class="panel-link" href="https://data.gov.my/data-catalogue/water_pollution_basin" target="_blank" rel="noopener noreferrer">查看 DOE 年度统计 ↗</a></section>`;
}

export function renderReaderPanels(monitoring) {
  return `${renderWeather(monitoring?.data)}${renderWarnings(monitoring?.data)}${renderWaterQuality(monitoring?.data)}`;
}
