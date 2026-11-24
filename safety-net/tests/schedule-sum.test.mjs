// מערכת שעות — סיכום שעות (טבלה דינמית): כיתה × מקצוע, סינונים, שיעור משותף, תחום קודש/חול, פירוט תא וייצוא.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';
import { CLASSES } from '../seed.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

async function open(page) {
  await login(page, server.url, 'admin');
  // שיעור משותף לשתי הכיתות הראשונות + שיעור פרטני
  await page.evaluate(([a, b]) => {
    S.timetable.push({ id: 'Ljoint', day: 5, period: 1, subject: 'חסידות', teacher: 'הרב משותף', classes: [a, b], type: 'class' });
    S.timetable.push({ id: 'Lpriv', day: 4, period: 3, subject: 'חשבון', teacher: 'מורה פרטני', classes: [a], type: 'private', students: [] });
    goTab('schedule'); S.ttMode = 'sum'; render();
  }, [CLASSES[0], CLASSES[1]]);
}
const cell = (page, r, c) => page.$eval(`td[data-r="${r}"][data-c="${c}"]`, e => e.textContent.trim()).catch(() => '');

test('סיכום שעות: כיתה × מקצוע, סה״כ, ושיעור משותף נספר לכל כיתה', async () => {
  const page = await newPage(browser);
  await open(page);
  const heads = await page.$$eval('table.tst thead th', a => a.map(x => x.textContent.trim()));
  assert.deepEqual(heads.slice(0, 1), ['כיתה']); assert.ok(heads.includes('חשבון') && heads.includes('גמרא') && heads.includes('חסידות'));
  assert.equal(await cell(page, CLASSES[0], 'חשבון'), '6', '5 כיתתיים + 1 פרטני');
  assert.equal(await cell(page, CLASSES[0], 'גמרא'), '5');
  assert.equal(await cell(page, CLASSES[0], 'חסידות'), '1');
  assert.equal(await cell(page, CLASSES[1], 'חסידות'), '1', 'משותף נספר גם לכיתה השנייה');
  assert.equal(await page.$eval(`tr:has(th:text-is("${CLASSES[0]}")) td.tot`, e => e.textContent.trim()), '12');
  assert.deepEqual(page.errors, []);
});

test('סיכום שעות: מסננים, החלפת שורות ועמודות, ספירה חד-פעמית בלי פילוח לפי כיתה, תחום קודש/חול', async () => {
  const page = await newPage(browser);
  await open(page);
  await page.click('[data-act="ts-f"][data-k="type"][data-v="כיתתי"]');
  assert.equal(await cell(page, CLASSES[0], 'חשבון'), '5', 'בלי הפרטני');
  await page.click('[data-act="ts-clear"]');
  // מורה × תחום
  await page.selectOption('[data-ts="rows"]', 'teacher');
  await page.selectOption('[data-ts="cols"]', 'cat');
  assert.equal(await cell(page, 'הרב משותף', 'קודש'), '1', 'שיעור משותף נספר פעם אחת למורה');
  const all = await page.$eval('table.tst tfoot td.tot', e => e.textContent.trim());
  const n = await page.evaluate(() => S.timetable.length);
  assert.equal(all, String(n), 'הסה״כ הכללי = מספר השיעורים בפועל');
  await page.click('[data-act="ts-swap"]');
  assert.equal(await page.evaluate(() => S.ttSum.rows + '/' + S.ttSum.cols), 'cat/teacher');
  // תיקון תחום של מקצוע נשמר
  await page.evaluate(() => { document.querySelector('details.noprint').open = true; });
  await page.selectOption('[data-tscat="חסידות"]', 'אחר');
  await page.waitForFunction(() => (S.config.subjCat || {})['חסידות'] === 'אחר');
  assert.deepEqual(page.errors, []);
});

test('סיכום שעות: פירוט תא מציג את השיעורים, ושעות לפי מבנה היום', async () => {
  const page = await newPage(browser);
  await open(page);
  await page.click(`td[data-r="${CLASSES[0]}"][data-c="חשבון"]`);
  const dr = await page.$eval('.tsdrill', e => e.innerText);
  assert.match(dr, /6 שיעורים/); assert.match(dr, /פרטני/);
  await page.selectOption('[data-ts="meas"]', 'h');
  const v = await cell(page, CLASSES[0], 'גמרא');
  const exp = await page.evaluate(() => { const m = n => tsMins(n); return String(Math.round(5 * m(1) / 60 * 4) / 4).replace(/\.0+$/, ''); });
  assert.equal(v, exp, 'שעות = סכום אורכי השיעורים');
  assert.deepEqual(page.errors, []);
});
