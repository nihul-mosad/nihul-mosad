// מיפוי — בחירת ילדים להדפסה, קבוצות ופילוח, מיפוי חוזר והשוואה.
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
async function fill(page, id, levels) {
  await page.click(`tr[data-remopen="${id}"]`);
  for (const [d, v] of Object.entries(levels)) await page.click(`[data-mplv="${d}"][data-v2="${v}"]`);
  await page.click('[data-act="mp-save"]'); await settle(page);
  await page.click('[data-act="mp-close"]');
}

test('הדפסת טפסים ריקים רק לילדים שנבחרו', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  await openRem(page);
  await page.evaluate(() => { window.print = () => { window.__printed = [...document.querySelectorAll('.mpform h2+.mpform-hd b')].map(b => b.textContent); }; });
  await page.click('input[data-mpsel="s2"]');
  await page.click('input[data-mpsel="s5"]');
  assert.ok(!(await page.evaluate(() => S.remOpen)), 'סימון לא פותח את הטופס');
  assert.match(await page.$eval('#main', e => e.innerText), /2 ילדים נבחרו/);
  await page.click('.mpselbar [data-act="mp-print-blank"]');
  await page.waitForFunction(() => window.__printed, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.querySelectorAll('.mpform').length || window.__printed.length), 2);
  await page.waitForFunction(() => !S.remPrint);
  await page.click('[data-act="mp-selclear"]');
  assert.equal(await page.evaluate(() => remSelN()), 0);
  assert.deepEqual(page.errors, []);
});

test('קבוצות ופילוח: קבוצה מהפילוח בוחרת את המתקשים, ימים ושעות, שיבוץ מופיע אצל הילד ואצל המחנך, חפיפה מזוהה', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  await openRem(page);
  await fill(page, 's1', { dec: 3, read: 2 });
  await fill(page, 's2', { dec: 4 });
  await fill(page, 's5', { dec: 3, math: 3 });
  await page.click('[data-act="mp-view"][data-id="groups"]');
  const seg = await page.$eval('.mpseg-t', e => e.innerText);
  assert.match(seg, /פענוח/);
  await page.click('tr:has-text("פענוח") [data-act="mp-gnew"]');
  const mem = await page.evaluate(() => S.remG.members.slice().sort());
  assert.deepEqual(mem, ['s1', 's2', 's5'], 'נבחרו אוטומטית המתקשים בפענוח');
  await page.fill('#mpg-name', 'קבוצת פענוח');
  await page.fill('#mpg-staff', 'המורה המתקנת');
  await page.selectOption('[data-mpgd="0"][data-k="d"]', '1');
  await page.fill('[data-mpgd="0"][data-k="from"]', '10:00');
  await page.fill('[data-mpgd="0"][data-k="to"]', '10:40');
  await page.click('[data-act="mp-gdayadd"]');
  await page.selectOption('[data-mpgd="1"][data-k="d"]', '3');
  await page.click('[data-act="mp-gsave"]'); await settle(page);
  const g = Object.values((await serverDoc(page, B + 'rem/_groups')).g)[0];
  assert.equal(g.name, 'קבוצת פענוח'); assert.equal(g.days.length, 2); assert.deepEqual(g.days[0], { d: 1, from: '10:00', to: '10:40' });
  const r1 = (await serverDoc(page, remDoc(CLASSES[0]))).m.s1;
  assert.match(r1.gq, /קבוצת פענוח \(ב׳ 10:00–10:40, ד׳ 10:00–10:40\)/, 'השיבוץ נכתב בטופס של הילד');
  const week = await page.$eval('.mpweek', e => e.innerText);
  assert.match(week, /יום ב׳[\s\S]*10:00–10:40[\s\S]*קבוצת פענוח/);
  // קבוצה שנייה חופפת לאותו ילד
  await page.click('[data-act="mp-gnew"]:not([data-id])');
  await page.fill('#mpg-name', 'קבוצת חשבון');
  await page.click('[data-act="mp-gfocus"][data-id="math"]');
  await page.click('input[data-mpgm="s5"]');
  await page.fill('[data-mpgd="0"][data-k="from"]', '10:20');
  await page.selectOption('[data-mpgd="0"][data-k="d"]', '1');
  await page.click('[data-act="mp-gsave"]'); await settle(page);
  assert.match(await page.$eval('#main', e => e.innerText), /חפיפה בשעות/);
  // המחנך רואה את השיבוץ בסיכום של הילד, ולא את דף הקבוצות
  await page.evaluate(() => logout()).catch(() => {}); await page.waitForTimeout(400);
  await login(page, server.url, 'teacherA');
  await openRem(page);
  assert.equal(await page.locator('[data-act="mp-view"]').count(), 0, 'למחנך אין דף קבוצות');
  await page.click('tr[data-remopen="s1"]');
  assert.match(await page.$eval('#remSum', e => e.innerText), /קבוצת פענוח \(ב׳ 10:00/);
  assert.deepEqual(page.errors, []);
});

test('מיפוי חוזר: המיפוי הקודם נשמר, ומוצגת השוואה עם מגמה', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  await openRem(page);
  await page.click('tr[data-remopen="s3"]');
  await page.click('[data-mplv="read"][data-v2="4"]'); await page.click('[data-mplv="math"][data-v2="2"]'); await page.click('[data-mplv="write"][data-v2="3"]');
  await page.fill('#mp-n-read', 'קורא מילה מילה'); await page.fill('#mp-md', '2026-09-01');
  await page.click('[data-act="mp-save"]'); await settle(page);
  // תיקון: לא יוצר מיפוי חוזר
  await page.click('[data-act="mp-edit"]'); await page.click('[data-mplv="write"][data-v2="2"]');
  await page.click('[data-act="mp-save"]'); await settle(page);
  let r = (await serverDoc(page, remDoc(CLASSES[0]))).m.s3;
  assert.equal(Object.keys(r).filter(k => k.startsWith('r_')).length, 0, 'תיקון לא שומר עותק');
  assert.equal(r.l_write, 2);
  // מיפוי חוזר
  await page.click('[data-act="mp-round"]');
  assert.match(await page.$eval('#remCard', e => e.innerText), /מיפוי חוזר/);
  assert.equal(await page.inputValue('#mp-n-read'), '', 'ההערות מתרוקנות לתצפית חדשה');
  await page.click('[data-mplv="read"][data-v2="2"]'); await page.click('[data-mplv="math"][data-v2="3"]');
  await page.click('[data-act="mp-save"]'); await settle(page);
  r = (await serverDoc(page, remDoc(CLASSES[0]))).m.s3;
  const rs = Object.keys(r).filter(k => k.startsWith('r_')).map(k => r[k]);
  assert.equal(rs.length, 1); assert.equal(rs[0].l.read, 4); assert.equal(rs[0].md, '2026-09-01'); assert.equal(rs[0].n.read, 'קורא מילה מילה');
  assert.equal(r.l_read, 2); assert.equal(r.l_math, 3);
  const prog = await page.$eval('#remProg', e => e.innerText);
  assert.match(prog, /השתפר ב-1/); assert.match(prog, /הורע ב-1/); assert.match(prog, /ללא שינוי ב-1/);
  await page.click('[data-act="mp-close"]');
  assert.match(await page.$eval('tr[data-remopen="s3"]', e => e.innerText), /↑1 ↓1/);
  assert.deepEqual(page.errors, []);
});
