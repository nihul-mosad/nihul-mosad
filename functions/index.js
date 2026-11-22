'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { analyze } = require('./core');
const { summarize } = require('./summary');

admin.initializeApp();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
// מי מורשה להשתמש (uid, מופרדים בפסיק). ברירת מחדל: בעל המערכת
const ASSIST_UIDS = defineString('ASSIST_UIDS', { default: 'OPqeXR8eV9fR5Js5TmaEwTyjlZ82' });
const AI_MODEL = defineString('AI_MODEL', { default: 'claude-sonnet-5-5' });

exports.assistAnalyze = onCall({
  region: 'europe-west1', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300,
  memory: '256MiB', maxInstances: 2, concurrency: 4
}, async (request) => {
  const db = admin.firestore();
  try {
    return await analyze({ uid: request.auth && request.auth.uid, data: request.data }, {
      getDoc: async p => { const s = await db.doc(p).get(); return s.exists ? s.data() : null; },
      setDoc: (p, d, merge) => db.doc(p).set(d, merge ? { merge: true } : undefined),
      fetch: fetch,
      apiKey: String(ANTHROPIC_API_KEY.value() || '').trim(),
      model: AI_MODEL.value(),
      allowed: new Set(ASSIST_UIDS.value().split(',').map(s => s.trim()).filter(Boolean)),
      now: () => Date.now()
    });
  } catch (e) {
    if (e && e.code && !(e instanceof HttpsError)) throw new HttpsError(e.code, e.message);
    throw e instanceof HttpsError ? e : new HttpsError('internal', 'שגיאה בשרת');
  }
});

// סיכום תלמיד להורים: אותו מפתח, אותה רשימת משתמשים מורשים ואותו מודל; מכסה נפרדת.
exports.studentSummary = onCall({
  region: 'europe-west1', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120,
  memory: '256MiB', maxInstances: 2, concurrency: 4
}, async (request) => {
  const db = admin.firestore();
  try {
    return await summarize({ uid: request.auth && request.auth.uid, data: request.data }, {
      getDoc: async p => { const s = await db.doc(p).get(); return s.exists ? s.data() : null; },
      setDoc: (p, d, merge) => db.doc(p).set(d, merge ? { merge: true } : undefined),
      fetch: fetch,
      apiKey: String(ANTHROPIC_API_KEY.value() || '').trim(),
      model: AI_MODEL.value(),
      allowed: new Set(ASSIST_UIDS.value().split(',').map(s => s.trim()).filter(Boolean)),
      now: () => Date.now()
    });
  } catch (e) {
    if (e && e.code && !(e instanceof HttpsError)) throw new HttpsError(e.code, e.message);
    throw e instanceof HttpsError ? e : new HttpsError('internal', 'שגיאה בשרת');
  }
});

// שעון נוכחות לצוות: נקרא מדף הנוכחות (clock.html) בלי התחברות.
// הזיהוי הוא בקוד נוכחות של 4 ספרות, והשרת נועל אחרי ניסיונות שגויים. ראו clock.js
const { clock } = require('./clock');
const crypto = require('crypto');
exports.clockPunch = onCall({
  region: 'europe-west1', timeoutSeconds: 20, memory: '256MiB', maxInstances: 3, concurrency: 20
}, async (request) => {
  const db = admin.firestore();
  try {
    return await clock({ data: request.data, ip: request.rawRequest && request.rawRequest.ip }, {
      getDoc: async p => { const s = await db.doc(p).get(); return s.exists ? s.data() : null; },
      setDoc: (p, d, merge) => db.doc(p).set(d, merge ? { merge: true } : undefined),
      addDoc: async (c, d) => (await db.collection(c).add(d)).id,
      query: async (c, filters) => {
        let q = db.collection(c);
        filters.forEach(f => { q = q.where(f[0], '==', f[1]); });
        return (await q.get()).docs.map(x => Object.assign({ id: x.id }, x.data()));
      },
      hash: s => crypto.createHash('sha256').update(s).digest('hex'),
      now: () => Date.now()
    });
  } catch (e) {
    if (e && e.code && !(e instanceof HttpsError)) throw new HttpsError(e.code, e.message);
    throw e instanceof HttpsError ? e : new HttpsError('internal', 'שגיאה בשרת');
  }
});
