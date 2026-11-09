// מיפוי והוראה מתקנת: הטופס לפי "טופס מיפוי", שמירה לשרת, שרשור הערות, הרשאות במסך והדפסה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, serverDoc, settle, INST } from './helpers.mjs';
import { keyify, CLASSES } from '../seed.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });
const B = 'insts/' + INST + '/';
const remDoc = c => B + 'rem/' + keyify(c);
async function openRem(page) {
  await page.evaluate(() => { goTab('rem'); });
  await page.waitForFunction(() => S.rem && (S.rem.at || S.rem.err), null, { timeout: 10000 });
  await page.evaluate(() => render());
}

test('מיפוי: הטופס בנוי לפי שבעת התחומים וההיבטים של טופס המיפוי', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  await openRem(page);
  const heads = await page.$$eval('table.mpt thead th', a => a.map(x => x.textContent.trim()));
  for (const d of ['קריאה', 'פענוח', 'הבנת הנקרא', 'כתיבה', 'חשבון', 'בעיות מילוליות', 'למידה']) assert.ok(heads.includes(d), 'חסר תחום: ' + d);
  await page.click('tr[data-remopen="s1"]');
  const form = await page.$eval('#remCard', e => e.innerText);
  for (const t of ['שם הילד', 'כיתה', 'שם מחנך', 'הרב ישראל ישראלי', 'דיוק', 'ניקוד', 'צירופים', 'הסקת מסקנות', 'כתב יד', 'בחירת פעולה', 'התארגנות']) assert.match(form, new RegExp(t), 'חסר בטופס: ' + t);
  assert.deepEqual(page.errors, []);
});

test('מיפוי: מנהל ממלא רמה, היבטי קושי והערה → נשמר בשרת שדה-שדה → המחנך רואה ומוסיף הסתייגות', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  await openRem(page);
  await page.click('tr[data-remopen="s1"]');
  await page.click('[data-mplv="dec"][data-v2="3"]');
  await page.click('[data-mpsub="dec"][data-sv="ניקוד"]');
  await page.click('[data-mpsub="dec"][data-sv="זיהוי אותיות"]');
  await page.fill('#mp-n-dec', 'מתבלבל בין קמץ לפתח');
  await page.click('[data-mplv="math"][data-v2="1"]');
  await page.selectOption('#mp-st', 'mapped');
  await page.click('[data-act="mp-save"]');
  await settle(page);
  const r = (await serverDoc(page, remDoc(CLASSES[0]))).m.s1;
  assert.equal(r.l_dec, 3); assert.equal(r.l_math, 1); assert.equal(r.st, 'mapped');
  assert.equal(r.s_dec, 'זיהוי אותיות|ניקוד', 'היבטי הקושי נשמרים בסדר של הטופס');
  assert.equal(r.n_dec, 'מתבלבל בין קמץ לפתח');
  assert.equal(Object.keys(r).filter(k => k.startsWith('h_')).length, 1, 'נרשמה היסטוריית שינוי');
  // הטופס הוא דף נפרד: הרשימה לא מוצגת מתחתיו; "חזרה לרשימה" מחזיר לטבלה
  assert.equal(await page.locator('table.mpt').count(), 0, 'הרשימה לא אמורה להופיע מתחת לטופס');
  await page.click('[data-act="mp-close"]');
  // בטבלה מופיעים הרמה וההיבטים
  const row = await page.$eval('tr[data-remopen="s1"]', e => e.innerText);
  assert.match(row, /מתקשה/); assert.match(row, /זיהוי אותיות, ניקוד/);
  // סינון לפי היבט
  await page.selectOption('[data-remf="dom"]', 'dec');
  await page.selectOption('[data-remf="sub"]', 'ניקוד');
  assert.equal(await page.locator('tr[data-remopen]').count(), 1);

  await page.evaluate(() => logout()).catch(() => {}); await page.waitForTimeout(400);
  await login(page, server.url, 'teacherA');
  await openRem(page);
  assert.equal(await page.locator('tr[data-remopen]').count(), 4, 'המחנך רואה רק את 4 תלמידי הכיתה שלו');
  assert.equal(await page.locator('tr[data-remopen="s1"] .mpdot').count(), 1, 'סימון עדכון חדש מאחרים');
  await page.click('tr[data-remopen="s1"]');
  await page.selectOption('#mp-ck', 'object');
  await page.fill('#mp-cx', 'בכיתה הוא קורא ניקוד טוב');
  await page.click('[data-act="mp-cadd"]');
  await settle(page);
  const r2 = (await serverDoc(page, remDoc(CLASSES[0]))).m.s1;
  const cs = Object.keys(r2).filter(k => k.startsWith('c_')).map(k => r2[k]);
  assert.equal(cs.length, 1); assert.equal(cs[0].k, 'object'); assert.equal(r2.l_dec, 3, 'ההערה לא דרסה את הטופס');
  assert.deepEqual(page.errors, []);
});

test('מיפוי: מורה מקצועי לא רואה את הלשונית', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherMath');
  const tabs = await page.evaluate(() => tabsFor().map(t => t[0]));
  assert.ok(!tabs.includes('rem'));
  assert.deepEqual(page.errors, []);
});

test('מיפוי: הדפסת טפסים ריקים — טופס לכל תלמיד ברשימה, בתבנית הטופס', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  await openRem(page);
  await page.evaluate(() => { window.print = () => { window.__printed = document.querySelectorAll('.mpform').length; }; });
  await page.selectOption('[data-remf="cls"]', CLASSES[1]);
  await page.click('[data-act="mp-print-blank"]');
  await page.waitForFunction(() => window.__printed !== undefined, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__printed), 4);
  await page.waitForFunction(() => !S.remPrint, null, { timeout: 5000 });
  assert.equal(await page.locator('table.mpt').count(), 1, 'אחרי ההדפסה חוזרים לטבלה');
  assert.deepEqual(page.errors, []);
});

test('מיפוי: טופס התלמיד נפתח כדף נפרד — הבא/הקודם, וכפתור "חזרה" של הדפדפן מחזיר לרשימה', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  await openRem(page);
  await page.selectOption('[data-remf="cls"]', CLASSES[0]);
  await page.click('tr[data-remopen="s2"]');
  assert.equal(await page.locator('#remCard').count(), 1);
  assert.equal(await page.locator('table.mpt').count(), 0);
  assert.match(await page.$eval('#main', e => e.innerText), /2 מתוך 4/);
  await page.click('[data-act="mp-nav"]:has-text("הבא")');
  assert.equal(await page.evaluate(() => S.remOpen), 's3');
  await page.goBack();
  await page.waitForFunction(() => S.remOpen === 's2', null, { timeout: 5000 });
  await page.goBack();
  await page.waitForFunction(() => !S.remOpen, null, { timeout: 5000 });
  assert.equal(await page.locator('table.mpt').count(), 1, 'אחרי "חזרה" מוצגת הרשימה');
  assert.equal(await page.evaluate(() => S.tab), 'rem');
  assert.deepEqual(page.errors, []);
});
