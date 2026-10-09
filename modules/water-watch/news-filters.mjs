export const STATES = [
  ['national','全国 / Malaysia'], ['johor','柔佛 / Johor'], ['kedah','吉打 / Kedah'],
  ['kelantan','吉兰丹 / Kelantan'], ['melaka','马六甲 / Melaka'], ['negeri-sembilan','森美兰 / Negeri Sembilan'],
  ['pahang','彭亨 / Pahang'], ['perak','霹雳 / Perak'], ['perlis','玻璃市 / Perlis'],
  ['pulau-pinang','槟城 / Pulau Pinang'], ['sabah','沙巴 / Sabah'], ['sarawak','砂拉越 / Sarawak'],
  ['selangor','雪兰莪 / Selangor'], ['terengganu','登嘉楼 / Terengganu'],
  ['kuala-lumpur','吉隆坡 / Kuala Lumpur'], ['putrajaya','布城 / Putrajaya'], ['labuan','纳闽 / Labuan'],
];
export const PERIODS = [['7','最近 7 天'],['30','最近 30 天'],['unknown','日期未确认']];
export const FILTER_KEYS = ['query','category','source','state','period'];
const stateKeys = new Set(STATES.map(([key])=>key));
const periodKeys = new Set(PERIODS.map(([key])=>key));
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const validDay = value => typeof value==='string' && dayPattern.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
export const malaysiaDay = (now=new Date()) => now.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'});
export const articleDay = article => article.publishedAt || article.eventDate || '';

export function validateStates(states) {
  if (!Array.isArray(states) || !states.length || states.some(key=>!stateKeys.has(key)) || new Set(states).size!==states.length) throw new Error('Invalid article states');
}

export function matchesNews(article, filters={}, today=malaysiaDay()) {
  const search = article.search ?? [article.title,article.summary,article.region,...article.tags].join(' ').toLowerCase();
  const date = articleDay(article);
  if (filters.category && article.category!==filters.category || filters.source && article.source!==filters.source || filters.state && !article.states?.includes(filters.state) || filters.query && !search.includes(filters.query.trim().toLowerCase())) return false;
  if (!filters.period) return true;
  if (filters.period==='unknown') return !validDay(date);
  if (!['7','30'].includes(filters.period) || !validDay(date) || !validDay(today)) return false;
  // A recent window includes today in Malaysia, never a review date or future event.
  const age=(Date.parse(today)-Date.parse(date))/86400000;
  return age>=0 && age<Number(filters.period);
}

export function readFilters(url, choices) {
  const values=Object.fromEntries(FILTER_KEYS.map(key=>[key,url.searchParams.get(key) ?? '']));
  for (const key of ['category','source']) if (!choices[key].includes(values[key])) values[key]='';
  if (!stateKeys.has(values.state)) values.state='';
  if (!periodKeys.has(values.period)) values.period='';
  return values;
}

export function filterUrl(url, filters) {
  const result=new URL(url);
  for (const key of FILTER_KEYS) {
    const value=filters[key]?.trim();
    if (value) result.searchParams.set(key,value); else result.searchParams.delete(key);
  }
  return result;
}
