// דירוג 1–3 בדיווח (v74): "חוצפה" — המורה בוחר רמה; הרמה נשמרת כחומרה, מוצגת, ומשפיעה על הרמזור.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

test('דיווח חוצפה: חובה לבחור רמה; הרמה נשמרת (sev+lv), מוצגת ברשימה ונספרת כ"לטיפול" מרמה 2', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'teacherA');
  const t = await page.evaluate(() => { const t = evTypes().find(x => /חוצפה/.test(x.name)); S.tab = 'events'; S.evc = evDefaults({ sids: [myStudents()[0].id] }); render(); return t; });
  assert.ok(t, 'אין סוג חוצפה');
  await page.click('[data-act="ev-type"][data-t="' + t.id + '"]');
  assert.equal(await page.$$eval('.evlv [data-act="ev-lv"]', x => x.length), 3);
  await page.click('[data-act="ev-save"]');
  assert.equal(await page.evaluate(() => S.events.filter(e => e.lv).length), 0, 'נשמר בלי רמה');
  await page.click('[data-act="ev-lv"][data-n="2"]');
  await page.click('[data-act="ev-save"]');
  const e = await page.evaluate(id => S.events.filter(x => x.type === id).slice(-1)[0], t.id);
  assert.equal(e.lv, 2); assert.equal(e.sev, 2);
  await page.evaluate(() => { S.evc = null; S.tab = 'events'; render(); });
  assert.match(await page.textContent('#main'), /רמה 2/);
  // סוג רגיל — בלי בחירת רמה ובלי שדה lv
  const other = await page.evaluate(() => { const t = evTypes().find(x => x.kind === 'neg' && !evLeveled(x)); S.evc = evDefaults({ sids: [myStudents()[0].id], type: t.id }); render(); return t.id; });
  assert.equal(await page.$('.evlv'), null);
  await page.click('[data-act="ev-save"]');
  assert.equal(await page.evaluate(id => 'lv' in S.events.filter(x => x.type === id).slice(-1)[0], other), false);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('הגדרות: הפעלה/כיבוי דירוג לכל סוג; ברמזור — נקודות לפי רמה (ברירת מחדל = הרמה)', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(() => {
    const t = evTypes().find(x => x.kind === 'neg' && !evLeveled(x)); S.tab = 'settings'; render();
    document.querySelector('[data-act="evt-lv"][data-id="' + t.id + '"]').click();
    const on = evLeveled(evType(t.id));
    const ch = evTypes().find(x => /חוצפה/.test(x.name)), sid = S.students[0].id, st = S.students[0];
    S.events = S.events.filter(e => e.sid !== sid);
    S.events.push({ id: 'z1', sid, sname: st.name, cls: st.cls, type: ch.id, typeName: ch.name, kind: 'neg', sev: 3, lv: 3, date: daysAgo(1) });
    const a = autoLight(sid, Object.assign(ltPolicy(), { on: true })).score;
    S.config.lightPolicy = { on: true, wl: { [ch.id]: ['', '', 7] } };
    const b = autoLight(sid).score;
    S.tab = 'settings'; render();
    return { on, a, b, inputs: document.querySelectorAll('[data-ltl="' + ch.id + '"]').length };
  });
  assert.equal(r.on, true); assert.equal(r.a, 3); assert.equal(r.b, 7); assert.equal(r.inputs, 3);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
