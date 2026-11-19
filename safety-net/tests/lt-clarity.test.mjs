// רמזור — תוספות תצוגה (v75): הסבר לרמות, מילה ברשימה, "למה זה הצבע שלי?", הצלחות, הצעד הבא, אירוע חמור נפרד, סימון כפול. החישוב לא משתנה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const prep = () => {
  const s = S.students.find(x => x.cls === S.config.classes[0]), ch = evTypes().find(x => /חוצפה/.test(x.name));
  const add = (o, d) => S.events.push(Object.assign({ id: 'q' + Math.random(), sid: s.id, sname: s.name, cls: s.cls, date: daysAgo(d), time: '10:00' }, o));
  S.events = S.events.filter(e => e.sid !== s.id);
  add({ type: ch.id, typeName: ch.name, kind: 'neg', sev: 2, lv: 2, period: 1, byUid: 'A' }, 1);
  add({ type: ch.id, typeName: ch.name, kind: 'neg', sev: 2, lv: 2, period: 1, byUid: 'B' }, 1);
  add({ type: 'e6', typeName: 'אלימות פיזית', kind: 'neg', sev: 3 }, 2);
  add({ type: 'p1', typeName: 'צל"ש', kind: 'pos', sev: 1, note: 'עזר לחבר' }, 1);
  S.config.lightPolicy = { on: true, levels: [{ n: 'ירוק', from: 0 }, { n: 'צהוב', from: 4 }, { n: 'כתום', from: 7, next: 'שיחה אישית עם המחנך השבוע' }, { n: 'אדום', from: 10 }] };
  return s.id;
};

test('כרטיס: מילה, למה זה הצבע, ימי חלון, ייתכן כפול, אירוע חמור נפרד, הצלחות, הצעד הבא — והניקוד זהה', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'teacherA');
  const sid = await page.evaluate(prep);
  const sc = await page.evaluate(sid => autoLight(sid).score, sid);
  assert.equal(sc, 7); // 2+2+3 = 7, שבח 1 לא מגיע לקיזוז — כמו קודם
  await page.evaluate(sid => { S.ltStu = sid; S.tab = 'light'; render(); }, sid);
  const t = await page.textContent('#main');
  assert.match(t, /נדרש ליווי/);
  assert.match(t, /אירוע חמור פתוח/);
  assert.match(t, /הצעד הבא: שיחה אישית עם המחנך השבוע/);
  assert.match(t, /הצלחות אחרונות/); assert.match(t, /עזר לחבר/);
  await page.click('.lt-why summary');
  const w = await page.textContent('.lt-why');
  assert.match(w, /ימים קלנדריים/); assert.equal((w.match(/ייתכן כפול/g) || []).length, 3); // 2 תגיות + הסבר
  // שבח לא סוגר אירוע חמור
  await page.evaluate(sid => { const s = studentById(sid); for (let i = 0; i < 6; i++) S.events.push({ id: 'pp' + i, sid, sname: s.name, cls: s.cls, type: 'p1', typeName: 'צל"ש', kind: 'pos', sev: 1, date: daysAgo(0) }); render(); }, sid);
  assert.match(await page.textContent('#main'), /אירוע חמור פתוח/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('רשימת תלמידים: נקודה ומילה ליד השם, בלי עמודה חדשה; מורה מקצועי לא רואה', async () => {
  for (const [who, see] of [['teacherA', true], ['teacherMath', false]]) {
    const page = await newPage(browser, { width: 390, height: 844, mobile: true });
    await login(page, server.url, who);
    await page.evaluate(prep);
    await page.evaluate(() => { S.tab = 'students'; render(); });
    assert.ok(await page.$$eval('#main thead th', x => x.length) <= 6);
    assert.equal((await page.$$('.lt-li')).length > 0, see, who);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test('דיווח: הסבר קצר ליד כל רמה; המנהל משנה את ההסבר בהגדרות', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  await page.evaluate(() => { S.tab = 'settings'; render(); });
  await page.fill('#lvh1', 'הערה חצופה קלה');
  await page.click('[data-act="evt-lvh"]');
  await page.evaluate(() => { const t = evTypes().find(x => /חוצפה/.test(x.name)); S.tab = 'events'; S.evc = evDefaults({ sids: [S.students[0].id], type: t.id }); render(); });
  const h = await page.$$eval('.evlv .evlv-h', x => x.map(y => y.textContent));
  assert.equal(h.length, 3); assert.equal(h[0], 'הערה חצופה קלה');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
