// רמזור התנהגות אוטומטי (v73): הגדרות אצל המנהל, 4 צבעים, חישוב מהאירועים, תצוגה בכרטיס ליד הערכת המחנך.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const addEv = (sid, type, kind, sev, d) => { const s = studentById(sid); S.events.push({ id: 'x' + Math.random(), sid, sname: s.name, cls: s.cls, type, typeName: (evTypes().find(t => t.id === type) || {}).name || type, kind, sev, date: daysAgo(d), time: '10:00' }); };

test('חישוב: ניקוד, קיזוז שבח עם תקרה, ספים של 4 צבעים, קו אדום, חלון זמן', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(src => {
    const addEv = eval(src); const sid = S.students[0].id; S.events = S.events.filter(e => e.sid !== sid);
    S.config.lightPolicy = { on: true, days: 14, posPer: 2, posCap: 3, levels: [{ n: 'ירוק', from: 0 }, { n: 'צהוב', from: 4 }, { n: 'כתום', from: 7 }, { n: 'אדום', from: 10 }], w: { e1: 2 }, red: { e6: true } };
    const out = [];
    addEv(sid, 'e1', 'neg', 1, 1); addEv(sid, 'e1', 'neg', 1, 2); out.push(autoLight(sid));          // 2+2 = 4 → צהוב
    addEv(sid, 'p1', 'pos', 1, 1); addEv(sid, 'p1', 'pos', 1, 1); out.push(autoLight(sid));          // שבח 2 → קיזוז 1 → 3 → ירוק
    addEv(sid, 'e3', 'neg', 2, 3); addEv(sid, 'e3', 'neg', 2, 3); out.push(autoLight(sid));          // 4+4−1 = 7 → כתום
    addEv(sid, 'e1', 'neg', 1, 30); out.push(autoLight(sid));                                         // מחוץ לחלון — לא משנה
    addEv(sid, 'e6', 'neg', 3, 5); out.push(autoLight(sid));                                          // קו אדום → אדום
    return out.map(L => [L.score, L.i, L.lv.n, !!L.redLine]);
  }, addEv.toString());
  assert.deepEqual(r[0], [4, 1, 'צהוב', false]);
  assert.deepEqual(r[1], [3, 0, 'ירוק', false]);
  assert.deepEqual(r[2], [7, 2, 'כתום', false]);
  assert.deepEqual(r[3], [7, 2, 'כתום', false]);
  assert.equal(r[4][1], 3); assert.equal(r[4][3], true);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('הגדרות: המנהל משנה שמות/ספים/נקודות, תצוגה מקדימה, שמירה; הכרטיס מציג את שני הרמזורים', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  await page.evaluate(() => { S.tab = 'settings'; render(); });
  assert.ok(await page.$('#lt-card'));
  assert.equal(await page.$$eval('#lt-card .lt-lv > div', x => x.length), 4);
  // כבוי כברירת מחדל: הכרטיס לא מציג
  await page.evaluate(() => { S.tab = 'card'; S.cardId = S.students[0].id; render(); });
  assert.equal(await page.$('.lt-cmp'), null);
  await page.evaluate(() => { S.tab = 'settings'; render(); });
  await page.check('#lt-on'); await page.fill('#lt-n2', 'כתום'); await page.fill('#lt-f1', '3');
  await page.fill('[data-ltw="e1"]', '5'); await page.check('[data-ltr="e6"]');
  await page.click('[data-act="lt-preview"]');
  assert.equal(await page.evaluate(() => (S.config.lightPolicy || {}).on), undefined, 'תצוגה מקדימה לא שומרת');
  await page.click('[data-act="lt-save"]');
  const P = await page.evaluate(() => S.config.lightPolicy);
  assert.equal(P.on, true); assert.equal(P.levels[1].from, 3); assert.equal(P.levels[2].n, 'כתום'); assert.equal(P.w.e1, 5); assert.equal(P.red.e6, true);
  await page.evaluate(() => { S.tab = 'card'; S.cardId = S.students[0].id; render(); });
  assert.ok(await page.$('.lt-cmp')); assert.ok(await page.$('.s3-hero .lt-b'));
  assert.match(await page.textContent('.lt-cmp'), /הערכת המחנך/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('הרשאות: מורה לא רואה את הגדרות הרמזור; מחנך רואה את הרמזור בכרטיס של תלמיד בכיתה שלו', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'teacherA');
  const r = await page.evaluate(() => { S.config.lightPolicy = { on: true };
    const tabs = tabsFor().map(t => t[0]); const sid = myStudents()[0].id; S.tab = 'card'; S.cardId = sid; render();
    return { settings: tabs.includes('settings'), block: !!document.querySelector('.lt-cmp') }; });
  assert.equal(r.settings, false);
  assert.equal(r.block, true);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
