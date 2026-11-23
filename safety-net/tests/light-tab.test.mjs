// v77: לשונית "רמזור" נפרדת — תמונת כיתה, דף רמזור לתלמיד, מצב הצגה לתלמיד; הכרטיס הכללי רק מקשר.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const seed = () => {
  const c = S.config.classes[0], st = S.students.filter(x => x.cls === c), ch = evTypes().find(x => /חוצפה/.test(x.name));
  const add = (s, o, d) => S.events.push(Object.assign({ id: 'l' + Math.random().toString(36).slice(2), sid: s.id, sname: s.name, cls: s.cls, date: daysAgo(d), time: '10:00' }, o));
  S.events = [];
  for (let i = 0; i < 5; i++) add(st[0], { type: 'e4', typeName: 'שפה לא נקייה', kind: 'neg', sev: 2 }, i); // 10 = אדום
  add(st[1], { type: ch.id, typeName: ch.name, kind: 'neg', sev: 2, lv: 2 }, 1);
  add(st[1], { type: 'e1', typeName: 'הפרעה בשיעור', kind: 'neg', sev: 1 }, 2);
  add(st[1], { type: 'e1', typeName: 'הפרעה בשיעור', kind: 'neg', sev: 1 }, 3); // 4 = צהוב
  add(st[2], { type: 'p1', typeName: 'צל"ש', kind: 'pos', sev: 1, note: 'עזר לחבר' }, 1);
  add(st[2], { type: 'e6', typeName: 'אלימות פיזית', kind: 'neg', sev: 3, note: 'בהפסקה' }, 2);
  S.config.lightPolicy = { on: true };
  return st.map(s => s.id);
};

test('מחנך: לשונית רמזור עם תמונת הכיתה; לפי צורך — אדום ראשון; לחיצה פותחת תלמיד', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'teacherA');
  const ids = await page.evaluate(seed);
  await page.evaluate(() => render());
  assert.ok(await page.$('.nav [data-tab="light"]'));
  await page.click('.nav [data-tab="light"]');
  const t = await page.textContent('#main');
  assert.match(t, /רמזור התנהגות/); assert.match(t, /חמור פתוח/);
  assert.equal(await page.$eval('.lt-tile', el => el.dataset.id), ids[0]);
  await page.click('[data-act="lt-sort"][data-id="name"]');
  await page.click('.lt-tile[data-id="' + ids[1] + '"]');
  assert.equal(await page.evaluate(() => S.ltStu), ids[1]);
  const v = await page.textContent('#main');
  assert.match(v, /למה זה הצבע שלי/); assert.match(v, /מצב הצגה לתלמיד/); assert.doesNotMatch(v, /הערכת המחנך/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('מצב הצגה לתלמיד: רק שם, צבע והדברים הטובים — בלי נקודות, אירועים, חמור, כלים למורה', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'teacherA');
  const ids = await page.evaluate(seed);
  await page.evaluate(id => { S.tab = 'light'; S.ltStu = id; render(); }, ids[2]);
  await page.click('[data-act="lt-pres"]');
  const p = await page.textContent('.ltp');
  assert.match(p, /עזר לחבר/); assert.match(p, /הדברים הטובים שלי/);
  for (const bad of [/נק׳/, /אלימות/, /חמור/, /למה זה הצבע/, /הודעה להורים/, /טלפון/]) assert.doesNotMatch(p, bad);
  await page.click('.ltp-nav button');
  assert.notEqual(await page.evaluate(() => S.ltStu), ids[2]);
  await page.click('[data-act="lt-pres"].ltp-x');
  assert.equal(await page.$('.ltp'), null);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('כרטיס כללי: רמזור הלמידה במקומו, הרמזור האקלימי רק כקישור; מורה מקצועי לא רואה לשונית', async () => {
  const page = await newPage(browser, { width: 390, height: 844, mobile: true });
  await login(page, server.url, 'teacherA');
  const ids = await page.evaluate(seed);
  await page.evaluate(id => { S.cardId = id; S.tab = 'card'; render(); }, ids[0]);
  assert.ok(await page.$('.lt-link')); assert.equal(await page.$('.lt-why'), null); assert.equal(await page.$('.lt-wins'), null);
  assert.match(await page.textContent('.s3-dom'), /תמונת מצב אישית/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
  const p2 = await newPage(browser, { width: 1366, height: 768 });
  await login(p2, server.url, 'teacherMath');
  await p2.evaluate(() => { S.config.lightPolicy = { on: true }; render(); });
  assert.equal(await p2.$('.nav [data-tab="light"]'), null);
  await p2.context().close();
});
