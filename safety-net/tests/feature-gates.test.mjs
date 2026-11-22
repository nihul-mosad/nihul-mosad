// v80: תכונות חדשות — המנהל רואה מיד, הצוות רק אחרי שהמנהל בחר "כל הצוות" בהגדרות. נבדק על יומן השעות הפרטניות.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, settle, serverDoc, INST } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const addPriv = () => {
  const c = S.config.classes[0], st = S.students.filter(s => s.cls === c).slice(0, 2);
  S.timetable = S.timetable.filter(x => x.id !== 'PVG').concat([{ id: 'PVG', day: 0, period: 1, subject: 'קריאה', teacher: S.me.teacher, classes: [c], type: 'private', students: st.map(s => s.id) }]);
  render();
};
const navTabs = page => page.$$eval('.nav button[data-tab]', b => b.map(x => x.dataset.tab));

test('מורה עם שעה פרטנית: בלי אישור המנהל לא רואה את היומן; אחרי "כל הצוות" — רואה', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  await page.evaluate(addPriv);
  assert.ok(!(await navTabs(page)).includes('priv'), 'ברירת מחדל: הלשונית מוסתרת מהצוות');
  assert.equal(await page.evaluate(() => feat('priv')), false);
  assert.equal(await page.evaluate(() => pvCardSection(S.students[0])), '');
  await page.evaluate(() => { S.config.feats = { priv: 'all' }; render(); });
  assert.ok((await navTabs(page)).includes('priv'), 'אחרי פתיחה לצוות הלשונית מופיעה');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('מנהל: רואה את היומן מיד, והמתג בהגדרות נשמר בשרת ואפשר לבטל', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  assert.ok((await navTabs(page)).includes('priv'), 'המנהל רואה בלי לפתוח');
  await page.evaluate(() => goTab('settings'));
  await page.waitForSelector('#featCard');
  assert.match(await page.textContent('#featCard'), /יומן שעות פרטניות/);
  assert.match(await page.textContent('#featCard'), /רק אני/);
  await page.click('#featCard [data-act="feat-set"][data-k="priv"][data-to="all"]');
  await settle(page);
  let cfg = await serverDoc(page, 'insts/' + INST + '/store/config');
  assert.equal((cfg.v || cfg).feats.priv, 'all', 'נשמר בשרת');
  assert.match(await page.textContent('#featCard'), /פתוח לכל הצוות/);
  await page.click('#featCard [data-act="feat-set"][data-k="priv"][data-to="admin"]');
  await settle(page);
  cfg = await serverDoc(page, 'insts/' + INST + '/store/config');
  assert.equal((cfg.v || cfg).feats.priv, 'admin', 'הוחזר לבדיקה');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
