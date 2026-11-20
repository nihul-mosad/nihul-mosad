// v78: דוח תקופתי — חישובים נכונים, הסתרת שמות, קובץ ל-AI, הרשאות.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const seed = () => {
  const c = S.config.classes[0], st = S.students.filter(x => x.cls === c), l = S.timetable.find(x => (x.classes || []).includes(c)) || { id: 'L1' };
  const d1 = daysAgo(3), d2 = daysAgo(40);
  S.latt = {}; S.att = {};
  S.latt[d1] = {}; st.forEach((s, i) => S.latt[d1][l.id + ':' + s.id] = i === 0 ? 'absent' : i === 1 ? 'late' : 'present');
  S.latt[d2] = {}; st.forEach(s => S.latt[d2][l.id + ':' + s.id] = 'present');
  S.events = [{ id: 'a', sid: st[0].id, sname: st[0].name, cls: c, type: 'p1', typeName: 'צל"ש', kind: 'pos', sev: 1, date: daysAgo(2) },
    { id: 'b', sid: st[1].id, sname: st[1].name, cls: c, type: 'e1', typeName: 'הפרעה בשיעור', kind: 'neg', sev: 1, date: daysAgo(2) },
    { id: 'c', sid: st[1].id, sname: st[1].name, cls: c, type: 'e1', typeName: 'הפרעה בשיעור', kind: 'neg', sev: 1, date: daysAgo(35) }];
  S.evArch = [{ id: 'z', sid: st[2].id, sname: st[2].name, cls: c, type: 'p1', typeName: 'צל"ש', kind: 'pos', sev: 1, date: daysAgo(5) }];
  return { c, n: st.length, name0: st[0].name };
};

test('חישוב: נוכחות משוקללת, השוואה לתקופה קודמת, אירועים, ארכיון לפי בחירה', async () => {
  const page = await newPage(browser, { width: 1366, height: 900 });
  await login(page, server.url, 'admin');
  const k = await page.evaluate(seed);
  const r = await page.evaluate(c => { const f = prDefaults(); f.cls = c; const R = prCompute(f); const f2 = Object.assign({}, f, { arch: true }); return { tch: R.tch, A: R.att.A, Ap: R.att.Ap, pos: R.ev.pos, neg: R.ev.neg, pNeg: R.ev.pNeg, pos2: prCompute(f2).ev.pos, ins: R.ins }; }, k.c);
  assert.equal(r.A.n, k.n); assert.equal(r.A.absent, 1); assert.equal(r.A.late, 1);
  assert.equal(r.A.pct, Math.round((k.n - 1) / k.n * 1000) / 10);
  assert.equal(r.Ap.n, k.n); assert.equal(r.Ap.pct, 100);
  assert.equal(r.pos, 1); assert.equal(r.neg, 1); assert.equal(r.pNeg, 1); assert.equal(r.pos2, 2);
  assert.ok(r.ins.some(x => /נוכחות המשוקללת/.test(x)));
  assert.ok(r.tch.length > 0, 'התמדת מורים ריקה');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('מסך: בחירת טווח ו"מתחילת השנה"; הסתרת שמות בקובץ ל-AI; עם שמות כשמבטלים', async () => {
  const page = await newPage(browser, { width: 1366, height: 900 });
  await login(page, server.url, 'admin');
  const k = await page.evaluate(seed);
  await page.evaluate(() => { S.tab = 'reports'; render(); });
  await page.click('[data-act="tab-go"][data-id="periodic"]');
  assert.match(await page.textContent('#main'), /תובנות אוטומטיות/);
  await page.click('[data-act="pr-range"][data-id="year"]');
  assert.equal(await page.evaluate(() => S.prf.from), await page.evaluate(() => prYearStart()));
  const got = await page.evaluate(() => { window.__dl = []; download = (n, c) => window.__dl.push({ n, c }); return true; });
  await page.click('[data-act="pr-md"]');
  let d = await page.evaluate(() => window.__dl[0]);
  assert.match(d.n, /\.md$/); assert.match(d.c, /## הנחיה למודל/); assert.match(d.c, /\| תלמיד 1-01 \|/);
  assert.ok(!d.c.includes(k.name0), 'שם אמיתי דלף לקובץ');
  await page.uncheck('[data-prf="anon"]');
  await page.click('[data-act="pr-md"]');
  d = await page.evaluate(() => window.__dl[1]);
  assert.ok(d.c.includes(k.name0)); assert.match(d.n, /עם-שמות/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
  const p2 = await newPage(browser, { width: 1366, height: 900 });
  await login(p2, server.url, 'teacherA');
  await p2.evaluate(() => { S.tab = 'periodic'; render(); });
  assert.doesNotMatch(await p2.textContent('#main'), /הורדה לניתוח AI/);
  await p2.context().close();
});
