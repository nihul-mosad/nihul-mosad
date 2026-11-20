// v79: יומן שעות פרטניות — מורה רואה את השעות שלו, מדווח, נשמר בשרת בלי לפגוע באירועים; מנהל רואה מי דיווח ומה קרה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, settle, serverDump } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

// שיעור פרטני של המורה המחובר, ביום של היום, בשיעור הראשון
const mkPriv = () => {
  const c = S.config.classes[0], st = S.students.filter(s => s.cls === c).slice(0, 2), d = dow(iso(new Date())) > 5 ? 0 : dow(iso(new Date()));
  const l = { id: 'PV1', day: d, period: 1, subject: 'קריאה', teacher: S.me.teacher, classes: [c], type: 'private', students: st.map(s => s.id) };
  S.timetable = S.timetable.filter(x => x.id !== 'PV1').concat([l]);
  return { lid: l.id, sids: st.map(s => s.id), names: st.map(s => s.name) };
};

test('מורה: לשונית שעות פרטניות, דיווח מלא נשמר בשרת, האירועים לא נפגעים, עריכה ומחיקה', async () => {
  const page = await newPage(browser, { width: 1366, height: 900 });
  await login(page, server.url, 'teacherA');
  const k = await page.evaluate(mkPriv);
  const evBefore = await page.evaluate(() => S.events.length);
  await page.evaluate(() => render());
  assert.ok(await page.$('.nav button[data-tab="priv"]'));
  await page.waitForTimeout(400);
  await page.click('.nav button[data-tab="priv"]');
  await page.waitForFunction(() => /השעות הפרטניות שלי/.test(document.getElementById('main').textContent), null, { timeout: 5000 });
  await page.evaluate(lid => { S.pvc = pvDefaults({ date: daysAgo(7), lid: '', sids: [] }); render(); }, k.lid);
  await page.evaluate(lid => { const l = S.timetable.find(x => x.id === lid); S.pvc.date = (() => { let d = iso(new Date()); for (let i = 0; i < 7; i++) { if (dow(d) === l.day) return d; d = addDaysIso(d, -1); } return d; })(); render(); }, k.lid);
  await page.selectOption('#pv-lid', k.lid);
  assert.equal(await page.$$eval('[data-pvs]:checked', x => x.length), 2, 'הקבוצה מסומנת מראש');
  await page.uncheck('[data-pvs="' + k.sids[1] + '"]');
  await page.click('[data-act="pv-act"][data-id="שיחה"]');
  await page.click('[data-act="pv-act"][data-id="למידה"]');
  await page.fill('#pv-topic', 'קריאה שוטפת פרק ב');
  await page.fill('#pv-note', 'התקדם יפה');
  await page.click('[data-act="pv-how"][data-id="1"]');
  await page.click('[data-act="pv-save"]');
  await settle(page);
  const p = await page.evaluate(() => S.pv[0]);
  assert.deepEqual(p.sids, [k.sids[0]]); assert.deepEqual(p.acts, ['שיחה', 'למידה']); assert.equal(p.topic, 'קריאה שוטפת פרק ב'); assert.equal(p.how, 1); assert.equal(p.kind, 'pv');
  assert.equal(await page.evaluate(() => S.events.length), evBefore, 'הדיווח נכנס לאירועים');
  const dump = (await serverDump(page)).docs; let found = 0; Object.values(dump).forEach(d => { if (d.ev && d.ev[p.id]) found++; });
  assert.equal(found, 1, 'לא נשמר בשרת');
  // טעינה מחדש: עדיין בנפרד
  await page.evaluate(async () => { await refreshData(); });
  assert.equal(await page.evaluate(id => S.pv.filter(x => x.id === id).length, p.id), 1);
  assert.equal(await page.evaluate(id => S.events.some(x => x.id === id), p.id), false);
  await page.evaluate(mkPriv);
  await page.evaluate(() => { S.tab = 'priv'; S.pvc = null; render(); });
  assert.match(await page.textContent('#main'), /התקדם יפה/);
  // מחיקה
  await page.click('[data-act="pv-del"][data-id="' + p.id + '"]');
  assert.equal(await page.evaluate(() => S.pv.length), 0);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('"לא התקיים" מוציא מהרשימה לדיווח; מנהל רואה מי דיווח, מה קרה ומה לא דווח; כרטיס תלמיד', async () => {
  const page = await newPage(browser, { width: 1366, height: 900 });
  await login(page, server.url, 'admin');
  const k = await page.evaluate(() => { const c = S.config.classes[0], st = S.students.filter(s => s.cls === c).slice(0, 2);
    const l = { id: 'PV2', day: 1, period: 2, subject: 'חשבון', teacher: 'הרב ישראל ישראלי', classes: [c], type: 'private', students: st.map(s => s.id) };
    S.timetable = S.timetable.concat([l]); let d = daysAgo(1); while (dow(d) !== 1) d = addDaysIso(d, -1); const d2 = addDaysIso(d, -7);
    S.pv = [{ id: 'x1', kind: 'pv', date: d, lid: 'PV2', period: 2, subject: 'חשבון', teacher: l.teacher, sids: [st[0].id], acts: ['תרגול'], topic: 'לוח הכפל', note: 'שלט ב־6', how: 1, cls: c, by: l.teacher, byUid: 'u1', tk: 't', ts: 1 }];
    S.pvf = { from: addDaysIso(d2, -1), to: iso(new Date()), t: '', q: '' }; S.tab = 'priv'; render(); return { sid: st[0].id, d2 }; });
  const t = await page.textContent('#main');
  assert.match(t, /דיווח לפי מורה/); assert.match(t, /לוח הכפל/); assert.match(t, /הרב ישראל ישראלי/); assert.match(t, /שעות שלא דווחו/);
  await page.evaluate(sid => { S.cardId = sid; S.tab = 'card'; render(); }, k.sid);
  assert.match(await page.textContent('#main'), /שלט ב־6/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
  // מורה בלי שעות פרטניות — אין לשונית
  const p2 = await newPage(browser, { width: 1366, height: 900 });
  await login(p2, server.url, 'teacherMath');
  await p2.evaluate(() => { S.timetable = S.timetable.filter(l => l.type !== 'private'); render(); });
  assert.equal(await p2.$('.nav button[data-tab="priv"]'), null);
  await p2.context().close();
});

test('לא התקיים — מסומן ויוצא מ"לדיווח"', async () => {
  const page = await newPage(browser, { width: 390, height: 844, mobile: true });
  await login(page, server.url, 'teacherA');
  await page.evaluate(() => { const c = S.config.classes[0]; const l = { id: 'PV3', day: dow(daysAgo(7)) > 5 ? 0 : dow(daysAgo(7)), period: 1, subject: 'קריאה', teacher: S.me.teacher, classes: [c], type: 'private', students: [] };
    S.timetable = S.timetable.concat([l]); S.tab = 'priv'; S.pvc = null; render(); });
  const before = await page.$$eval('[data-act="pv-skip"]', x => x.length);
  assert.ok(before >= 1);
  await page.click('[data-act="pv-skip"]');
  await settle(page);
  assert.equal(await page.$$eval('[data-act="pv-skip"]', x => x.length), before - 1);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
