// "שיעור דווח" — כלל אחד בכל המערכת (v72): מספיק תלמיד אחד מסומן; שיעור/יום שהוחרגו לא נספרים;
// לא שולחים תזכורת על שיעור שדווח חלקית.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

test('שיעור עם סימון חלקי נחשב "דווח"; בלי סימון — "לא דווח"; מוחרג — לא נספר', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(() => {
    let d = null; for (let i = 1; i < 10; i++) { const x = daysAgo(i); if (lessonsOn(x).length >= 3) { d = x; break; } }
    const L = lessonsOn(d).filter(l => lessonStudents(l).list.length > 1).slice(0, 3); S.latt[d] = {};
    const st0 = lessonStudents(L[0]).list; S.latt[d][L[0].id + ':' + st0[0].id] = 'present';          // חלקי
    lessonStudents(L[1]).list.forEach(s => S.latt[d][L[1].id + ':' + s.id] = 'present');             // מלא
    gapSkips()[d] = { L: { [L[2].id]: 'טיול' } };                                                    // מוחרג
    LIDX = null;
    const R = L.map(l => lessonReported(d, l));
    return { R: R.map(x => [x.rep, x.part, x.miss, x.skip]) };
  });
  assert.deepEqual(r.R[0], [true, true, false, false]);
  assert.deepEqual(r.R[1], [true, false, false, false]);
  assert.deepEqual(r.R[2], [true, false, false, true]);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('לוח הבקרה: שיעור שדווח חלקית לא מופיע כ"לא סומן" ולא נכנס לתזכורות; "התמדת מורים" סופרת אותו', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(() => {
    const today = iso(new Date()); const L = lessonsOn(today); if (!L.length) return { skip: true };
    S.latt[today] = {}; L.forEach(l => { const st = lessonStudents(l).list; if (st.length) S.latt[today][l.id + ':' + st[0].id] = 'present'; });
    LIDX = null; S.tab = 'dash'; S.dashMode = 'today'; render();
    const teachers = Array.from(new Set(L.map(l => l.teacher).filter(Boolean)));
    return { miss: document.querySelectorAll('.dv-strip [data-st="miss"]').length, chips: document.querySelectorAll('[data-act="rem-teacher"]').length,
      remind: teachers.map(t => missedLessonsOf(t).length).reduce((a, b) => a + b, 0) };
  });
  if (!r.skip) { assert.equal(r.miss, 0); assert.equal(r.chips, 0); assert.equal(r.remind, 0); }
  // התמדת מורים: שבוע עם סימון חלקי בכל שיעור → 100%
  const w = await page.evaluate(() => {
    const sun = new Date(); sun.setDate(sun.getDate() - sun.getDay());
    for (let d = new Date(sun); iso(d) < iso(new Date()); d.setDate(d.getDate() + 1)) { const ds = iso(d); S.latt[ds] = {};
      lessonsOn(ds).forEach(l => { const st = lessonStudents(l).list; if (st.length) S.latt[ds][l.id + ':' + st[0].id] = 'present'; }); }
    LIDX = null; S.dashMode = 'week'; render();
    const card = [...document.querySelectorAll('#main .card')].find(c => /התמדת מורים/.test((c.querySelector('h3') || {}).textContent || ''));
    return card ? [...card.querySelectorAll('.dcls .note')].map(n => n.textContent) : null;
  });
  if (w && w.length && !w[0].includes('0/0')) for (const t of w) assert.match(t, /^100%|^0% · 0\//, t);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
