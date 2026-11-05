// בדיקות מקצה לקצה מול Firebase Emulator האמיתי של Google (Auth + Firestore + חוקי האבטחה של המערכת):
// שמירה רגילה, וכמה מורים שעובדים במקביל — כל אחד בדפדפן נפרד, בדיוק כמו בפועל.
// הרצה: npm run test:emulator (מפעיל את האמולטור לבד; דורש Java). רץ ב-GitHub Actions.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, INST, watchToasts, shown, waitShown, schoolDays, markLesson, iso } from './helpers.mjs';
import { keyify, CLASSES, USERS } from '../seed.mjs';
import { seedEmulator } from '../seed-emulator.mjs';

const FILE = 'staging-emulator.html';
let server, browser, env;
before(async () => {
  ({ env } = await seedEmulator());
  server = await startServer(); browser = await launch();
});
after(async () => { if (browser) await browser.close(); if (server) server.srv.close(); if (env) await env.cleanup(); });

const B = 'insts/' + INST + '/';
const attPath = (date, cls, teacher) => B + 'att/L' + date.slice(0, 7) + '_' + keyify(cls) + '_' + keyify(teacher);
async function dbDoc(p) { let out = null; await env.withSecurityRulesDisabled(async ctx => { const s = await ctx.firestore().doc(p).get(); out = s.exists ? s.data() : null; }); return out; }
const cell = (doc, date, key) => ((doc && doc.d && doc.d[date]) || {})[key];
async function open(who) { const page = await newPage(browser, { seed: false }); await login(page, server.url, who, FILE); await watchToasts(page); return page; }
function noErrors(page) {
  assert.deepEqual(page.errors, [], 'שגיאות JavaScript');
  return shown(page).then(s => assert.ok(!s.some(x => /נכשלה|אין הרשאה/.test(x)), 'הוצגה הודעת שגיאה: ' + s.join(' | ')));
}
// ימי לימוד ייחודיים לכל בדיקה, כדי שהבדיקות לא ישפיעו זו על זו
const DAYS = schoolDays(14);
function pairSameMonth(from) { for (let i = from; i < DAYS.length - 1; i++) if (DAYS[i].getMonth() === DAYS[i + 1].getMonth()) return [DAYS[i], DAYS[i + 1]]; throw new Error('no pair'); }

test('אמולטור: שמירה רגילה — מחנך שומר, "נשמרה" מוצג, הנתון בשרת, והמנהל רואה אותו', async () => {
  const t = await open('teacherA');
  const m = await markLesson(t, DAYS[0], { s2: 'absent' });
  await waitShown(t, 'הנוכחות נשמרה');
  const doc = await dbDoc(attPath(m.date, CLASSES[0], USERS.teacherA.teacher));
  assert.equal(cell(doc, m.date, m.lid + ':s2'), 'absent');
  assert.equal(cell(doc, m.date, m.lid + ':s1'), 'present');
  await noErrors(t);
  const a = await open('admin');
  assert.equal(await a.evaluate(([d, k]) => (S.latt[d] || {})[k], [m.date, m.lid + ':s2']), 'absent', 'המנהל לא רואה את הסימון');
  await t.context().close(); await a.context().close();
});

test('אמולטור: שני מורים שומרים באותו רגע באותה כיתה ובאותו יום — שני הסימונים נשמרים', async () => {
  const [t1, t2] = await Promise.all([open('teacherA'), open('teacherMath')]);
  const day = DAYS[1];
  const [m1, m2] = await Promise.all([markLesson(t1, day, { s1: 'late' }, 1), markLesson(t2, day, { s3: 'absent' }, 2)]);
  await Promise.all([waitShown(t1, 'הנוכחות נשמרה'), waitShown(t2, 'הנוכחות נשמרה')]);
  assert.equal(cell(await dbDoc(attPath(m1.date, CLASSES[0], USERS.teacherA.teacher)), m1.date, m1.lid + ':s1'), 'late');
  assert.equal(cell(await dbDoc(attPath(m2.date, CLASSES[0], USERS.teacherMath.teacher)), m2.date, m2.lid + ':s3'), 'absent');
  await noErrors(t1); await noErrors(t2);
  const a = await open('admin');
  const seen = await a.evaluate(([d, k1, k2]) => [(S.latt[d] || {})[k1], (S.latt[d] || {})[k2]], [m1.date, m1.lid + ':s1', m2.lid + ':s3']);
  assert.deepEqual(seen, ['late', 'absent'], 'המנהל לא רואה את שני הסימונים');
  await Promise.all([t1, t2, a].map(p => p.context().close()));
});

test('אמולטור: אותו מורה בשני מכשירים יוצרים באותו רגע את מסמך החודש — שום סימון לא נדרס (3 סבבים)', async () => {
  const [p1, p2] = await Promise.all([open('teacherA'), open('teacherA')]);
  const [d1, d2] = pairSameMonth(3), path = attPath(iso(d1), CLASSES[0], USERS.teacherA.teacher);
  const ST = ['absent', 'late', 'excused'];
  for (let k = 0; k < 3; k++) {
    // המצב הכי רגיש: המסמך של החודש לא קיים, ושני המכשירים יוצרים אותו באותו רגע
    await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc(path).delete());
    await p1.evaluate(() => { window.__shown.length = 0; }); await p2.evaluate(() => { window.__shown.length = 0; });
    const [m1, m2] = await Promise.all([markLesson(p1, d1, { s4: ST[k] }), markLesson(p2, d2, { s2: ST[(k + 1) % 3] })]);
    await Promise.all([waitShown(p1, 'הנוכחות נשמרה'), waitShown(p2, 'הנוכחות נשמרה')]);
    const doc = await dbDoc(path);
    assert.equal(cell(doc, m1.date, m1.lid + ':s4'), ST[k], 'סבב ' + (k + 1) + ': הסימון של מכשיר 1 נדרס');
    assert.equal(cell(doc, m2.date, m2.lid + ':s2'), ST[(k + 1) % 3], 'סבב ' + (k + 1) + ': הסימון של מכשיר 2 נדרס');
  }
  await noErrors(p1); await noErrors(p2);
  await p1.context().close(); await p2.context().close();
});

test('אמולטור: מורה מקצועי מדווח אירוע בזמן שהמחנך שומר נוכחות באותה כיתה — שניהם נשמרים', async () => {
  const [t, m] = await Promise.all([open('teacherA'), open('teacherMath')]);
  const report = (async () => {
    await m.evaluate(() => { S.tab = 'events'; render(); });
    await m.click('[data-act="ev-new"]');
    await m.click(`[data-act="ev-cls"][data-c="${CLASSES[0]}"]`);
    await m.click('[data-act="ev-stu"][data-id="s2"]');
    await m.click('[data-act="ev-type"][data-t="e3"]');
    await m.fill('#ev-note', 'בדיקה במקביל');
    await m.click('[data-act="ev-save"]');
  })();
  const [mk] = await Promise.all([markLesson(t, DAYS[5], { s2: 'absent' }), report]);
  await waitShown(t, 'הנוכחות נשמרה');
  await m.waitForTimeout(1500);
  assert.equal(cell(await dbDoc(attPath(mk.date, CLASSES[0], USERS.teacherA.teacher)), mk.date, mk.lid + ':s2'), 'absent');
  const evDate = await m.evaluate(() => S.events[S.events.length - 1].date);
  const evDoc = await dbDoc(attPath(evDate, CLASSES[0], USERS.teacherMath.teacher));
  assert.ok(evDoc && evDoc.ev && Object.values(evDoc.ev).some(e => e.note === 'בדיקה במקביל'), 'האירוע לא נשמר');
  await noErrors(t); await noErrors(m);
  await t.context().close(); await m.context().close();
});

test('אמולטור (מ2): המנהל מעביר תלמיד בזמן שהמחנך שומר — ההיסטוריה של התלמיד נשמרת בשרת האמיתי', async () => {
  const [t, a] = await Promise.all([open('teacherA'), open('admin')]);
  const m1 = await markLesson(t, DAYS[6], { s4: 'absent' });
  await waitShown(t, 'הנוכחות נשמרה');
  // במקביל: המנהל מעביר את s4 לכיתה ב', והמחנך שומר שיעור נוסף
  await Promise.all([
    a.evaluate(c => { const s = S.students.find(x => x.id === 's4'); s.cls = c; return save(K.students, S.students); }, CLASSES[1]),
    markLesson(t, DAYS[7], {})
  ]);
  // המחנך נכנס מחדש (s4 כבר לא בכיתה שלו) ושומר שוב
  await t.context().close();
  const t2 = await open('teacherA');
  const ids = await t2.evaluate(() => S.students.map(s => s.id).sort());
  assert.deepEqual(ids, ['s1', 's2', 's3'], 'רשימת התלמידים של המחנך אחרי המעבר');
  await markLesson(t2, DAYS[8], {});
  await waitShown(t2, 'הנוכחות נשמרה');
  const doc = await dbDoc(attPath(m1.date, CLASSES[0], USERS.teacherA.teacher));
  assert.equal(cell(doc, m1.date, m1.lid + ':s4'), 'absent', 'החיסור ההיסטורי של s4 נמחק');
  const cls = await dbDoc(B + 'cls/' + keyify(CLASSES[1]));
  assert.ok(cls && cls.m && cls.m.s4, 'המעבר לכיתה ב׳ לא נשמר');
  await noErrors(t2); await noErrors(a);
  await t2.context().close(); await a.context().close();
});

test('אמולטור: כשהמנהל מחובר ועובד, ההרשאות של המחנך לא משתנות', async () => {
  const a = await open('admin');
  await a.evaluate(() => { S.tab = 'students'; render(); S.tab = 'dash'; render(); });
  await a.waitForTimeout(1500);
  const mem = await dbDoc(B + 'members/' + USERS.teacherA.uid);
  if (mem) assert.ok((mem.classes || []).indexOf(keyify(CLASSES[0])) > -1, 'המחנך איבד את הגישה לכיתה שלו: ' + JSON.stringify(mem.classes));
  const t = await open('teacherA');
  assert.ok((await t.evaluate(() => S.students.length)) > 0, 'המחנך לא רואה את התלמידים שלו');
  await a.context().close(); await t.context().close();
});
