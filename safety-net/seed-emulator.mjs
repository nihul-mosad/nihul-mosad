// seed-emulator.mjs — ממלא את Firebase Emulator המקומי במוסד הבדיקה (demo).
// עובד רק מול האמולטור: הכתובות קבועות ל-127.0.0.1, ומזהה הפרויקט הוא demo-nihul
// (פרויקט שמתחיל ב-demo- לא קיים בענן, ולכן אי אפשר להגיע איתו לנתונים אמיתיים).
// הרצה ידנית: npm run emulator  (בחלון אחד)  ואז  npm run seed:emulator  (בחלון שני).
// הבדיקות (tests/emulator.test.mjs) קוראות ל-seedEmulator() בעצמן.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { buildSeed, USERS, INST } from './seed.mjs';
import { pathToFileURL } from 'node:url';

export const PROJECT = 'demo-nihul';
const AUTH = 'http://127.0.0.1:9099';
if (!/^demo-/.test(PROJECT)) throw new Error('seed-emulator: מותר רק פרויקט demo-');

async function post(url, body, admin) {
  const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, admin ? { authorization: 'Bearer owner' } : {}), body: JSON.stringify(body) });
  return r.json();
}

export async function seedEmulator() {
  // 1. משתמשים באמולטור ה-Auth, עם המזהים הקבועים של ה-seed. אם האמולטור לא מקבל מזהה קבוע — ממפים.
  const uidMap = {};
  for (const u of Object.values(USERS)) {
    let j = await post(AUTH + '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts', { localId: u.uid, email: u.email, password: u.password }, true);
    if (!j.localId) j = await post(AUTH + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { email: u.email, password: u.password, returnSecureToken: true });
    if (!j.localId) throw new Error('signUp failed for ' + u.email + ': ' + JSON.stringify(j));
    uidMap[u.uid] = j.localId;
  }
  // 2. המסמכים, עם המזהים בפועל
  const { docs } = buildSeed(), fixed = {};
  for (const [p, d] of Object.entries(docs)) {
    let path = p; for (const [a, b] of Object.entries(uidMap)) path = path.replace('/members/' + a, '/members/' + b);
    fixed[path] = d;
  }
  // 3. כתיבה בלי חוקי אבטחה (רק באמולטור)
  const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
  await env.withSecurityRulesDisabled(async ctx => { const db = ctx.firestore(); for (const p of Object.keys(fixed)) await db.doc(p).set(fixed[p]); });
  return { env, uidMap };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { env } = await seedEmulator();
  await env.cleanup();
  console.log('האמולטור מוכן. קוד מוסד: ' + INST);
  Object.values(USERS).forEach(u => console.log('  ' + u.user + ' / ' + u.password + (u.role === 'admin' ? '  (מנהל)' : '')));
}
