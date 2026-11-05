// בדיקות לתיקוני שלב 1:
//   מ1 — הודעת "נשמר" מוצגת רק אחרי שהשרת אישר; בכישלון או בהשהיה המשתמש רואה זאת.
//   מ2 — מעבר תלמיד בין כיתות לא מוחק את ההיסטוריה שלו (נוכחות ותמונת מצב).
// כולן חובה: אם אחת נכשלת, הפרסום נחסם.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, serverDoc, settle, INST, watchToasts, shown, waitShown, schoolDays, markLesson, iso } from './helpers.mjs';
import { keyify, CLASSES, USERS } from '../seed.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });
const B = 'insts/' + INST + '/';
const attPath = (date, cls, teacher) => B + 'att/L' + date.slice(0, 7) + '_' + keyify(cls) + '_' + keyify(teacher);
async function relogin(page, who) { await page.evaluate(() => logout()).catch(() => {}); await page.waitForTimeout(400); await login(page, server.url, who); }
async function moveStudent(page, sid, cls) {
  await page.evaluate(([id, c]) => { const s = S.students.find(x => x.id === id); s.cls = c; return save(K.students, S.students); }, [sid, cls]);
  await settle(page);
}

/* ---------- מ1 ---------- */

test('מ1: שמירה רגילה — מוצג "שומר…" ואז "הנוכחות נשמרה", והנתון בשרת', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  await watchToasts(page);
  await page.evaluate(() => { window.__fakefs.writeDelayMs = 300; });
  const [d] = schoolDays(1);
  const m = await markLesson(page, d, { s2: 'absent' });
  await waitShown(page, 'הנוכחות נשמרה');
  const seq = await shown(page);
  assert.ok(seq.indexOf('שומר…') > -1 && seq.indexOf('שומר…') < seq.indexOf('הנוכחות נשמרה'), 'סדר ההודעות: ' + seq.join(' | '));
  assert.equal((await serverDoc(page, attPath(m.date, CLASSES[0], USERS.teacherA.teacher))).d[m.date][m.lid + ':s2'], 'absent');
  assert.deepEqual(page.errors, []);
});

test('מ1: כששמירה נכשלת לא מוצג "נשמר", מוצגת שגיאה, ושמירה חוזרת מצליחה', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  await watchToasts(page);
  const [d] = schoolDays(2).slice(1);
  await page.evaluate(() => { window.__fakefs.failWrites = 'unavailable'; });
  const m = await markLesson(page, d, { s3: 'late' });
  await waitShown(page, 'השמירה נכשלה');
  await page.waitForTimeout(300);
  let seq = await shown(page);
  assert.ok(!seq.includes('הנוכחות נשמרה'), 'הוצג "נשמרה" למרות כישלון: ' + seq.join(' | '));
  const p = attPath(m.date, CLASSES[0], USERS.teacherA.teacher);
  assert.ok(!((await serverDoc(page, p)) || { d: {} }).d[m.date], 'הנתון לא אמור להיות בשרת');
  // הסימון נשאר במכשיר: פותחים שוב ושומרים כשהחיבור חזר
  await page.evaluate(() => { window.__fakefs.failWrites = null; window.__shown.length = 0; });
  await page.click(`button.lrow[data-id="${m.lid}"]`);
  const kept = await page.evaluate(() => S.ldraft.s3);
  assert.equal(kept, 'late', 'הסימון לא נשאר על המסך אחרי הכישלון');
  await page.click('[data-act="lm-save"]'); await settle(page);
  await waitShown(page, 'הנוכחות נשמרה');
  assert.equal((await serverDoc(page, p)).d[m.date][m.lid + ':s3'], 'late', 'השמירה החוזרת לא הגיעה לשרת');
});

test('מ1: אין הרשאה — לא מוצג "נשמר" אלא "אין הרשאה לשמור"', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  await watchToasts(page);
  await page.evaluate(() => { window.__fakefs.failWrites = 'permission-denied'; });
  await markLesson(page, schoolDays(3)[2], {});
  await waitShown(page, 'אין הרשאה לשמור');
  assert.ok(!(await shown(page)).includes('הנוכחות נשמרה'));
});

test('מ1: חיבור איטי — מוצגת אזהרה, סגירת הדף מבקשת אישור, ובסוף "נשמרה"', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  await watchToasts(page);
  await page.evaluate(() => { window.__fakefs.writeDelayMs = 6800; });
  const m = await markLesson(page, schoolDays(4)[3], { s4: 'excused' }, 1, false);
  await waitShown(page, 'השמירה מתעכבת', 9000);
  assert.ok(!(await shown(page)).includes('הנוכחות נשמרה'), 'הוצג "נשמרה" לפני שהשרת אישר');
  const warns = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  assert.ok(warns, 'סגירת הדף באמצע שמירה לא מבקשת אישור');
  await waitShown(page, 'הנוכחות נשמרה', 25000);
  await settle(page);
  assert.equal((await serverDoc(page, attPath(m.date, CLASSES[0], USERS.teacherA.teacher))).d[m.date][m.lid + ':s4'], 'excused');
  const after = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  assert.ok(!after, 'אחרי שהשמירה הסתיימה, סגירת הדף לא אמורה לבקש אישור');
});

/* ---------- מ2 ---------- */

test('מ2: מחנך שומר נוכחות אחרי שתלמיד עבר כיתה — החיסור הישן של התלמיד נשאר', async () => {
  const page = await newPage(browser);
  const [d1, d2] = schoolDays(2);
  await login(page, server.url, 'teacherA');
  const m1 = await markLesson(page, d2, { s1: 'absent' });
  const pA = attPath(m1.date, CLASSES[0], USERS.teacherA.teacher);
  assert.equal((await serverDoc(page, pA)).d[m1.date][m1.lid + ':s1'], 'absent', 'הכנה');
  await relogin(page, 'admin');
  await moveStudent(page, 's1', CLASSES[1]);
  await relogin(page, 'teacherA');
  await markLesson(page, d1, {});
  assert.equal((await serverDoc(page, pA)).d[m1.date][m1.lid + ':s1'], 'absent', 'החיסור ההיסטורי נמחק');
  // והתלמיד שעבר כבר לא נכלל בסימון החדש של הכיתה הקודמת
  const m2key = 'L0' + d1.getDay() + '1:s1';
  assert.equal(((await serverDoc(page, attPath(iso(d1), CLASSES[0], USERS.teacherA.teacher))).d[iso(d1)] || {})[m2key], undefined);
  assert.deepEqual(page.errors, []);
});

test('מ2: מנהל שומר נוכחות אחרי מעבר כיתה — הנתון הישן לא זז ולא נמחק', async () => {
  const page = await newPage(browser);
  const [, , d3] = schoolDays(3);
  await login(page, server.url, 'teacherA');
  const m = await markLesson(page, d3, { s2: 'late' });
  await relogin(page, 'admin');
  await moveStudent(page, 's2', CLASSES[2]);
  // המנהל מתקן נתון אחר באותו יום ושומר נוכחות
  await page.evaluate(([d, k]) => { S.latt[d][k] = 'absent'; LIDX = null; return save(K.latt, S.latt); }, [m.date, m.lid + ':s3']);
  await settle(page);
  const pA = attPath(m.date, CLASSES[0], USERS.teacherA.teacher), docA = await serverDoc(page, pA);
  assert.equal(docA.d[m.date][m.lid + ':s2'], 'late', 'האיחור של s2 נמחק מהמסמך של כיתה א׳');
  assert.equal(docA.d[m.date][m.lid + ':s3'], 'absent', 'התיקון של המנהל לא נשמר');
  const docC = await serverDoc(page, attPath(m.date, CLASSES[2], USERS.teacherA.teacher));
  assert.ok(!docC || !((docC.d || {})[m.date] || {})[m.lid + ':s2'], 'הנתון הועתק בטעות לכיתה החדשה');
});

test('מ2: תמונת מצב (רמזור) של תלמיד שעבר כיתה נשארת אחרי שמירה של המחנך הקודם', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  const today = iso(new Date());
  await page.evaluate(d => { S.reviews.push({ id: 'rv-s4', studentId: 's4', date: d, light: 'red', scores: {}, note: 'מבחן מ2' }); return save(K.reviews, S.reviews); }, today);
  await settle(page);
  const pR = B + 'rev/' + today.slice(0, 7) + '_' + keyify(CLASSES[0]);
  assert.ok((await serverDoc(page, pR)).r['rv-s4'], 'הכנה');
  await relogin(page, 'admin');
  await moveStudent(page, 's4', CLASSES[1]);
  await relogin(page, 'teacherA');
  await page.evaluate(d => { S.reviews.push({ id: 'rv-s3', studentId: 's3', date: d, light: 'green', scores: {}, note: '' }); return save(K.reviews, S.reviews); }, today);
  await settle(page);
  const doc = await serverDoc(page, pR);
  assert.ok(doc.r['rv-s4'], 'תמונת המצב של התלמיד שעבר כיתה נמחקה');
  assert.ok(doc.r['rv-s3'], 'תמונת המצב החדשה לא נשמרה');
});

test('מ2: מחיקה מכוונת עדיין עובדת — סימון שהמחנך מחק נמחק מהשרת', async () => {
  const page = await newPage(browser);
  await login(page, server.url, 'teacherA');
  const m = await markLesson(page, schoolDays(5)[4], { s3: 'absent' });
  await page.evaluate(([d, k]) => { delete S.latt[d][k]; LIDX = null; return save(K.latt, S.latt); }, [m.date, m.lid + ':s3']);
  await settle(page);
  const doc = await serverDoc(page, attPath(m.date, CLASSES[0], USERS.teacherA.teacher));
  assert.equal(doc.d[m.date][m.lid + ':s3'], undefined, 'מחיקה מכוונת לא נמחקה');
  assert.equal(doc.d[m.date][m.lid + ':s1'], 'present');
});
