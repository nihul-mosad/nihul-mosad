// מערכת שעות — ייצוא לאקסל: גיליונות כיתות, מורים, מקצועות ומסכם.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, launch, newPage, login } from './helpers.mjs';
import { CLASSES } from '../seed.mjs';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const LIB = require.resolve('xlsx/dist/xlsx.full.min.js');

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

test('ייצוא מערכת שעות: 4 גיליונות עם התוכן הנכון', async () => {
  const page = await newPage(browser);
  await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx/, r => r.fulfill({ path: LIB, contentType: 'text/javascript' }));
  await login(page, server.url, 'admin');
  await page.evaluate(([a, b]) => {
    S.timetable.push({ id: 'Ljoint', day: 5, period: 1, subject: 'חסידות', teacher: 'הרב משותף', classes: [a, b], type: 'class' });
    goTab('schedule');
  }, [CLASSES[0], CLASSES[1]]);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="tt-export"]')]);
  const buf = await (await dl.createReadStream()).toArray().then(a => Buffer.concat(a));
  const wb = XLSX.read(buf, { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['כיתות', 'מורים', 'מקצועות', 'מסכם']);
  assert.ok(wb.Workbook.Views[0].RTL, 'מימין לשמאל');
  const rows = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
  const c = rows('כיתות');
  assert.ok(c.some(r => String(r[0]).startsWith('כיתה: ' + CLASSES[0])), 'בלוק לכל כיתה');
  assert.ok(c.some(r => r.some(v => /חשבון – /.test(v))), 'תא עם מקצוע ומורה');
  assert.ok(c.some(r => r.some(v => /^יום שישי$/.test(v))), 'עמודת יום שישי כשיש בו שיעור');
  const t = rows('מורים');
  assert.ok(t.some(r => r[0] === 'מורה: הרב משותף'));
  assert.ok(t.some(r => r.some(v => v === 'חסידות – ' + CLASSES[0] + ', ' + CLASSES[1])), 'אצל המורה: המקצוע והכיתות');
  const sb = rows('מקצועות'); const h = sb[0];
  const chas = sb.find(r => r[0] === 'חסידות');
  assert.equal(chas[h.indexOf(CLASSES[0])], 1); assert.equal(chas[h.indexOf(CLASSES[1])], 1);
  assert.equal(chas[h.indexOf('סה״כ שיעורים')], 1, 'משותף נספר פעם אחת בסה״כ');
  const n = await page.evaluate(() => S.timetable.length);
  assert.equal(sb.find(r => r[0] === 'סה״כ')[h.indexOf('סה״כ שיעורים')], n);
  const m = rows('מסכם');
  assert.deepEqual(m[0].slice(0, 2), ['יום', 'שיעור']); assert.ok(CLASSES.every(c => m[0].includes(c)));
  assert.ok(m.some(r => r[0] === 'סיכום מורים')); assert.ok(m.some(r => r[0] === 'סיכום כיתות'));
  const row = m.find(r => r[0] === 'הרב משותף'); assert.equal(row[1], 1);
  assert.deepEqual(page.errors, []);
});
