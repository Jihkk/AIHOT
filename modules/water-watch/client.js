import {matchesNews, readFilters, filterUrl, malaysiaDay, FILTER_KEYS} from './news-filters.mjs';

const controls=Object.fromEntries(FILTER_KEYS.map(key=>[key,document.querySelector(`#${key}`)]));
const choices=Object.fromEntries(['category','source'].map(key=>[key,[...controls[key].options].map(option=>option.value)]));
const stories=[...document.querySelectorAll('.story')];
const filters=()=>Object.fromEntries(FILTER_KEYS.map(key=>[key,controls[key].value]));
const shareLink=document.querySelector('#share-link');
const shareStatus=document.querySelector('#share-status');

function update(writeUrl=true) {
  const selected=filters(), today=malaysiaDay();
  let count=0;
  for (const story of stories) {
    story.hidden=!matchesNews({category:story.dataset.category,source:story.dataset.source,search:story.dataset.search,states:story.dataset.states.split(' '),publishedAt:story.dataset.date},selected,today);
    if (!story.hidden) count++;
  }
  document.querySelector('#count').textContent=`${count} 条`;
  document.querySelector('#empty').hidden=count!==0;
  const url=filterUrl(location.href,selected);
  if (writeUrl && url.href!==location.href) history.replaceState(null,'',url);
  url.hash='news';
  shareLink.href=url.href;
  shareStatus.textContent='';
}

function restore() {
  const selected=readFilters(new URL(location.href),choices);
  for (const key of FILTER_KEYS) controls[key].value=selected[key];
  update();
}
for (const key of FILTER_KEYS) controls[key].addEventListener(key==='query'?'input':'change',()=>update());
document.querySelector('#reset').addEventListener('click',()=>{
  for (const control of Object.values(controls)) control.value='';
  update();controls.query.focus();
});
document.querySelector('#share').addEventListener('click',async()=>{
  const url=shareLink.href;
  try {
    await navigator.clipboard.writeText(url);
    if (url===shareLink.href) shareStatus.textContent='已复制，可发给同事';
  } catch {
    if (url===shareLink.href) shareStatus.textContent='请右键或长按“筛选链接”复制链接地址';
  }
});
window.addEventListener('popstate',restore);
window.addEventListener('pageshow',restore);
// Keep an open tab's rolling date window correct across Malaysia midnight.
setInterval(()=>update(false),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)update(false);});
restore();

// A static preview can stay open for days; expose age without claiming a fresh forecast.
for (const label of document.querySelectorAll('[data-snapshot-at]')) {
  const fetched=Date.parse(label.dataset.snapshotAt);
  if (Number.isFinite(fetched) && Date.now()-fetched>24*60*60*1000) {
    label.textContent+=' · 快照已超过 24 小时，请核对官网';
    label.classList.add('data-caution');
  }
}
