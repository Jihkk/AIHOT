import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { officialUrl } from './official-url.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize = value => value.replace(/\s+/g, ' ').trim();
const topic = /\b(?:water|flood|banjir|hujan|empangan|sungai|river|drainage|saliran|tender|quotation|hydrolog\w*|monsoon|monsun|iwrm|irbm|rtb|eia|pollut\w*|air)\b|sebut harga|garis panduan|pencemaran|bekalan/i;
const navigation = /^(?:home|utama|read (?:all|more)|view (?:all|more)|download|muat turun|tender|news|berita|kenyataan media|press release|contact us|about us|public infobanjir|privacy policy|water resources|tender notices)$/i;

export function extractCandidates(html, pageUrl, hosts) {
  const $ = load(html);
  $('script,style,noscript,footer,nav').remove();
  const found = new Map();
  $('a[href]').each((_index, element) => {
    const anchor = $(element);
    if (anchor.closest('th, [class*="menu"], [id*="menu"], [class*="navbar"]').length) return;
    const title = normalize(navigation.test(normalize(anchor.text())) && anchor.attr('title') ? anchor.attr('title') : anchor.text());
    if (title.length < 18 || title.length > 400 || navigation.test(title) || !topic.test(title)) return;
    try {
      const url = new URL(anchor.attr('href'), pageUrl);
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(key)) url.searchParams.delete(key);
      officialUrl(url.href, hosts);
      if (/\/(?:login|sign-?in)(?:\/|$)/i.test(url.pathname)) return;
      if (url.href === new URL(pageUrl).href || /\.(?:png|jpe?g|gif|svg|css|js)$/i.test(url.pathname)) return;
      // Keep the most informative title when a listing repeats the same link.
      if (!found.has(url.href) || found.get(url.href).title.length < title.length) found.set(url.href, {url:url.href,title});
    } catch { /* Off-site, credentialed and non-HTTPS links are not intake candidates. */ }
  });
  // Some official procurement tables publish the title as plain text, without an article link.
  // Preserve the listing URL and a separate row identity; do not invent a document URL.
  $('table tr').each((_index,element)=>{
    const row=$(element);
    const cells=row.children('td').toArray().map(cell=>normalize($(cell).text()));
    const title=cells.filter(value=>value.length>=25 && value.length<=500 && topic.test(value)).sort((a,b)=>b.length-a.length)[0];
    if(!title) return;
    const listingText=cells.join(' | ').slice(0,1200);
    const rowUrls=row.find('a[href]').toArray().map(anchor=>{try{return new URL($(anchor).attr('href'),pageUrl).href;}catch{return null;}});
    const matching=[...found.values()].find(item=>rowUrls.includes(item.url));
    if(matching) {matching.listingText=listingText;return;}
    // A linked project that failed the topical filter should not re-enter through table metadata.
    if(row.find('a[href]').toArray().some(anchor=>normalize($(anchor).text()).length>=18)) return;
    const serial=cells.find(value=>value.length>=8 && value.length<=100 && /\//.test(value) && /^[\w/().\s-]+$/.test(value));
    const key=`${pageUrl}::row:${digest(serial ?? title).slice(0,16)}`;
    found.set(key,{url:pageUrl,key,title,listingText,listingOnly:true});
  });
  return [...found.values()].sort((a,b)=>(a.key ?? a.url).localeCompare(b.key ?? b.url)).slice(0,100);
}

export function linkChanges(previous, current) {
  const signature=item=>digest([item.title,item.listingText ?? '']);
  const old = new Map((previous ?? []).map(item=>[item.key ?? item.url,signature(item)]));
  return current.filter(item=>old.get(item.key ?? item.url)!==signature(item));
}

export async function readPublic(url, hosts, fetchFn = fetch) {
  officialUrl(url, hosts);
  const signal = AbortSignal.timeout(25000);
  for (let redirects=0;redirects<5;redirects++) {
    const response = await fetchFn(url,{redirect:'manual',signal,headers:{'User-Agent':'MalaysiaWaterWatch/1.0 (+https://github.com/Jihkk/AIHOT)','Accept':'text/html,application/json;q=0.9'}});
    if ([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location');
      await response.body?.cancel();
      if(!location) throw new Error('Redirect without location');
      url=officialUrl(new URL(location,url).href,hosts);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    if (Number(response.headers.get('content-length')) > 2_000_000) { await response.body?.cancel(); throw new Error('Response exceeds 2 MB'); }
    if (!response.body) throw new Error('Empty response');
    const reader=response.body.getReader();
    const chunks=[]; let bytes=0;
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      bytes+=value.length;
      if(bytes>2_000_000) {await reader.cancel();throw new Error('Response exceeds 2 MB');}
      chunks.push(value);
    }
    return {url,type:response.headers.get('content-type') ?? '',text:Buffer.concat(chunks).toString('utf8')};
  }
  throw new Error('Too many redirects');
}

export function validateRecords(dataset, value) {
  if(!Array.isArray(value) || value.length>100) throw new Error('Expected at most 100 data records');
  for(const record of value) {
    if(!record || typeof record!=='object' || Array.isArray(record) || dataset.required.some(key=>record[key]===undefined || (record[key]===null && !(dataset.id==='weather-warnings' && ['valid_from','valid_to'].includes(key))))) throw new Error('Official data schema changed');
    if(dataset.id==='weather-kl' && (typeof record.location?.location_name!=='string' || !/Kuala Lumpur/i.test(record.location.location_name) || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || typeof record.summary_forecast!=='string')) throw new Error('Invalid Kuala Lumpur forecast');
    if(dataset.id==='weather-warnings') {
      const noAdvisory=record.warning_issue?.title_en==='No Advisory' || record.warning_issue?.title_bm==='Tiada Nasihat';
      if(typeof record.warning_issue!=='object' || Number.isNaN(Date.parse(record.warning_issue.issued)) || ['valid_from','valid_to'].some(key=>!(noAdvisory && record[key]===null) && (typeof record[key]!=='string' || Number.isNaN(Date.parse(record[key]))))) throw new Error('Invalid warning validity');
    }
    if(dataset.id==='water-pollution' && (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || typeof record.status!=='string' || !Number.isFinite(record.n_basins))) throw new Error('Invalid annual basin statistic');
  }
  return value;
}

export async function collect(content, config, previous = {}, {fetchFn=fetch, now=new Date(), onProgress=()=>{}} = {}) {
  if(config.version!==1 || !Array.isArray(config.sources) || !Array.isArray(config.datasets)) throw new Error('Invalid collection config');
  const sourceMap=new Map(content.sources.map(s=>[s.id,s]));
  const seen=new Set();
  for(const entry of config.sources) {
    const source=sourceMap.get(entry.id);
    if(!source || seen.has(entry.id) || entry.kind!=='html') throw new Error('Invalid collection source');
    seen.add(entry.id);
    officialUrl(entry.url,source.hosts);
  }
  if(seen.size!==sourceMap.size) throw new Error('Every registered source needs a collection entry');
  const checkedAt=now.toISOString();
  const sources=[], datasets=[], changed=[];
  for(const entry of config.sources) {
    const source=sourceMap.get(entry.id);
    const old=previous.sources?.find(s=>s.id===entry.id);
    const pageUrl=entry.annualPath ? new URL(entry.annualPath.replace('{year}',now.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).slice(0,4)),entry.url).href : entry.url;
    try {
      const response=await readPublic(pageUrl,source.hosts,fetchFn);
      if(!/text\/html/i.test(response.type)) throw new Error('Expected an HTML listing');
      const links=extractCandidates(response.text,response.url,source.hosts);
      const changes=linkChanges(old?.links,links);
      const status=links.length ? 'ok' : 'limited';
      const result={id:entry.id,url:pageUrl,checkedAt,status,lastSuccessAt:links.length ? checkedAt : old?.lastSuccessAt ?? null,links:links.length ? links : old?.links ?? [],observedCount:links.length,fingerprint:links.length ? digest(links) : old?.fingerprint ?? null,changedCount:links.length ? changes.length : 0};
      sources.push(result);
      if(links.length) changed.push(...changes.map(item=>({...item,source:entry.id})));
      onProgress(`${entry.id}: ${status}, ${links.length} candidate links`);
    } catch(error) {
      sources.push({id:entry.id,url:pageUrl,checkedAt,status:'error',lastSuccessAt:old?.lastSuccessAt ?? null,links:old?.links ?? [],observedCount:null,fingerprint:old?.fingerprint ?? null,changedCount:0,error:error.message.slice(0,200)});
      onProgress(`${entry.id}: error (${error.message})`);
    }
  }
  for(const dataset of config.datasets) {
    if(!/^[a-z0-9-]+$/.test(dataset.id) || !Array.isArray(dataset.required)) throw new Error('Invalid dataset config');
    officialUrl(dataset.url,['api.data.gov.my']);
    officialUrl(dataset.page,['data.gov.my','developer.data.gov.my']);
    const old=previous.datasets?.find(d=>d.id===dataset.id);
    try {
      const response=await readPublic(dataset.url,['api.data.gov.my'],fetchFn);
      if(!/application\/json/i.test(response.type)) throw new Error('Expected JSON data');
      const records=validateRecords(dataset,JSON.parse(response.text));
      const fingerprint=digest(records);
      datasets.push({...dataset,checkedAt,status:'ok',dataFetchedAt:checkedAt,records,fingerprint,changed:fingerprint!==old?.fingerprint});
      onProgress(`${dataset.id}: ok, ${records.length} records`);
    } catch(error) {
      datasets.push({...dataset,checkedAt,status:'error',dataFetchedAt:old?.dataFetchedAt ?? null,records:old?.records ?? [],fingerprint:old?.fingerprint ?? null,changed:false,error:error.message.slice(0,200)});
      onProgress(`${dataset.id}: error (${error.message})`);
    }
  }
  return {version:1,checkedAt,sources,datasets,changed};
}

export function publicCollection(state) {
  return {version:1,checkedAt:state.checkedAt,sources:state.sources.map(({links,fingerprint,...source})=>source)};
}
export function publicData(state) {
  return {version:1,checkedAt:state.checkedAt,attribution:'Government of Malaysia / METMalaysia / Department of Environment, data.gov.my — CC BY 4.0',license:'https://creativecommons.org/licenses/by/4.0/',datasets:state.datasets.map(({required,fingerprint,changed,...dataset})=>dataset)};
}
