// שלב 2: תפריט בקבוצות, חיפוש כללי (Ctrl+K) ושורות תלמיד לחיצות.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

test('תפריט: מנהל רואה קבוצות, וכל לשונית מופיעה פעם אחת', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(() => ({ groups: [...document.querySelectorAll('#nav .nav-g')].map(g => g.textContent),
    btns: [...document.querySelectorAll('#nav button[data-tab]')].map(b => b.dataset.tab), tabs: tabsFor().map(t => t[0]) }));
  assert.deepEqual(r.groups.slice(0, 4), ['יום־יום', 'תלמידים', 'צוות', 'ניהול']);
  assert.deepEqual(r.btns.slice().sort(), r.tabs.slice().sort());
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('חיפוש כללי: Ctrl+K, שם או טלפון, Enter פותח כרטיס; מסכים; Esc סוגר', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const s = await page.evaluate(() => { const s = S.students[2]; return { id: s.id, name: s.name, ph: contactPhone(s) }; });
  await page.keyboard.press('Control+k');
  assert.ok(await page.$('#cmdk'));
  await page.keyboard.type(s.name.split(' ')[0]);
  assert.ok((await page.$$eval('.ck-it .ck-l', x => x.map(e => e.textContent))).includes(s.name));
  await page.keyboard.press('Escape');
  assert.equal(await page.$('#cmdk'), null);
  await page.keyboard.press('Control+k');
  await page.keyboard.type(s.ph.replace(/\D/g, '').slice(-5));
  assert.deepEqual(await page.$$eval('.ck-it .ck-l', x => x.map(e => e.textContent)).then(a => a.slice(0, 1)), [s.name]);
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => [S.tab, S.cardId]), ['card', s.id]);
  await page.keyboard.press('Control+k'); await page.keyboard.type('דוחות'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => S.tab), 'reports');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('חיפוש כללי: מחנך מוצא רק תלמידים מהכיתה שלו; מורה מקצועי לא מוצא תלמידים', async () => {
  for (const [who, other] of [['teacherA', true], ['teacherMath', false]]) {
    const page = await newPage(browser, { width: 1366, height: 768 });
    await login(page, server.url, who);
    const r = await page.evaluate(() => { const mine = myClasses(); ckOpen(); const all = S.students.map(s => s.name);
      const found = all.filter(n => { document.getElementById('ckq').value = n; ckPaint(); return CK.items.some(i => i.k === 'stu'); });
      ckClose(); return { found: found.length, ok: found.every(n => mine.indexOf(S.students.find(s => s.name === n).cls) > -1) }; });
    assert.ok(r.ok, who + ' רואה תלמיד מכיתה אחרת');
    assert.equal(r.found > 0, other, who);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test('תלמידים: לחיצה בכל מקום בשורה פותחת את הכרטיס; הטלפון קישור לחיוג', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  await page.evaluate(() => { S.tab = 'students'; render(); });
  const id = await page.$eval('#main tbody tr:nth-child(2) button[data-act="card"]', b => b.dataset.id);
  assert.ok(await page.$('#main tbody tr a.tel[href^="tel:"]'));
  await page.click('#main tbody tr:nth-child(2) td:nth-child(5)');
  assert.deepEqual(await page.evaluate(() => [S.tab, S.cardId]), ['card', id]);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('דוחות וניתוחים: לשונית אחת בתפריט ומתג בין שני המסכים; הלשונית מסומנת בשניהם', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  await page.evaluate(() => { S.tab = 'reports'; render(); });
  await page.click('.rep-sw [data-id="analytics"]');
  assert.equal(await page.evaluate(() => S.tab), 'analytics');
  assert.equal(await page.$eval('#nav button[data-tab="reports"]', b => b.dataset.on), '1');
  await page.click('.rep-sw [data-id="reports"]');
  assert.equal(await page.evaluate(() => S.tab), 'reports');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('"בטל" במקום חלון אישור: הסרת כיתה בהגדרות מחזירה אותה בלחיצה על "בטל"', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const before = await page.evaluate(() => { S.tab = 'settings'; render(); return S.config.classes.slice(); });
  await page.click('[data-act="del-cls"]');
  assert.equal(await page.evaluate(() => S.config.classes.length), before.length - 1);
  await page.click('#toast .undo');
  assert.deepEqual(await page.evaluate(() => S.config.classes), before);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
