const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validDay=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const validTime=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(value) && validDay(value.slice(0,10)) && !Number.isNaN(Date.parse(value));

export function validateDesks(content) {
  const articles=new Map(content.articles.map(article=>[article.id,article]));
  const ids=new Set(), assigned=new Set();
  for(const project of content.projects ?? []) {
    if(!/^[a-z0-9-]+$/.test(project.id) || ids.has(project.id))throw new Error('Invalid project id');
    ids.add(project.id);
    for(const field of ['name','region','scope'])if(typeof project[field]!=='string' || !project[field].trim())throw new Error('Invalid project description');
    if(!Array.isArray(project.articleIds) || !project.articleIds.length)throw new Error('Project needs verified articles');
    for(const id of project.articleIds) {
      if(!articles.has(id) || assigned.has(id))throw new Error('Invalid or duplicated project article');
      assigned.add(id);
    }
  }
  for(const article of content.articles)if(article.tender) {
    const tender=article.tender;
    if(article.category!=='tenders' || (tender.reference!==null && (typeof tender.reference!=='string' || !tender.reference.trim())) || typeof tender.evidence!=='string' || !tender.evidence.trim())throw new Error('Invalid tender metadata');
    if(tender.deadline!==null && !validTime(tender.deadline))throw new Error('Tender deadline needs Malaysia timezone');
    if(!validDay(tender.deadlineDate) || (tender.deadline && tender.deadline.slice(0,10)!==tender.deadlineDate))throw new Error('Invalid tender deadline date');
    if(tender.briefing!==null && !validTime(tender.briefing))throw new Error('Invalid briefing time');
    if(!['mandatory','unconfirmed','none'].includes(tender.briefingRequirement))throw new Error('Invalid briefing requirement');
  }
}

export function tenderStatus(tender, now=new Date()) {
  const today=now.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'});
  if(tender.deadline ? +now>=Date.parse(tender.deadline) : today>tender.deadlineDate)return 'closed';
  if(!tender.deadline && today===tender.deadlineDate)return 'verify';
  return 'upcoming';
}

export function tenderTiming(tender, now=new Date()) {
  const status=tenderStatus(tender,now);
  if(status==='closed')return '已过所列截止时间';
  if(status==='verify')return '今天为所列截止日 · 时刻待确认';
  const today=now.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'});
  const days=Math.round((Date.parse(tender.deadlineDate)-Date.parse(today))/86400000);
  return `${days===0?'今天截止':`距所列截止日 ${days} 天`}${tender.deadline?'':' · 时刻待确认'}`;
}

const localTime=value=>value?`${value.slice(0,10)} ${value.slice(11,16)} UTC+8`:'';
const articleDate=article=>article.eventDate ?? article.publishedAt ?? '';

export function projectArticles(project,content) {
  const byId=new Map(content.articles.map(article=>[article.id,article]));
  return project.articleIds.map(id=>byId.get(id)).sort((a,b)=>articleDate(a).localeCompare(articleDate(b)) || a.id.localeCompare(b.id));
}

export function renderProjects(content) {
  const sources=new Map(content.sources.map(source=>[source.id,source.name]));
  return `<section id="news" class="desk-page"><div class="section-heading"><h2>工程项目跟踪</h2><span>${(content.projects ?? []).length} 个项目</span></div><p class="desk-note">按已收录原文归组。时间线使用明示事件日，否则使用发布日期；报道日期不是施工日期。未收录进展不代表工程停滞。</p><div class="project-grid">${(content.projects ?? []).map(project=>`<article class="project-card" id="${escape(project.id)}"><p class="eyebrow">${escape(project.region)}</p><h2>${escape(project.name)}</h2><p>${escape(project.scope)}</p><ol class="project-timeline">${projectArticles(project,content).map(article=>`<li><time>${escape(articleDate(article)||'日期未标明')}</time><small>${article.eventDate?'原文明示事件日':article.publishedAt?'报道发布日期':'日期未确认'} · ${escape(sources.get(article.source))}</small><h3><a href="${escape(article.url)}" target="_blank" rel="noopener noreferrer">${escape(article.title)} ↗</a></h3><p class="timeline-stage">${escape(article.stage)}</p><p>${escape(article.summary)}</p><details><summary>核查依据</summary><p>${escape(article.evidence)}</p><p>${escape(article.dateEvidence)}</p><p>原文查阅 ${escape(article.checkedAt)}</p></details></li>`).join('')}</ol></article>`).join('')}</div></section>`;
}

export function renderTenders(content,now=new Date()) {
  const articles=content.articles.filter(article=>article.category==='tenders').sort((a,b)=>(a.tender?.deadlineDate ?? '9999').localeCompare(b.tender?.deadlineDate ?? '9999'));
  const active=articles.filter(article=>article.tender && tenderStatus(article.tender,now)!=='closed').length;
  return `<section id="news" class="desk-page"><div class="section-heading"><h2>招标与采购</h2><span id="tender-count" role="status" aria-live="polite">${active} 条待核对</span></div><p class="desk-note">倒计时仅按原公告日期计算，不能证明仍可投标或已满足资格。强制说明会、补遗及延期请查原文；每条保留上次实际查阅日期。</p><form class="filters tender-filters" role="search" onsubmit="return false"><label>搜索项目或编号<input id="tender-query" type="search" placeholder="例如 HEC、FT234、Selangor"></label><label>公告截止状态<select id="tender-status"><option value="upcoming">尚未到截止日／当天待核对</option><option value="all">全部记录</option><option value="closed">已过所列截止日</option><option value="unknown">未确认截止日</option></select></label><button id="tender-reset" type="button">重置</button></form><noscript><p>未启用 JavaScript，以下显示全部采购历史，日期按构建时刻计算；请核对官方原文。</p></noscript><div class="tender-list">${articles.map(article=>{
    const t=article.tender,status=t?tenderStatus(t,now):'unknown';
    return `<article class="tender-card" data-tender data-status="${status}" data-deadline="${escape(t?.deadline ?? '')}" data-deadline-date="${escape(t?.deadlineDate ?? '')}" data-briefing="${escape(t?.briefing ?? '')}" data-requirement="${escape(t?.briefingRequirement ?? 'none')}" data-search="${escape([article.title,article.region,t?.reference ?? '',...article.tags].join(' ').toLowerCase())}"><p class="tender-timing" data-timing>${t?escape(tenderTiming(t,now)):'截止日期未确认'}</p><h3><a href="${escape(article.url)}" target="_blank" rel="noopener noreferrer">${escape(article.title)} ↗</a></h3><p class="tender-reference">${escape(t?.reference ?? '编号未录入')}</p><dl><div><dt>公告截止</dt><dd>${escape(t?localTime(t.deadline)||`${t.deadlineDate} · 具体时刻未确认`:'未确认')}</dd></div><div><dt>说明会／现场参观</dt><dd>${escape(t?.briefing?localTime(t.briefing):'未录入 · 请查公告')}<strong data-briefing-note>${t?.briefing && +now>=Date.parse(t.briefing)?(t.briefingRequirement==='mandatory'?'强制说明会日期已过 · 参与条件须核对':'说明会日期已过 · 是否强制须核对'):''}</strong></dd></div><div><dt>实际查阅</dt><dd>${escape(article.checkedAt)} · ${escape(article.region)}</dd></div></dl><p>${escape(article.summary)}</p><details><summary>来源与日期核对</summary><p>${escape(t?.evidence ?? article.evidence)}</p><p>${escape(article.dateEvidence)}</p></details></article>`;
  }).join('')}</div><p id="tender-empty" class="empty" hidden>没有符合条件的收录；不代表目前没有招标。</p></section>`;
}
