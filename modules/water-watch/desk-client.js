import {tenderStatus,tenderTiming} from './industry-desks.mjs';

const query=document.querySelector('#tender-query');
if(query) {
  const status=document.querySelector('#tender-status'), cards=[...document.querySelectorAll('[data-tender]')];
  function update() {
    const now=new Date(), term=query.value.trim().toLowerCase();let count=0;
    for(const card of cards) {
      const tender=card.dataset.deadlineDate?{deadline:card.dataset.deadline||null,deadlineDate:card.dataset.deadlineDate}:null;
      const state=tender?tenderStatus(tender,now):'unknown';
      card.dataset.status=state;
      card.querySelector('[data-timing]').textContent=tender?tenderTiming(tender,now):'截止日期未确认';
      card.hidden=!(card.dataset.search.includes(term) && (status.value==='all' || status.value==='upcoming' && ['upcoming','verify'].includes(state) || status.value===state));
      if(!card.hidden)count++;
      if(card.dataset.briefing && +now>=Date.parse(card.dataset.briefing))card.querySelector('[data-briefing-note]').textContent=card.dataset.requirement==='mandatory'?'强制说明会日期已过 · 参与条件须核对':'说明会日期已过 · 是否强制须核对';
    }
    document.querySelector('#tender-count').textContent=`${count} 条`;
    document.querySelector('#tender-empty').hidden=count!==0;
  }
  query.addEventListener('input',update);status.addEventListener('change',update);
  document.querySelector('#tender-reset').addEventListener('click',()=>{query.value='';status.value='upcoming';update();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  setInterval(update,60000);update();
}
