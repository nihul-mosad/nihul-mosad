// כרטיס תלמיד חכם בגרסה הקלאסית (out/staging-local.html):
// מבנה מלא, תובנות עם הסבר ומספרים, נתונים שנגזרים מהמאגר, הרשאות, פעולות מהירות,
// והכרטיס הקלאסי שנשמר מתחת ב"פירוט מלא" — בלי עיצוב AURA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

// נתוני דוגמה לתלמיד s1, בזיכרון הדף בלבד
const fill = page => page.evaluate(() => {
  const s = studentById('s1'); let k = 0;
  for (let i = 1; i <= 50; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (d.getDay() > 4) continue; const ds = iso(d); S.latt[ds] = S.latt[ds] || {};
    for (let p = 1; p <= 4; p++) { k++; S.latt[ds]['L0' + p + ':s1'] = (k % 23 === 0 ? 'absent' : k % 17 === 0 ? 'late' : 'present'); } }
  S.reviews.push({ id: 'r1', studentId: s.id, date: daysAgo(40), light: 'yellow', scores: { d1: 3, d2: 3, d3: 4 }, note: '' },
    { id: 'r2', studentId: s.id, date: daysAgo(20), light: 'yellow', scores: { d1: 3, d2: 2, d3: 4 }, note: '' },
    { id: 'r3', studentId: s.id, date: daysAgo(4), light: 'green', scores: { d1: 4, d2: 4, d3: 4 }, note: 'משתתף יפה' });
  S.events.push({ id: 'e1', sid: s.id, sname: s.name, cls: s.cls, type: 'e1', typeName: 'עזרה לחבר', kind: 'pos', sev: 1, date: daysAgo(2), time: '10:00', note: '' });
  LIDX = null;
});
async function open(who = 'admin', sid = 's1', viewport = { width: 1440, height: 900 }) {
  const page = await newPage(browser, viewport);
  await login(page, server.url, who);
  await fill(page);
  await page.evaluate(id => { S.tab = 'card'; S.cardId = id; render(); }, sid);
  return page;
}
const kpis = page => page.$$eval('.s3-kpis .au-kpi b', bs => bs.map(b => b.textContent.trim()));

test('כרטיס חכם: כל החלקים מוצגים, לכל תובנה הסבר עם מספרים, ושורה לכל תחום', async () => {
  const page = await open();
  for (const sel of ['.s3-hero .s3-av', '.s3-hero h2', '.s3-kpis .au-kpi', '.s3-trend svg rect', '.s3-mix svg circle', '.s3-ins .s3-in', '.s3-evs svg', '.s3-dom .s3-d', '.s3-tl .s3-t', 'details.s3-more'])
    assert.ok(await page.$(sel), 'חסר: ' + sel);
  assert.equal((await page.$$('.s3-kpis .au-kpi')).length, 4);
  assert.equal(await page.$eval('.s3-hero h2', e => e.textContent), await page.evaluate(() => studentById('s1').name));
  const ins = await page.$$eval('.s3-in', xs => xs.map(x => x.textContent));
  assert.ok(ins.length > 0);
  for (const t of ins) assert.match(t, /למה\?/, 'תובנה בלי הסבר: ' + t);
  assert.ok(ins.filter(t => !/אין חריגות/.test(t)).every(t => /\d/.test(t)), 'הסבר בלי מספרים');
  assert.equal((await page.$$('.s3-dom .s3-d')).length, await page.evaluate(() => domains().length));
  // בלי עיצוב AURA: אין שכבות או רכיבים של העיצוב החדש
  assert.equal(await page.$('style#aura-3-1, style#aura-students, .au-top, .au-waves'), null);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('כרטיס חכם: הנתונים נגזרים מהמאגר — אירועים וחיסורים חדשים משנים את המדדים ואת התובנות', async () => {
  const page = await open();
  const before = await kpis(page);
  await page.evaluate(() => {
    const st = studentById('s1');
    for (let i = 0; i < 3; i++) S.events.push({ id: 'n' + i, sid: st.id, sname: st.name, cls: st.cls, type: 'e2', typeName: 'הפרעה בשיעור', kind: 'neg', sev: 1, date: daysAgo(i), time: '10:00' });
    for (let k = 1; k <= 3; k++) { const d = daysAgo(k); S.latt[d] = S.latt[d] || {}; S.latt[d]['L01:s1'] = 'absent'; S.latt[d]['L02:s1'] = 'absent'; }
    LIDX = null; render();
  });
  const after = await kpis(page);
  assert.notEqual(after[1], before[1], 'מספר החיסורים לא השתנה');
  assert.equal(Number(after[2].split('/')[1]) - Number(before[2].split('/')[1]), 3, 'שלושת האירועים לא נספרו');
  const ins = await page.$$eval('.s3-in b', xs => xs.map(x => x.textContent));
  assert.ok(ins.some(t => /ריבוי אירועים לשיפור/.test(t)), 'התובנה על ריבוי אירועים לא הופיעה: ' + ins.join(' | '));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('כרטיס חכם: הרשאות — מנהל רואה עריכה וסיכום; מחנך רואה רק את הכיתה שלו; מורה מקצועי לא נכנס', async () => {
  const acts = p => p.$$eval('.s3-acts [data-act]', bs => bs.map(b => b.dataset.act).filter(a => a !== 'goto-students'));
  let page = await open('admin');
  assert.deepEqual(await acts(page), ['ev-for', 'rev-one', 'print', 'student-edit', 'sum-open']);
  await page.context().close();
  page = await open('teacherA', 's1');
  assert.deepEqual(await acts(page), ['ev-for', 'rev-one', 'print']);
  await page.evaluate(() => { S.tab = 'card'; S.cardId = 's5'; render(); });
  assert.equal(await page.$('.s360'), null, 'מחנך רואה כרטיס של כיתה אחרת');
  assert.match(await page.textContent('#main'), /זמין רק למחנך הכיתה ולמנהל|התלמיד לא נמצא/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
  page = await open('teacherMath', 's1');
  assert.equal(await page.$('.s360'), null, 'מורה מקצועי רואה את הכרטיס');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('כרטיס חכם: "דיווח אירוע" ו"תמונת מצב" פותחים את הטפסים הקיימים לאותו תלמיד; הכרטיס הקלאסי שלם ב"פירוט מלא"', async () => {
  const page = await open();
  await page.click('.s3-acts [data-act="ev-for"]');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => S.tab), 'events');
  assert.deepEqual(await page.evaluate(() => S.evc && S.evc.sids), ['s1']);
  await page.evaluate(() => { S.tab = 'card'; S.cardId = 's1'; render(); });
  await page.click('.s3-acts [data-act="rev-one"]');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => S.revList && S.revList[S.revIdx] && S.revList[S.revIdx].id), 's1');
  // הכרטיס הקלאסי: מקופל, עם כל החלקים, בלי כותרת וכפתורים כפולים
  await page.evaluate(() => { S.tab = 'card'; S.cardId = 's1'; render(); });
  assert.equal(await page.$eval('details.s3-more', d => d.open), false);
  await page.click('details.s3-more > summary');
  const txt = await page.textContent('details.s3-more');
  for (const t of ['פרטי קשר', 'מגמה לפי תחום', 'היסטוריית תמונות מצב']) assert.ok(txt.includes(t), 'חסר בפירוט המלא: ' + t);
  assert.equal(await page.$eval('details.s3-more .head', e => getComputedStyle(e).display), 'none', 'כותרת כפולה');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('כרטיס חכם בנייד: בלי גלילה אופקית ובלי רכיבים שחורגים מהמסך', async () => {
  const page = await open('admin', 's1', { width: 360, height: 780, mobile: true });
  const r = await page.evaluate(() => ({ pageH: document.documentElement.scrollWidth > innerWidth,
    bad: [...document.querySelectorAll('.s360 *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > innerWidth + .5 || b.left < -.5); }).map(e => e.getAttribute('class') || e.tagName).slice(0, 5) }));
  assert.equal(r.pageH, false); assert.deepEqual(r.bad, []);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
