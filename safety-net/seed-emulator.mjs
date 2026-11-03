// seed-emulator.mjs — ממלא את Firebase Emulator המקומי במוסד הבדיקה (demo).
// עובד רק מול האמולטור: הכתובות קבועות ל-127.0.0.1, ומזהה הפרויקט הוא demo-nihul
// (פרויקט שמתחיל ב-demo- לא קיים בענן, ולכן אי אפשר להגיע איתו לנתונים אמיתיים).
// הרצה: npm run emulator  (בחלון אחד)  ואז  npm run seed:emulator  (בחלון שני).
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { buildSeed, USERS, INST } from './seed.mjs';

const PROJECT = 'demo-nihul';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key';

const { docs } = buildSeed();
// 1. יוצרים משתמשים באמולטור ה-Auth ומקבלים את המזהים שלהם
const uidMap = {};
for (const u of Object.values(USERS)) {
  const r = await fetch(AUTH, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.password, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.localId) throw new Error('signUp failed for ' + u.email + ': ' + JSON.stringify(j));
  uidMap[u.uid] = j.localId;
}
// 2. מחליפים את המזהים הקבועים של ה-seed במזהים האמיתיים של האמולטור
const fixed = {};
for (const [p, d] of Object.entries(docs)) {
  let path = p; for (const [a, b] of Object.entries(uidMap)) path = path.replace('/members/' + a, '/members/' + b);
  fixed[path] = d;
}
// 3. כותבים את המסמכים בלי חוקי אבטחה (רק באמולטור)
const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: '127.0.0.1', port: 8080 } });
await env.withSecurityRulesDisabled(async ctx => { const db = ctx.firestore(); for (const p of Object.keys(fixed)) await db.doc(p).set(fixed[p]); });
await env.cleanup();
console.log('האמולטור מוכן. קוד מוסד: ' + INST);
Object.values(USERS).forEach(u => console.log('  ' + u.user + ' / ' + u.password + (u.role === 'admin' ? '  (מנהל)' : '')));
