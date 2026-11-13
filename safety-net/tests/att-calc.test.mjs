// חישוב הנוכחות (v71): "חסר" = מי שלא נכח באף שיעור ביום; האחוז היומי משוקלל לפי תלמידים × שיעורים.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

test('נוכחות: חסר רק מי שהחסיר את כל השיעורים; חיסור חלקי נספר באחוז המשוקלל', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(() => {
    const d = '2026-11-01', ids = S.students.slice(0, 4).map(s => s.id); S.latt[d] = {}; S.att[d] = {};
    // 4 תלמידים × 5 שיעורים = 20 שיבוצים
    const put = (sid, arr) => arr.forEach((v, i) => { S.latt[d]['L0' + (i + 1) + ':' + sid] = v; });
    put(ids[0], ['present', 'present', 'present', 'present', 'present']);
    put(ids[1], ['absent', 'absent', 'present', 'present', 'present']);   // חלקי: 2 מתוך 5
    put(ids[2], ['absent', 'absent', 'absent', 'absent', 'absent']);       // כל היום
    put(ids[3], ['late', 'present', 'present', 'excused', 'present']);
    LIDX = null;
    const list = ids.map(id => studentById(id)), st = slotStats(list, [d]);
    return { st, days: ids.map(id => dayStatus(id, d)), partial: ids.map(id => dayPartial(id, d)) };
  });
  assert.deepEqual(r.days, ['present', 'present', 'absent', 'late']);
  assert.deepEqual(r.partial[1], { a: 2, n: 5 });
  assert.equal(r.partial[2], null, 'חיסור של כל היום אינו "חלקי"');
  assert.equal(r.st.total, 20);
  assert.equal(r.st.present + r.st.late, 12);   // 5 + 3 + 0 + 4
  assert.equal(r.st.absent, 7);
  assert.equal(r.st.pct, 60); assert.equal(r.st.pAbsent, 35); assert.equal(r.st.pLate, 5); assert.equal(r.st.pExcused, 5);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('לוח בקרה: האחוז הגדול משוקלל, "חסרים כל היום" ו"חסרו בחלק מהשיעורים" בנפרד', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(() => {
    const d = iso(new Date()), L = markableLessons(d), st = S.students; S.latt[d] = {};
    if (!L.length) return { skip: true };
    st.forEach(s => L.forEach(l => { if (lessonStudents(l).list.some(x => x.id === s.id)) S.latt[d][l.id + ':' + s.id] = 'present'; }));
    const mine = k => Object.keys(S.latt[d]).filter(x => x.endsWith(':' + st[k].id));
    mine(0).forEach(k => S.latt[d][k] = 'absent');                  // כל היום
    const p1 = mine(1); if (p1.length > 1) S.latt[d][p1[0]] = 'absent'; // חלקי
    LIDX = null; S.tab = 'dash'; S.dashMode = 'today'; render();
    const ST = slotStats(myStudents(), [d]);
    return { big: document.querySelector('#main .stat b').textContent, pct: ST.pct, sum: document.querySelector('.dsum').textContent, txt: document.querySelector('#main').innerText, a0: st[0].name, a1: st[1].name, multi: p1.length > 1 };
  });
  if (r.skip) return;
  assert.equal(r.big, r.pct + '%');
  assert.match(r.sum, /חסר כל היום תלמיד אחד/);
  assert.match(r.sum, /נוכחות משוקללת/);
  assert.match(r.txt, /חסרים כל היום \(1\)/);
  if (r.multi) assert.match(r.txt, /חסרו בחלק מהשיעורים \(1\)/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
