// בדיקות תהליך: נוכחות, אירועים ותמונת מצב — דרך הממשק, עד ה"שרת" המדומה, וחזרה אצל משתמש אחר.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, serverDoc, settle, INST } from './helpers.mjs';
import { keyify, CLASSES, USERS } from '../seed.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function lastSchoolDay() { const d = new Date(); do { d.setDate(d.getDate() - 1); } while (d.getDay() > 4); return d; }
const B = 'insts/' + INST + '/';
async function relogin(page, who) {
  await page.evaluate(() => logout()).catch(() => {});
  await page.waitForTimeout(400);
  await login(page, server.url, who);
}
const click = (page, sel) => page.click(sel);

test('נוכחות: מחנך מסמן שיעור ושומר → הנתון בשרת → המנהל רואה אותו', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  const day = lastSchoolDay(), date = iso(day), lid = 'L0' + day.getDay() + '1';
  await page.evaluate(d => { S.tab = 'mark'; S.markView = 'lessons'; S.markDate = d; S.markLesson = null; render(); }, date);
  await click(page, `button.lrow[data-id="${lid}"]`);
  await click(page, '[data-act="lm-all"]');
  await click(page, '[data-act="lm-set"][data-id="s2"][data-s="absent"]');
  await click(page, '[data-act="lm-set"][data-id="s3"][data-s="late"]');
  await click(page, '[data-act="lm-save"]');
  await settle(page);

  const docPath = B + 'att/L' + date.slice(0, 7) + '_' + keyify(CLASSES[0]) + '_' + keyify(USERS.teacherA.teacher);
  const doc = await serverDoc(page, docPath);
  assert.ok(doc, 'מסמך הנוכחות לא נוצר בשרת: ' + docPath);
  const day0 = doc.d[date];
  assert.equal(day0[lid + ':s1'], 'present');
  assert.equal(day0[lid + ':s2'], 'absent');
  assert.equal(day0[lid + ':s3'], 'late');
  assert.equal(day0[lid + ':s4'], 'present');
  assert.equal(Object.keys(day0).length, 4, 'נשמרו תלמידים שלא בכיתה');

  await relogin(page, 'admin');
  const seen = await page.evaluate(([d, l]) => (S.latt[d] || {})[l + ':s2'], [date, lid]);
  assert.equal(seen, 'absent', 'המנהל לא רואה את הסימון אחרי טעינה מחדש');
  await page.evaluate(() => { S.tab = 'card'; S.cardId = 's2'; render(); });
  const card = await page.evaluate(() => document.getElementById('main').innerText);
  assert.match(card, /חיסור/, 'החיסור לא מופיע בכרטיס התלמיד');
  assert.deepEqual(page.errors, []);
});

test('אירועים: מורה מקצועי מדווח על תלמיד בכיתה אחרת → בשרת → בטבלת האירועים של המנהל', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherMath');
  await page.evaluate(() => { S.tab = 'events'; render(); });
  await click(page, '[data-act="ev-new"]');
  await click(page, `[data-act="ev-cls"][data-c="${CLASSES[2]}"]`);
  await click(page, '[data-act="ev-stu"][data-id="s9"]');
  await click(page, '[data-act="ev-type"][data-t="e3"]');
  await page.fill('#ev-note', 'בדיקה אוטומטית: דיבר בחוצפה');
  await click(page, '[data-act="ev-save"]');
  await settle(page);

  const today = iso(new Date()), evDate = await page.evaluate(() => S.events[S.events.length - 1].date);
  const docPath = B + 'att/L' + evDate.slice(0, 7) + '_' + keyify(CLASSES[2]) + '_' + keyify(USERS.teacherMath.teacher);
  const doc = await serverDoc(page, docPath);
  assert.ok(doc && doc.ev, 'האירוע לא נשמר בשרת: ' + docPath);
  const ev = Object.values(doc.ev)[0];
  assert.equal(ev.sid, 's9'); assert.equal(ev.type, 'e3'); assert.equal(ev.note, 'בדיקה אוטומטית: דיבר בחוצפה');
  assert.ok(evDate <= today);
  assert.deepEqual(Object.keys(doc).sort(), ['ev'], 'מורה שאינו מלמד בכיתה כתב שדות נוספים מלבד ev');

  await relogin(page, 'admin');
  await page.evaluate(() => { S.tab = 'events'; S.evView = 'table'; render(); });
  const txt = await page.evaluate(() => document.getElementById('main').innerText);
  assert.match(txt, /בדיקה אוטומטית: דיבר בחוצפה/);
  assert.match(txt, /לטיפול/, 'אירוע בחומרה בינונית צריך להופיע כ"לטיפול"');
  assert.deepEqual(page.errors, []);
});

test('תמונת מצב: מחנך ממלא רמזור, ציון והערה → בשרת → בכרטיס התלמיד אצל המנהל', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  await page.evaluate(c => { S.tab = 'review'; S.revCls = c; render(); }, CLASSES[0]);
  await click(page, '[data-act="rev-start"]');
  const first = await page.evaluate(() => S.revList[S.revIdx].id);
  await click(page, '[data-act="rev-light"][data-l="yellow"]');
  await click(page, '[data-act="rev-score"][data-d="d1"][data-n="4"]');
  await page.fill('[data-in="revNote"]', 'בדיקה אוטומטית: התקדמות יפה');
  await page.dispatchEvent('[data-in="revNote"]', 'input');
  await click(page, '[data-act="rev-next"]');
  await settle(page);

  const date = await page.evaluate(() => S.revDate);
  const doc = await serverDoc(page, B + 'rev/' + date.slice(0, 7) + '_' + keyify(CLASSES[0]));
  assert.ok(doc && doc.r, 'תמונת המצב לא נשמרה בשרת');
  const rec = Object.values(doc.r).find(r => r.studentId === first);
  assert.ok(rec, 'אין רשומה לתלמיד');
  assert.equal(rec.light, 'yellow'); assert.equal(rec.scores.d1, 4); assert.equal(rec.note, 'בדיקה אוטומטית: התקדמות יפה');

  await relogin(page, 'admin');
  await page.evaluate(id => { S.tab = 'card'; S.cardId = id; render(); }, first);
  const card = await page.evaluate(() => document.getElementById('main').innerText);
  assert.match(card, /בדיקה אוטומטית: התקדמות יפה/);
  assert.deepEqual(page.errors, []);
});

// מאפיין את ההתנהגות הנוכחית של ממצא מ1. מסומן todo: ידווח, אבל לא יחסום, עד שנתקן בשלב 1.
test('ממצא מ1: כששמירה נכשלת המשתמש לא רואה "נשמר"', { todo: 'יתוקן בשלב 1' }, async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  const day = lastSchoolDay(), date = iso(day), lid = 'L0' + day.getDay() + '1';
  await page.evaluate(d => { S.tab = 'mark'; S.markDate = d; S.markLesson = null; render(); }, date);
  await click(page, `button.lrow[data-id="${lid}"]`);
  await click(page, '[data-act="lm-all"]');
  await page.evaluate(() => { window.__fakefs.failWrites = 'permission-denied'; });
  const toasts = [];
  await page.exposeFunction('__toast', t => toasts.push(t));
  await page.evaluate(() => { const o = toast; window.toast = m => { window.__toast(m); o(m); }; });
  await click(page, '[data-act="lm-save"]');
  await page.waitForTimeout(500);
  assert.ok(!toasts.includes('הנוכחות נשמרה'), 'הוצגה הודעת "נשמרה" למרות שהשמירה נכשלה. הודעות: ' + toasts.join(' | '));
});
