import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {tenderStatus,tenderTiming,validateDesks,renderProjects,renderTenders,projectArticles} from '../industry-desks.mjs';

const content=JSON.parse(await readFile(new URL('../content.json',import.meta.url),'utf8'));

test('deadline comparisons use the actual Malaysia instant and never invent a time for date-only notices',()=>{
  const exact={deadline:'2026-10-09T12:00:00+08:00',deadlineDate:'2026-10-09'};
  assert.equal(tenderStatus(exact,new Date('2026-10-09T03:59:59Z')),'upcoming');
  assert.equal(tenderStatus(exact,new Date('2026-10-09T04:00:00Z')),'closed');
  const dateOnly={deadline:null,deadlineDate:'2026-10-09'};
  assert.equal(tenderStatus(dateOnly,new Date('2026-10-08T16:00:00Z')),'verify');
  assert.equal(tenderStatus(dateOnly,new Date('2026-10-09T16:00:00Z')),'closed');
  assert.match(tenderTiming(dateOnly,new Date('2026-10-08T15:59:00Z')),/1 天.*时刻待确认/);
});

test('project timelines preserve original articles, source attribution and distinct amount scopes',()=>{
  validateDesks(content);
  const stampin=content.projects.find(project=>project.id==='stampin-flood-mitigation');
  assert.deepEqual(projectArticles(stampin,content).map(a=>a.publishedAt),['2026-09-03','2026-10-06']);
  const html=renderProjects(content);
  assert.match(html,/RM87,956,231.16/);
  assert.match(html,/报道发布日期/);
  assert.match(html,/未收录进展不代表工程停滞/);
  const bad=structuredClone(content);bad.projects[0].articleIds.push('missing-article');
  assert.throws(()=>validateDesks(bad),/project article/);
});

test('procurement rendering marks past mandatory visits and escapes all editorial metadata',()=>{
  const html=renderTenders(content,new Date('2026-10-09T03:30:00Z'));
  assert.match(html,/强制说明会日期已过/);
  assert.match(html,/2026-10-22 · 具体时刻未确认/);
  assert.equal((html.match(/data-tender /g)||[]).length,content.articles.filter(a=>a.category==='tenders').length);
  const changed=structuredClone(content), article=changed.articles.find(a=>a.tender);
  article.tender.reference='<script>alert(1)</script>';
  assert.ok(!renderTenders(changed).includes('<script>alert'));
  article.tender.deadline='2026-11-12T12:00:00';
  assert.throws(()=>validateDesks(changed),/timezone/);
});
