// בדיקות לחוקי האבטחה (firestore.rules) מול Firebase Emulator.
// דורש אמולטור פעיל: npm run test:rules (מפעיל אותו אוטומטית). רץ ב-GitHub Actions ובמחשב של המפתח.
import { test, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { buildSeed, USERS, INST, keyify, CLASSES } from '../seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let env;
const B = 'insts/' + INST + '/';
const ckA = keyify(CLASSES[0]), ckC = keyify(CLASSES[2]);
const tkA = keyify(USERS.teacherA.teacher), tkM = keyify(USERS.teacherMath.teacher);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nihul',
    firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(path.join(here, '..', '..', 'firestore.rules'), 'utf8') }
  });
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const { docs } = buildSeed();
    for (const p of Object.keys(docs)) await db.doc(p).set(docs[p]);
    await db.doc(B + 'att/L2026-10_' + ckA + '_' + tkA).set({ d: { '2026-10-20': { 'L011:s1': 'present' } } });
  });
});
after(async () => { if (env) await env.cleanup(); });

const as = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test('אורח (לא מחובר) לא קורא שום נתון של המוסד', async () => {
  await assertFails(anon().doc(B + 'cls/' + ckA).get());
  await assertFails(anon().doc(B + 'store/config').get());
  await assertFails(anon().collection(B + 'att').get());
});
test('משתמש מחובר שאינו חבר במוסד נחסם', async () => {
  await assertFails(as('U_STRANGER').doc(B + 'roster/' + ckA).get());
});
test('מחנך קורא את פרטי הכיתה שלו בלבד', async () => {
  await assertSucceeds(as(USERS.teacherA.uid).doc(B + 'cls/' + ckA).get());
  await assertFails(as(USERS.teacherA.uid).doc(B + 'cls/' + ckC).get());
});
test('מורה מקצועי רואה שמות (roster) אבל לא פרטי הורים (cls)', async () => {
  await assertSucceeds(as(USERS.teacherMath.uid).doc(B + 'roster/' + ckC).get());
  await assertFails(as(USERS.teacherMath.uid).doc(B + 'cls/' + ckA).get());
});
test('מורה שלא מלמד בכיתה יכול לכתוב רק אירועים (ev), לא נוכחות', async () => {
  const db = as(USERS.teacherMath.uid), p = B + 'att/L2026-11_' + ckC + '_' + tkM;
  await assertSucceeds(db.doc(p).set({ ev: { e1: { sid: 's9', type: 'e3' } } }));
  await assertFails(db.doc(p).set({ d: { '2026-11-01': { 'X:s9': 'absent' } } }, { merge: true }));
});
test('מורה לא כותב למסמך נוכחות של מורה אחר', async () => {
  await assertFails(as(USERS.teacherMath.uid).doc(B + 'att/L2026-10_' + ckA + '_' + tkA).set({ d: {} }, { merge: true }));
});
test('רק מנהל כותב להגדרות; חבר רגיל רק קורא', async () => {
  await assertSucceeds(as(USERS.teacherA.uid).doc(B + 'store/config').get());
  await assertFails(as(USERS.teacherA.uid).doc(B + 'store/config').set({ v: {} }));
  await assertSucceeds(as(USERS.admin.uid).doc(B + 'store/config').set({ v: { name: 'x', classes: [] } }, { merge: true }));
});
test('מורה לא משנה את ההרשאות של עצמו', async () => {
  await assertFails(as(USERS.teacherA.uid).doc(B + 'members/' + USERS.teacherA.uid).set({ role: 'admin' }, { merge: true }));
});
test('ממצא מ3 (תיעוד מצב קיים): מסמך כניסה קריא בלי התחברות, אבל אי אפשר לרשום את כולם', async () => {
  await assertSucceeds(anon().doc('logins/' + INST + '_admin').get());
  await assertFails(anon().collection('logins').get());
});
