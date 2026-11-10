// לוח בקרה עם גרפים ופילוחים (v65): כל החלקים מוצגים, המספרים נגזרים מהנתונים, סינון קבוצות, הרשאות ונייד.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const fill = () => {
  const ids = S.students.map(s => s.id); let k = 0;
  for (let i = 1; i <= 60; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (d.getDay() > 4) continue; const ds = iso(d); S.latt[ds] = S.latt[ds] || {};
    ids.forEach(id => { for (let p = 1; p <= 3; p++) { k++; S.latt[ds]['L0' + p + ':' + id] = (k % 19 === 0 ? 'absent' : k % 13 === 0 ? 'late' : 'present'); } }); }
  ids.slice(0, 6).forEach((id, j) => { const s = studentById(id); S.events.push({ id: 'ev' + j, sid: id, sname: s.name, cls: s.cls, type: 'e1', typeName: j % 2 ? 'עזרה לחבר' : 'הפרעה בשיעור', kind: j % 2 ? 'pos' : 'neg', sev: 1, date: daysAgo(j % 3), time: '10:00', note: '' }); });
  LIDX = null;
};
async function open(who = 'admin', vp = { width: 1440, height: 900 }) {
  const page = await newPage(browser, vp);
  await login(page, server.url, who);
  await page.evaluate(fill);
  await page.evaluate(() => { S.tab = 'dash'; render(); });
  return page;
}

test('לוח בקרה: עוגות, מגמה, מפת חום, קבוצות מוקד והשוואת כיתות מוצגים', async () => {
  const page = await open();
  for (const sel of ['.dv-donut svg circle', '.dv-legend .dv-leg', '.dv-line polyline', '.dv-heat .dv-hc', '.dv-tiers .dv-tier', '.dv-ct tbody tr'])
    assert.ok(await page.$(sel), 'חסר: ' + sel);
  const h3 = await page.$$eval('#main h3', xs => xs.map(x => x.textContent));
  for (const t of ['נוכחות היום', 'מה לעשות עכשיו', 'אירועי השבוע לפי סוג', 'מגמות', 'תלמידים במוקד', 'השוואת כיתות'])
    assert.ok(h3.some(x => x.includes(t)), 'חסרה כותרת: ' + t);
  // מקרא העוגה של נוכחות היום מסתכם במספר התלמידים
  const r = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#main .card')].find(c => /^נוכחות היום/.test(c.querySelector('h3').textContent));
    return { sum: [...card.querySelectorAll('.dv-leg b')].reduce((a, b) => a + Number(b.textContent), 0), n: myStudents().length,
      classes: myClasses().filter(c => myStudents().some(s => s.cls === c)).length, rows: document.querySelectorAll('.dv-ct tbody tr').length,
      tiers: [...document.querySelectorAll('.dv-tier b')].reduce((a, b) => a + Number(b.textContent), 0), pts: document.querySelectorAll('.dv-line .dv-pt').length };
  });
  assert.equal(r.sum, r.n);
  assert.equal(r.rows, r.classes);
  assert.equal(r.tiers, r.n, 'כל תלמיד שייך בדיוק לקבוצה אחת');
  assert.ok(r.pts >= 2 && r.pts <= 8);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('לוח בקרה: לחיצה על קבוצה מסננת את הרשימה, ולחיצה נוספת מחזירה', async () => {
  const page = await open();
  const okN = await page.$eval('.dv-tier[data-tier="ok"] b', b => Number(b.textContent));
  await page.click('.dv-tier[data-tier="ok"]');
  assert.equal(await page.$eval('.dv-tier[data-tier="ok"]', b => b.getAttribute('aria-pressed')), 'true');
  assert.equal(await page.$$eval('.dv-fr', x => x.length), Math.min(okN, 60));
  assert.ok(await page.$$eval('.dv-fr .dv-dot', x => x.every(d => d.dataset.tier === 'ok')));
  await page.click('.dv-tier[data-tier="ok"]');
  assert.equal(await page.evaluate(() => S.dashTier), '');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('לוח בקרה: תלמיד שנעדר 3 ימים ברצף מסומן כ"דורש טיפול" ומופיע בהתראות', async () => {
  const page = await open();
  const name = await page.evaluate(() => {
    const s = myStudents()[0]; const ds = Array.from(new Set(Object.keys(S.latt))).sort().slice(-3);
    ds.forEach(d => Object.keys(S.latt[d]).forEach(k => { if (k.endsWith(':' + s.id)) S.latt[d][k] = 'absent'; }));
    LIDX = null; render(); return s.name;
  });
  const urgent = await page.$$eval('.dv-fr', xs => xs.filter(x => x.querySelector('.dv-dot').dataset.tier === 'urgent').map(x => x.textContent));
  assert.ok(urgent.some(t => t.includes(name) && t.includes('נעדר 3 ימים ברצף')), 'לא סומן: ' + urgent.join(' | '));
  assert.match(await page.textContent('#main'), /תלמידים נעדרים 3 ימים ברצף/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('לוח בקרה למחנך: רק הכיתה שלו, בלי טבלת השוואת כיתות', async () => {
  const page = await open('teacherA');
  const r = await page.evaluate(() => ({ n: myStudents().length, clsN: new Set(myStudents().map(s => s.cls)).size, tiers: [...document.querySelectorAll('.dv-tier b')].reduce((a, b) => a + Number(b.textContent), 0),
    heatRows: document.querySelectorAll('.dv-heat .dv-hr').length, table: !!document.querySelector('.dv-ct') }));
  assert.equal(r.clsN, 1);
  assert.equal(r.tiers, r.n);
  assert.equal(r.heatRows, 1);
  assert.equal(r.table, false);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

for (const scheme of ['light', 'dark']) test('לוח בקרה בנייד (' + scheme + '): בלי גלילה אופקית של הדף', async () => {
  const page = await newPage(browser, { width: 360, height: 780, mobile: true });
  await page.emulateMedia({ colorScheme: scheme });
  await login(page, server.url, 'admin'); await page.evaluate(fill); await page.evaluate(() => { S.tab = 'dash'; render(); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
