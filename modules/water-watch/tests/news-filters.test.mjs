import assert from 'node:assert/strict';
import {test} from 'node:test';
import {matchesNews, malaysiaDay, readFilters, filterUrl, validateStates} from '../news-filters.mjs';

const article={title:'Drainage works',summary:'Kelantan and Terengganu',region:'Malaysia',tags:[],states:['kelantan','terengganu'],category:'projects',source:'petra',publishedAt:'2026-10-03',eventDate:null,checkedAt:'2026-10-09'};

test('state filters intersect other filters and national scope is explicit',()=>{
  assert.ok(matchesNews(article,{state:'kelantan',category:'projects',source:'petra',query:' DRAINAGE '}));
  assert.ok(matchesNews(article,{state:'terengganu'}));
  assert.ok(!matchesNews(article,{state:'selangor'}));
  assert.ok(!matchesNews(article,{state:'kelantan',source:'nahrim'}));
  assert.ok(!matchesNews({...article,states:['national']},{state:'kelantan'}));
  for (const states of [[],['Kelantan'],['kelantan','kelantan'],'kelantan']) assert.throws(()=>validateStates(states));
});

test('recent periods use Malaysia days, inclusive boundaries and original dates',()=>{
  const today='2026-10-09';
  assert.equal(malaysiaDay(new Date('2026-10-08T16:00:00Z')),today);
  assert.equal(malaysiaDay(new Date('2026-10-08T15:59:59Z')),'2026-10-08');
  assert.ok(matchesNews(article,{period:'7'},today));
  assert.ok(!matchesNews({...article,publishedAt:'2026-10-02'},{period:'7'},today));
  assert.ok(matchesNews({...article,publishedAt:'2026-09-10'},{period:'30'},today));
  assert.ok(!matchesNews({...article,publishedAt:'2026-09-09'},{period:'30'},today));
  assert.ok(!matchesNews({...article,publishedAt:'2026-10-10'},{period:'7'},today));
  assert.ok(!matchesNews({...article,publishedAt:'2026-01-01'},{period:'7'},today));
  assert.ok(matchesNews({...article,publishedAt:null,eventDate:'2026-10-03'},{period:'7'},today));
});

test('unconfirmed dates never become recent from checkedAt',()=>{
  const undated={...article,publishedAt:null,eventDate:null};
  assert.ok(matchesNews(undated,{},'2026-10-09'));
  assert.ok(matchesNews(undated,{period:'unknown'},'2026-10-09'));
  for (const date of [null,'','2026-02-30','not-a-date']) assert.ok(!matchesNews({...undated,publishedAt:date},{period:'30'},'2026-10-09'));
  assert.ok(!matchesNews(article,{period:'unknown'},'2026-10-09'));
});

test('share URLs round trip Unicode, validate selections and preserve unrelated parameters',()=>{
  const choices={category:['','projects'],source:['','petra']};
  const selected={query:'河流 & flood',category:'projects',source:'petra',state:'kelantan',period:'30'};
  const base=new URL('https://jihkk.github.io/AIHOT/?keep=1#official');
  const url=filterUrl(base,selected);
  assert.equal(url.pathname,'/AIHOT/');assert.equal(url.hash,'#official');
  assert.equal(url.searchParams.get('keep'),'1');assert.equal(base.search,'?keep=1');
  assert.deepEqual(readFilters(url,choices),selected);
  assert.equal(filterUrl(url,{}).href,base.href);
  const invalid=new URL('https://jihkk.github.io/AIHOT/?category=evil&source=unknown&state=moon&period=365&query=%3Cscript%3E');
  assert.deepEqual(readFilters(invalid,choices),{query:'<script>',category:'',source:'',state:'',period:''});
});
