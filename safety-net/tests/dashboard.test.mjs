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
  await page.evaluate(() => { S.tab = 'dash'; S.dashMode = 'week'; render(); });
  return page;
}

test('לוח בקרה "השבוע": מגמה, מפת חום, קבוצות מוקד, השוואת כיתות ומדדי השבוע', async () => {
  const page = await open();
  for (const sel of ['.dv-line polyline', '.dv-heat .dv-hc', '.dv-tiers .dv-tier', '.dv-ct tbody tr', '.care-st'])
    assert.ok(await page.$(sel), 'חסר: ' + sel);
  const h3 = await page.$$eval('#main h3', xs => xs.map(x => x.textContent));
  for (const t of ['מעקב טיפול', 'מילה טובה להורים', 'תלמידים במוקד', 'חיסורים חוזרים', 'הסלמה בהתנהגות', 'כיסוי תמונות מצב', 'התמדת מורים', 'מגמות', 'השוואת כיתות'])
    assert.ok(h3.some(x => x.includes(t)), 'חסרה כותרת: ' + t);
  const r = await page.evaluate(() => ({ n: myStudents().length,
      classes: myClasses().filter(c => myStudents().some(s => s.cls === c)).length, rows: document.querySelectorAll('.dv-ct tbody tr').length,
      tiers: [...document.querySelectorAll('.dv-tier b')].reduce((a, b) => a + Number(b.textContent), 0), pts: document.querySelectorAll('.dv-line .dv-pt').length }));
  assert.equal(r.rows, r.classes);
  assert.equal(r.tiers, r.n, 'כל תלמיד שייך בדיוק לקבוצה אחת');
  assert.ok(r.pts >= 2 && r.pts <= 8);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('לוח בקרה "היום": משפט פתיחה, חסרים עם חיוג/וואטסאפ, אירועים לפי מצב, המשימות שלי; הבחירה נשמרת', async () => {
  const page = await open();
  await page.click('[data-act="dash-mode"][data-id="today"]');
  const r = await page.evaluate(() => {
    const ids = myStudents().map(s => s.id), d = iso(new Date()); S.latt[d] = S.latt[d] || {};
    S.latt[d]['L01:' + ids[0]] = 'absent'; S.latt[d]['L01:' + ids[1]] = 'present'; S.tasks.push({ id: 'tx', text: 'משימה בדיקה', due: daysAgo(1), status: 'open', uid: S.me.id, by: 'admin' });
    LIDX = null; render();
    const h3 = [...document.querySelectorAll('#main h3')].map(x => x.textContent);
    return { h3, sum: document.querySelector('.dsum').textContent, absName: studentById(ids[0]).name,
      absCard: [...document.querySelectorAll('#main .card')].find(c => /^חסרים כל היום/.test(c.querySelector('h3').textContent)).innerText,
      wa: !!document.querySelector('#main a[href^="https://wa.me/"]'), tel: !!document.querySelector('#main a[href^="tel:"]'), evst: !!document.querySelector('.ev-st'),
      task: document.body.innerText.includes('משימה בדיקה'), saved: localStorage.getItem('tt:dashMode') };
  });
  for (const t of ['מה לעשות עכשיו', 'חסרים כל היום', 'אירועים לטיפול', 'המשימות שלי']) assert.ok(r.h3.some(x => x.includes(t)), 'חסר: ' + t);
  assert.match(r.sum, /חסר(ים)? כל היום|אין חסרים|עוד לא סומנה/);
  assert.match(r.sum, /משימה אחת באיחור|משימות באיחור/);
  assert.ok(r.absCard.includes(r.absName));
  assert.ok(r.wa && r.tel && r.evst && r.task);
  assert.equal(r.saved, 'today');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('מעקב טיפול: "פתיחת טיפול" יוצר משימה מקושרת לתלמיד אצל האחראי, והסטטוס מופיע ברשימת המוקד', async () => {
  const page = await open();
  await page.evaluate(() => { const s = myStudents()[0]; Array.from(new Set(Object.keys(S.latt))).sort().slice(-3)
    .forEach(d => Object.keys(S.latt[d]).forEach(k => { if (k.endsWith(':' + s.id)) S.latt[d][k] = 'absent'; })); LIDX = null; render(); });
  const sid = await page.$eval('[data-act="care-open"]', b => b.dataset.id);
  await page.click('[data-act="care-open"]');
  await page.fill('#care-step', 'שיחה עם ההורים');
  await page.click('[data-act="care-save"]');
  const r = await page.evaluate(id => ({ t: S.tasks.filter(t => t.sid === id && t.kind === 'care'), chip: !!document.querySelector('.tag.care[data-c="open"]'), st: careState(id, iso(new Date())).k }), sid);
  assert.equal(r.t.length, 1);
  assert.match(r.t[0].text, /שיחה עם ההורים/);
  assert.ok(r.t[0].due && r.t[0].uid);
  assert.equal(r.st, 'open'); assert.ok(r.chip);
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
  await page.evaluate(() => { S.dashMode = 'today'; render(); });
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
  await login(page, server.url, 'admin'); await page.evaluate(fill); await page.evaluate(() => { S.tab = 'dash'; S.dashMode = 'week'; render(); });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
