// הדגמת העיצוב AURA 3.1 (out/aura-demo.html): בידוד מוחלט מהייצור, ושהמסכים עובדים בשני מצבי התצוגה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { launch, OUT } from './helpers.mjs';

const FILE = path.join(OUT, 'aura-demo.html');
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

test('הדגמה: הקובץ סגור — מדיניות אבטחה בלי חיבורי רשת, בלי סקריפטים חיצוניים ובלי פרטי ייצור', () => {
  const s = fs.readFileSync(FILE, 'utf8');
  assert.match(s, /<meta http-equiv="Content-Security-Policy" content="[^"]*connect-src 'none'/);
  assert.match(s, /worker-src 'none'/);
  assert.doesNotMatch(s, /<script[^>]+src=/, 'נטען קובץ סקריפט');
  assert.doesNotMatch(s, /AIza[0-9A-Za-z_-]{30,}|nihul-mosad\.firebaseapp\.com|projectId\s*:\s*["']nihul-mosad["']/, 'נמצאו פרטי ייצור');
  assert.doesNotMatch(s, /serviceWorker\.register\('sw\.js'\)/, 'רישום Service Worker');
});

async function openDemo(theme, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(t => { try { localStorage.setItem('tt:theme', t); sessionStorage.setItem('aura-demo-theme', t); } catch (e) {} }, theme);
  const page = await ctx.newPage();
  page.errors = []; page.external = [];
  page.on('pageerror', e => page.errors.push(e.message));
  // כל בקשה שאינה הקובץ עצמו נרשמת ונחסמת (גם גופנים — כאן לא צריך אותם)
  await page.route(/^(?!file:|data:|blob:)/, r => { page.external.push(r.request().url()); r.abort(); });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => document.getElementById('shell').classList.contains('on') && document.querySelector('.au-banner'), null, { timeout: 15000 });
  return page;
}

for (const theme of ['light', 'dark']) {
  test('הדגמה (' + theme + '): נכנסת אוטומטית עם נתוני דמה, ועוברת בין כל 17 המסכים בלי שגיאות', async () => {
    const page = await openDemo(theme, { width: 1440, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), theme);
    assert.equal(await page.evaluate(() => window.__fakefs.projectId), 'aura-demo');
    assert.ok((await page.evaluate(() => S.students.length)) >= 60, 'נתוני הדמה לא נטענו');
    assert.equal(await page.$$eval('#nav button[data-tab]', bs => bs.length), 11, 'בתפריט הראשי צריכים להיות 11 המסכים של תמונת המקור');
    await page.click('#nav [data-navmore]');
    const tabs = await page.$$eval('#nav button[data-tab]', bs => bs.map(b => b.dataset.tab));
    assert.equal(tabs.length, 17, 'אחרי "עוד" כל 17 המסכים זמינים');
    for (const sel of ['.au-top', '.au-banner', '.au-kpis', '.au-tasks', '.au-evs', '.au-month svg circle', '.au-cls .tr i', '.au-trend svg rect', '.au-types svg circle', '.au-sum li'])
      assert.ok(await page.$(sel), 'חסר רכיב במסך הבית: ' + sel);
    for (const t of tabs) {
      await page.click('#nav button[data-tab="' + t + '"]');
      await page.waitForTimeout(120);
      assert.equal(await page.evaluate(() => S.tab), t);
    }
    assert.deepEqual(page.errors, []);
    assert.ok(page.external.every(u => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)), 'פנייה החוצה: ' + page.external.join(', '));
    await page.context().close();
  });
}

test('הדגמה: מתג בהיר/כהה ומעבר תפקיד (מורה מקצועי) עובדים, ובנייד יש סרגל ניווט תחתון', async () => {
  const page = await openDemo('light', { width: 390, height: 844 });
  await page.click('#auraDemoBar button');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  assert.ok(await page.isVisible('#bnav'));
  await page.selectOption('#auraDemoBar select', 'math');
  await page.waitForFunction(() => typeof S !== 'undefined' && S.me && S.me.teacher === 'מר אהרן אהרוני', null, { timeout: 15000 });
  assert.ok(!(await page.$('#nav button[data-tab="settings"]')), 'מורה מקצועי רואה הגדרות');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('הדגמה: התפריט בצד ימין, מתקפל לאייקונים בלבד ונפתח שוב, וכל הגרפים מוצגים גם במסך מחשב קטן (1366, פריסת 2×2)', async () => {
  const page = await openDemo('light', { width: 1366, height: 768 });
  const geo = () => page.evaluate(() => { const s = document.getElementById('side').getBoundingClientRect(), m = document.getElementById('main').getBoundingClientRect(); return { sx: s.x, sw: s.width, mx: m.x }; });
  let g = await geo();
  assert.ok(g.sx > g.mx, 'התפריט צריך להיות מימין לתוכן');
  const wide = g.sw;
  await page.click('[data-au="navc"]');
  await page.waitForTimeout(500);
  g = await geo();
  assert.ok(g.sw < wide / 2, 'התפריט לא התקפל');
  assert.equal(await page.$eval('#nav button[data-tab="dash"] span', e => getComputedStyle(e).display), 'none');
  await page.click('[data-au="navc"]');
  await page.waitForTimeout(500);
  assert.ok((await geo()).sw >= wide - 1, 'התפריט לא נפתח שוב');
  for (const sel of ['.au-month svg circle', '.au-types svg circle', '.au-trend svg rect', '.au-cls .tr i'])
    assert.ok(await page.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 8 && getComputedStyle(e).visibility !== 'hidden'; }), 'גרף לא מוצג: ' + sel);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('הדגמה: נפתחת תמיד במצב בהיר, גם אם במכשיר נשמר קודם מצב כהה, ובלי הקטנה מלאכותית של המסך', async () => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 760 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('x')) { localStorage.setItem('tt:theme', 'dark'); sessionStorage.setItem('x', '1'); } } catch (e) {} });
  const page = await ctx.newPage();
  await page.route(/^(?!file:|data:|blob:)/, r => r.abort());
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => document.querySelector('.au-banner'), null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('shell')).zoom), '1', 'המסך מוקטן באופן מלאכותי');
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'גלילה אופקית');
  await ctx.close();
});
