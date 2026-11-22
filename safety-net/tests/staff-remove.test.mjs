// v82: "הסרת איש צוות" — מוחק כניסה, כרטיס וקוד נוכחות; מעביר/מסיר שיעורים, מחנך ותורנויות; שומר היסטוריה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, settle, serverDump, USERS, INST } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });
const B = 'insts/' + INST + '/';

test('הסרה מלאה של מורה: כניסה, כרטיס, קוד, שיעורים עוברים, מחנך מוסר, תורנות עוברת; נוכחות עבר נשארת בדוח', async () => {
  const page = await newPage(browser, { width: 1280, height: 900 });
  await login(page, server.url, 'admin');
  const M = USERS.teacherMath.teacher, A = USERS.teacherA.teacher;
  // הכנה: כרטיס, קוד נוכחות, החתמה מהעבר, מחנך כיתה ב׳, תורנות, ושיעור במערכת
  await page.evaluate(async ({ M, B }) => {
    S.staff = [{ id: 'SM', name: M, role: 'מורה' }]; await save(K.staff, S.staff);
    await FS.doc(B + 'clockcodes/6161').set({ sid: 'SM', name: M, active: true });
    await FS.doc(B + 'punch/OLD').set({ sid: 'SM', name: M, type: 'in', t: Date.now() - 864e5, day: daysAgo(1), hm: '08:00', src: 'web' });
    S.config.homeroom = Object.assign({}, S.config.homeroom, { [S.config.classes[1]]: M });
    if (!S.timetable.some(l => l.teacher === M)) S.timetable.push({ id: 'TM1', day: 0, period: 3, subject: 'חשבון', teacher: M, classes: [S.config.classes[1]], type: 'class' });
    await save(K.timetable, S.timetable);
    await saveDuty({ slots: [{ id: 'd1', name: 'הפסקה', start: '10:00', end: '10:15' }], cells: { d1: { 0: { n: M, u: 'U_TM' }, 1: { n: 'מישהו אחר', u: '' } } } });
    goTab('staff');
  }, { M, B });
  const nLessons = await page.evaluate(M => S.timetable.filter(l => l.teacher === M).length, M);
  assert.ok(nLessons > 0);

  await page.click('[data-act="staff-rm"][data-name="' + M + '"]');
  await page.waitForSelector('#rmCard');
  const card = await page.textContent('#rmCard');
  assert.match(card, /math/); assert.match(card, new RegExp(nLessons + ' שיעורים')); assert.match(card, /מחנך של/); assert.match(card, /1 תורנויות/);
  // בלי בחירה — לא מתבצע
  await page.click('[data-act="staff-rm-go"]');
  assert.ok(await page.$('#rmCard'), 'נשאר פתוח עד שבוחרים');
  await page.selectOption('#rmTT', A); await page.selectOption('#rmHR', '__del'); await page.selectOption('#rmDuty', A);
  await page.click('[data-act="staff-rm-go"]');
  await page.waitForFunction(() => !document.getElementById('rmCard'));
  await settle(page);

  const D = (await serverDump(page)); const docs = D.docs || D;
  assert.equal(docs[B + 'members/U_TM'], undefined, 'הכניסה נמחקה');
  assert.equal(Object.keys(docs).filter(k => k.indexOf('logins/' + INST + '_') === 0 && docs[k].email === USERS.teacherMath.email).length, 0, 'שם המשתמש נמחק');
  assert.equal(docs[B + 'clockcodes/6161'], undefined, 'קוד הנוכחות בוטל');
  assert.ok(docs[B + 'punch/OLD'], 'ההחתמה מהעבר נשמרה');
  const st = await page.evaluate(M => ({ tt: S.timetable.filter(l => l.teacher === M).length, staff: S.staff.some(s => s.name === M),
    hr: Object.values(S.config.homeroom || {}).includes(M), duty: S.config.duty.cells.d1[0], other: S.config.duty.cells.d1[1].n,
    roster: staffRoster().some(p => p.name === M) }), M);
  assert.equal(st.tt, 0, 'אין שיעורים על שמו'); assert.equal(st.staff, false); assert.equal(st.hr, false);
  assert.equal(st.duty.n, A, 'התורנות עברה'); assert.equal(st.other, 'מישהו אחר', 'תורנות של אחר לא השתנתה');
  assert.equal(st.roster, false, 'לא מופיע יותר ברשימת הצוות');
  assert.equal(await page.evaluate(A => S.timetable.filter(l => l.id === 'TM1' || l.subject === 'חשבון').every(l => l.teacher === A), A), true, 'השיעורים עברו למחליף');
  const cfg = docs[B + 'store/config'].v;
  assert.ok(!Object.values(cfg.homeroom || {}).includes(M), 'המחנך הוסר גם בשרת');
  assert.equal(cfg.duty.cells.d1[0].n, A, 'התורנות נשמרה בשרת');
  // דוח הנוכחות: עדיין רואים אותו בחודש שעבד, ולא ברשימת הקודים
  await page.evaluate(() => { S.sc = null; goTab('sclock'); });
  await page.waitForFunction(() => S.sc && S.sc.loaded);
  assert.ok(await page.evaluate(M => scStaff().some(s => s.name === M && s.former), M), 'מופיע בדוח כעובד לשעבר');
  await page.click('[data-act="sc-view"][data-v="codes"]');
  assert.doesNotMatch(await page.textContent('#main'), new RegExp(M));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('אי אפשר להסיר את עצמך', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'admin');
  await page.evaluate(() => { S.config.users.find(u => u.id === S.me.id).teacher = 'המנהל'; goTab('staff'); });
  assert.equal(await page.$('[data-act="staff-rm"][data-name="המנהל"]'), null);
  await page.context().close();
});
