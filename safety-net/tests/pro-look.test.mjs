// שלב 1 — מראה מקצועי (v66): גופן Noto Sans Hebrew מוטמע, סט אייקונים אחד, בלי אימוג'י ובלי רקע מקושט,
// וכפתור ראשי קריא גם במצב כהה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B07}\u{27F3}\u{2795}\u{231B}\u{23F0}\u{23F3}]/u;

test('מראה: הגופן Noto Sans Hebrew מוטמע ונטען, בלי טעינה מגוגל', async () => {
  const page = await newPage(browser, { width: 1440, height: 900 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(async () => { await document.fonts.ready;
    return { fam: getComputedStyle(document.querySelector('#main h2') || document.body).fontFamily, ok: document.fonts.check('16px "Noto Sans Hebrew"', 'שלום'),
      google: [...document.querySelectorAll('link[href*="fonts.googleapis"],style')].some(x => /fonts\.googleapis/.test(x.href || x.textContent)) }; });
  assert.match(r.fam, /Noto Sans Hebrew/);
  assert.equal(r.ok, true);
  assert.equal(r.google, false);
  await page.context().close();
});

for (const scheme of ['light', 'dark']) test('מראה (' + scheme + '): בלי אימוג\'י ובלי רקע מקושט בכל המסכים; אייקון אחיד בתפריטים', async () => {
  const page = await newPage(browser, { width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: scheme });
  await login(page, server.url, 'admin');
  const tabs = await page.evaluate(() => tabsFor().map(t => t[0]));
  const bad = [];
  for (const t of tabs.concat(['card'])) {
    const txt = await page.evaluate(t => { if (t === 'card') { S.tab = 'card'; S.cardId = myStudents()[0].id; } else S.tab = t; render(); return document.querySelector('#main').innerText; }, t);
    const m = txt.match(EMOJI); if (m) bad.push(t + ': ' + m[0]);
  }
  assert.deepEqual(bad, []);
  const r = await page.evaluate(() => (S.tab = 'dash', render(), { same: ICONS === ICO, deco: getComputedStyle(document.body, '::before').display,
    navIcons: tabsFor().every(t => !!ICO[t[0]]), activeIcon: getComputedStyle(document.querySelector('.nav button[data-on="1"]'), '::before').display }));
  assert.equal(r.same, true);
  assert.equal(r.deco, 'none');
  assert.equal(r.navIcons, true, 'לשונית בלי אייקון');
  assert.equal(r.activeIcon, 'block', 'האייקון נעלם בלשונית הפעילה');
  // כפתור ראשי: טקסט לבן בניגודיות 4.5 לפחות
  const ratio = await page.evaluate(() => { S.tab = 'dash'; render(); const b = document.querySelector('.btn[data-v="primary"]'); const cs = getComputedStyle(b);
    const L = c => { const m = c.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; };
    const a = L(cs.color), c = L(cs.backgroundColor); return (Math.max(a, c) + .05) / (Math.min(a, c) + .05); });
  assert.ok(ratio >= 4.5, 'ניגודיות כפתור ראשי ' + ratio.toFixed(2));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
