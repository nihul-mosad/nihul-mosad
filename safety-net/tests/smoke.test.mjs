// בדיקות עשן: כל המסכים נפתחים בלי שגיאות JavaScript, אצל מנהל ואצל מורה, במחשב ובנייד.
// רץ על out/staging-local.html (מאגר מדומה) — כניסה אמיתית דרך מסך הכניסה וטעינת נתונים אמיתית (loadSec).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

const ADMIN_TABS = ['dash', 'review', 'students', 'rem', 'mark', 'events', 'grades', 'schedule', 'duty', 'tasks',
  'meetings', 'daylog', 'assist', 'reports', 'analytics', 'staff', 'settings'];
let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

async function openTab(page, tab) {
  await page.evaluate(t => { S.tab = t; render(); }, tab);
  await page.waitForTimeout(150);
  return page.evaluate(() => document.getElementById('main').innerText);
}

test('מנהל: כל 17 המסכים נפתחים בלי שגיאה', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  const nav = await page.evaluate(() => tabsFor().map(t => t[0]));
  // "ניתוחים" אוחד עם "דוחות" בתפריט (מתג בראש המסך), אבל המסך עצמו נשאר ונבדק כאן
  assert.deepEqual(nav.slice().sort(), ADMIN_TABS.filter(t => t !== 'analytics').sort(), 'רשימת המסכים בתפריט השתנתה');
  for (const tab of ADMIN_TABS) {
    const before = page.errors.length;
    const txt = await openTab(page, tab);
    assert.equal(page.errors.length, before, `שגיאת JavaScript במסך ${tab}: ${page.errors.slice(before).join(' | ')}`);
    assert.ok(txt.trim().length > 20, `המסך ${tab} ריק`);
    assert.ok(!/\bundefined\b|\bNaN\b/.test(txt), `המסך ${tab} מציג undefined/NaN`);
  }
  // כרטיס תלמיד, תצוגות המשנה של נוכחות ותצוגות האירועים
  for (const fn of ["S.tab='card';S.cardId='s1'", "S.tab='mark';S.markView='day'", "S.tab='mark';S.markView='gaps'",
                    "S.tab='events';S.evView='cards'", "S.tab='events';S.evView='table'"]) {
    const before = page.errors.length;
    await page.evaluate(f => { (0, eval)(f); render(); }, fn);
    assert.equal(page.errors.length, before, `שגיאה ב: ${fn}`);
  }
});

test('מורה מקצועי: רואה רק את המסכים המותרים, וכולם נפתחים', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherMath');
  const nav = await page.evaluate(() => tabsFor().map(t => t[0]));
  for (const forbidden of ['settings', 'staff', 'daylog', 'assist', 'analytics', 'students'])
    assert.ok(!nav.includes(forbidden), `מורה רואה את המסך ${forbidden}`);
  for (const tab of nav) {
    const before = page.errors.length;
    await openTab(page, tab);
    assert.equal(page.errors.length, before, `שגיאה במסך ${tab} אצל מורה: ${page.errors.slice(before).join(' | ')}`);
  }
});

test('נייד (390px): מסכים עיקריים וסרגל ניווט תחתון', async () => {
  const page = await newPage(browser, { width: 390, height: 844, mobile: true });
  await login(page, server.url, 'admin');
  for (const tab of ['dash', 'mark', 'events', 'review', 'students']) {
    const before = page.errors.length;
    await openTab(page, tab);
    assert.equal(page.errors.length, before, `שגיאה בנייד במסך ${tab}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, `גלילה אופקית בנייד במסך ${tab} (${overflow}px)`);
  }
  assert.ok(await page.isVisible('#bnav'), 'סרגל הניווט התחתון לא מוצג בנייד');
});

test('סביבת הניסוי לא פונה לשום שרת חיצוני של Firebase', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  const fb = page.external.filter(u => /googleapis|firebase|gstatic/.test(u) && !/fonts\.(googleapis|gstatic)/.test(u));
  assert.deepEqual(fb, [], 'נמצאה פנייה ל-Firebase אמיתי');
  assert.equal(await page.evaluate(() => window.__fakefs.projectId), 'staging-local');
});
