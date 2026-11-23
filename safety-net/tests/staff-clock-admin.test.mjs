// v81: מסך "נוכחות צוות" של המנהל — הפעלה, קודים, שעות צפויות, איחורים, יציאות מוקדמות, חיסורים, אישור היעדרות ותיקון ידני.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, settle, serverDump, USERS, INST } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const B = 'insts/' + INST + '/';
const main = page => page.textContent('#main');
const waitMain = (page, re) => page.waitForFunction(r => new RegExp(r).test(document.getElementById('main').textContent), re.source, { timeout: 8000 });

test('מורה לא רואה את "נוכחות צוות"', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  const tabs = await page.$$eval('.nav [data-tab]', b => b.map(x => x.dataset.tab));
  assert.ok(!tabs.includes('sclock'));
  await page.evaluate(() => { S.tab = 'sclock'; render(); });
  assert.notEqual(await page.evaluate(() => S.tab), 'sclock', 'גם בכניסה ישירה — מועבר ללשונית אחרת');
  await page.context().close();
});

test('מנהל: קודים, הפעלה, חישוב יום וחודש, אישור היעדרות ותיקון ידני', async () => {
  const page = await newPage(browser, { width: 1366, height: 900 });
  await login(page, server.url, 'admin');
  // שני עובדים: מורה עם שיעור 1 בכל יום (08:00–09:00) ומזכירה בלי שיעורים
  const d = await page.evaluate(t => {
    S.staff = [{ id: 'STA', name: t, role: 'מורה' }, { id: 'STB', name: 'רחל המזכירה', role: 'מזכירה' }];
    let x = daysAgo(1); while (dow(x) > 4) x = addDaysIso(x, -1); // היום האחרון א׳–ה׳ שכבר עבר
    return x;
  }, USERS.teacherA.teacher);
  await page.evaluate(() => goTab('sclock'));
  await waitMain(page, /כבוי/);
  assert.ok((await page.$$eval('.nav [data-tab]', b => b.map(x => x.dataset.tab))).includes('sclock'));

  // קודים לכולם והפעלה
  await page.click('[data-act="sc-view"][data-v="codes"]');
  await page.click('[data-act="sc-codeall"]');
  await settle(page);
  let dump = await serverDump(page);
  const codes = Object.keys(dump.docs || dump).filter(k => k.indexOf(B + 'clockcodes/') === 0);
  assert.equal(codes.length, 2, 'הונפקו 2 קודים');
  assert.ok(codes.every(k => /\/\d{4}$/.test(k)), 'קודים של 4 ספרות');
  await page.click('[data-act="sc-on"][data-to="1"]');
  await waitMain(page, /השעון פעיל/);
  dump = await serverDump(page);
  assert.equal((dump.docs || dump)['insts/' + INST].clockOn, true, 'השעון הופעל בשרת');
  assert.match(await main(page), /clock\.html\?i=/, 'מוצג הקישור לעובדים');

  // שעות קבועות למזכירה ביום של d: 08:00–12:00
  await page.click('[data-act="sc-sched"][data-id="STB"]');
  const w = await page.evaluate(d => dow(d), d);
  await page.fill('[data-scw="' + w + '"][data-p="0"]', '08:00');
  await page.fill('[data-scw="' + w + '"][data-p="1"]', '12:00');
  await page.click('[data-act="sc-schedsave"][data-id="STB"]');
  await settle(page);

  // החתמות של המורה ביום d: כניסה 08:12, יציאה 08:40; למזכירה — בקשת מחלה ממתינה
  await page.evaluate(async ({ d, B }) => {
    const p = (type, hm) => ({ sid: 'STA', name: 'x', type, t: new Date(d + 'T' + hm + ':00').getTime(), day: d, hm, dev: 'D1', src: 'web' });
    await FS.doc(B + 'punch/P1').set(p('in', '08:12'));
    await FS.doc(B + 'punch/P2').set(p('out', '08:40'));
  }, { d, B });
  await page.click('[data-act="sc-reload"]');
  await page.click('[data-act="sc-view"][data-v="month"]');
  await page.evaluate(d => { S.sc.month = d.slice(0, 7); S.sc.loaded = false; render(); }, d);
  await waitMain(page, /ימי עבודה צפויים/);
  const r = await page.evaluate(d => { const a = scDay(S.staff[0], d), b = scDay(S.staff[1], d); return { aEx: a.ex, late: a.late, early: a.early, worked: a.worked, bAbsent: b.absent, bEx: b.ex }; }, d);
  assert.deepEqual(r.aEx, { from: '08:00', to: '09:00', src: 'מערכת' }, 'שעות צפויות ממערכת השעות');
  assert.equal(r.late, 12, 'איחור 12 דקות');
  assert.equal(r.early, 20, 'יציאה מוקדמת 20 דקות');
  assert.equal(r.worked, 28, '28 דקות');
  assert.deepEqual(r.bEx, { from: '08:00', to: '12:00', src: 'קבוע' }, 'שעות קבועות למזכירה');
  assert.equal(r.bAbsent, true, 'מזכירה בלי החתמה = חיסור');

  // בקשת היעדרות ממתינה ← אישור ← לא חיסור
  await page.evaluate(async ({ d, B }) => { await FS.doc(B + 'absreq/A1').set({ sid: 'STB', name: 'רחל המזכירה', from: d, to: d, reason: 'מחלה', note: '', status: 'pending', at: Date.now() }); }, { d, B });
  await page.click('[data-act="sc-reload"]');
  await waitMain(page, /בקשות היעדרות \(1\)/);
  await page.click('[data-act="sc-view"][data-v="abs"]');
  await page.click('[data-act="sc-aok"][data-id="A1"]');
  await settle(page);
  dump = await serverDump(page);
  assert.equal((dump.docs || dump)[B + 'absreq/A1'].status, 'approved');
  assert.equal(await page.evaluate(d => scDay(S.staff[1], d).absent, d), false, 'אחרי אישור — לא חיסור');
  await page.click('[data-act="sc-view"][data-v="month"]');
  assert.match(await main(page), /מחלה 1/);

  // תיקון ידני: כניסה למזכירה בדף העובד
  await page.click('[data-act="sc-emp"][data-id="STB"]');
  await waitMain(page, /תיקון ידני/);
  await page.fill('#scFixDate', d); await page.fill('#scFixHm', '08:03');
  await page.click('[data-act="sc-padd"][data-id="STB"]');
  await settle(page);
  dump = await serverDump(page);
  const man = Object.entries(dump.docs || dump).filter(([k, v]) => k.indexOf(B + 'punch/') === 0 && v.sid === 'STB');
  assert.equal(man.length, 1); assert.equal(man[0][1].src, 'manual'); assert.equal(man[0][1].hm, '08:03');
  assert.match(await main(page), /תוקן ידנית/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
