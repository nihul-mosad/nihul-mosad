// צוות מאוחד: כל מורה שמופיע במערכת השעות, כמחנך או כמשתמש — מופיע פעם אחת ברשימת הצוות,
// עם החינוך, השיעורים והכניסה שלו; יצירת כרטיסים לכולם ניתנת לביטול; שום נתון אחר לא משתנה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

test('צוות: כל מורי מערכת השעות והמשתמשים מופיעים פעם אחת, עם מחנך/שיעורים/כניסה', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const r = await page.evaluate(() => { S.tab = 'staff'; render();
    const names = staffRoster().map(p => p.name), tt = Array.from(new Set(S.timetable.map(l => l.teacher).filter(Boolean)));
    const linked = S.config.users.filter(u => u.teacher).map(u => u.teacher);
    return { names, tt, linked, rows: document.querySelectorAll('#main tbody tr').length, hr: staffRoster().filter(p => p.hr.length).map(p => [p.name, p.hr]),
      userOf: staffRoster().filter(p => p.user).map(p => p.name) }; });
  assert.equal(new Set(r.names).size, r.names.length, 'כפילות ברשימה');
  for (const t of r.tt.concat(r.linked)) assert.ok(r.names.includes(t), 'חסר: ' + t);
  assert.equal(r.rows, r.names.length);
  for (const t of r.linked) assert.ok(r.userOf.includes(t), 'הכניסה לא קושרה: ' + t);
  assert.ok(r.hr.length > 0);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('צוות: "יצירת כרטיסים לכולם" לא נוגע במערכת השעות ובמשתמשים, וניתן לביטול', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const before = await page.evaluate(() => { S.tab = 'staff'; render(); return { staff: S.staff.length, tt: JSON.stringify(S.timetable), users: JSON.stringify(S.config.users), miss: staffRoster().filter(p => !p.rec).length }; });
  assert.ok(before.miss > 0);
  await page.click('[data-act="staff-import"]');
  const mid = await page.evaluate(() => ({ staff: S.staff.length, tt: JSON.stringify(S.timetable), users: JSON.stringify(S.config.users), miss: staffRoster().filter(p => !p.rec).length, hint: !!document.querySelector('.staff-hint') }));
  assert.equal(mid.staff, before.staff + before.miss);
  assert.equal(mid.miss, 0); assert.equal(mid.hint, false);
  assert.equal(mid.tt, before.tt); assert.equal(mid.users, before.users);
  await page.click('#toast .undo');
  assert.equal(await page.evaluate(() => S.staff.length), before.staff);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('צוות: "יצירת כניסה" פותח טופס משתמש בהגדרות עם שם המורה; "השלמת פרטים" ממלא את השם', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  await page.evaluate(() => { S.tab = 'staff'; render(); });
  const nm = await page.$eval('[data-act="staff-new"][data-name]', b => b.dataset.name);
  await page.click('[data-act="staff-new"][data-name]');
  assert.equal(await page.$eval('#s-name', i => i.value), nm);
  await page.evaluate(() => { S.editStaff = null; render(); });
  const btn = await page.$('[data-act="staff-login"]');
  if (btn) { const t = await btn.evaluate(b => b.dataset.name); await btn.click();
    assert.equal(await page.evaluate(() => [S.tab, S.editUser && S.editUser.teacher].join('|')), 'settings|' + t); }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
