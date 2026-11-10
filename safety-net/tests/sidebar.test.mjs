// תפריט הצד במחשב ובורר מצב התצוגה (בהיר / כהה / אוטומטי).
// באגים שנמצאו: הגל הדקורטיבי כיסה כפתורים בגלילה, שם מוסד ארוך חרג מהכותרת, ובמחשב לא היה כפתור יציאה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const LOGO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="90"><rect width="400" height="90" fill="#1a8fd0"/></svg>');

for (const [w, h] of [[1338, 602], [1440, 900], [1024, 700]]) {
  test('תפריט צד ' + w + 'x' + h + ': כותרת לא חורגת, שום כפתור לא מכוסה, יש יציאה ובורר מצב', async () => {
    const page = await newPage(browser, { width: w, height: h });
    await login(page, server.url, 'admin');
    await page.evaluate(l => { S.config.name = 'תלמוד תורה חב"ד עפולה'; S.config.logo = l; S.tab = 'dash'; render(); }, LOGO);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const side = document.getElementById('side'), sd = side.getBoundingClientRect();
      const brand = document.querySelector('.brand').getBoundingClientRect();
      const kids = [...document.querySelectorAll('.brand > *')].filter(e => e.getBoundingClientRect().height).map(e => e.getBoundingClientRect());
      const btns = [...document.querySelectorAll('#nav button')];
      const wave = getComputedStyle(side, '::after');
      const who = document.getElementById('who');
      // הגל חייב לבוא אחרי כל התוכן ולא לצוף מעליו
      return {
        brandOverflow: kids.some(k => k.bottom > brand.bottom + .5),
        firstBelowBrand: btns[0].getBoundingClientRect().top >= brand.bottom - .5,
        wavePos: wave.position,
        whoVisible: getComputedStyle(who).display !== 'none' && !!who.querySelector('[data-act="logout"]'),
        thm: who.querySelectorAll('.thm [data-theme-set]').length,
        lastBtnAboveWho: btns[btns.length - 1].getBoundingClientRect().bottom <= who.getBoundingClientRect().top + .5,
        sideW: sd.width
      };
    });
    assert.equal(r.brandOverflow, false, 'הטקסט חורג מכותרת התפריט');
    assert.ok(r.firstBelowBrand, '"לוח בקרה" עולה על הכותרת');
    assert.notEqual(r.wavePos, 'absolute', 'הגל צף מעל הכפתורים');
    assert.ok(r.whoVisible, 'אין כפתור יציאה במחשב');
    assert.equal(r.thm, 3);
    assert.ok(r.lastBtnAboveWho);
    // בדיקה ויזואלית: כל כפתור בתפריט, אחרי גלילה אליו, הוא האלמנט העליון בנקודת המרכז שלו
    const covered = await page.evaluate(async () => {
      const out = [];
      for (const b of document.querySelectorAll('#nav button, #who button')) {
        b.scrollIntoView({ block: 'center' }); await new Promise(r => requestAnimationFrame(r));
        const x = b.getBoundingClientRect(); const top = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
        if (!top || !(b === top || b.contains(top))) out.push(b.textContent.trim());
      }
      return out;
    });
    assert.deepEqual(covered, []);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

test('בורר מצב: בהיר / כהה / אוטומטי עובד בלי קשר להגדרת המחשב, ונשמר אחרי טעינה מחדש', async () => {
  const page = await newPage(browser, { width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await login(page, server.url, 'admin');
  const dark = () => page.evaluate(() => { const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return m[0] + m[1] + m[2] < 200; });
  assert.equal(await dark(), false);
  await page.click('.thm [data-theme-set="dark"]');
  assert.equal(await dark(), true, 'מצב כהה לא הופעל');
  assert.equal(await page.$eval('.thm [data-theme-set="dark"]', b => b.getAttribute('aria-pressed')), 'true');
  await page.reload(); await page.waitForSelector('.thm');
  assert.equal(await dark(), true, 'הבחירה לא נשמרה');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('.thm [data-theme-set="light"]');
  assert.equal(await dark(), false, 'מצב בהיר לא גובר על הגדרת המחשב');
  await page.click('.thm [data-theme-set="auto"]');
  assert.equal(await dark(), true, 'אוטומטי לא חזר להגדרת המחשב');
  assert.equal(await page.evaluate(() => localStorage.getItem('tt:theme')), null);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
