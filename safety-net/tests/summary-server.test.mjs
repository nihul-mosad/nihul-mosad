// סיכום תלמיד להורים — הליבה בשרת (functions/summary.js), בלי רשת ובלי Firebase:
// הרשאות, ניקוי החבילה לשדות המותרים בלבד, חסימת טלפון/ת"ז, מכסה, ושגיאות מהשירות.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { summarize, cleanPacket, SYSTEM, NAME_TOKEN, DAILY_LIMIT } = require('../../functions/summary.js');

const PACKET = {
  cls: 'כיתה ב׳', period: { from: '2026-10-05', to: '2026-11-04' },
  attendance: { last30: { pct: 96, present: 120, late: 4, absent: 5, excused: 0, total: 129 }, prev30: { pct: 98, present: 130, late: 1, absent: 2, excused: 0, total: 133 }, year: { pct: 97, total: 400 } },
  events: [{ date: '2026-10-28', kind: 'pos', type: 'עזרה לחבר', severity: 1, handled: true, note: 'עזר לחבר בהפסקה' }],
  snapshots: [{ date: '2026-10-20', light: 'ירוק', scores: { 'לימודים': 4, 'התנהגות': 5 }, note: 'משתתף יפה' }],
  scale: '1 (נמוך) עד 5 (גבוה)',
  insights: [{ level: 'good', title: 'מגמה חיובית', why: '3 אירועים לשבח ב-14 הימים האחרונים' }]
};
function mk(over) {
  const db = { 'insts/afula-banim/members/U1': { role: 'admin', active: true }, 'insts/afula-banim/members/T1': { role: 'teacher', active: true } };
  const calls = [];
  const deps = Object.assign({
    getDoc: async p => db[p] || null, setDoc: async (p, d, m) => { db[p] = m ? Object.assign({}, db[p] || {}, d) : d; },
    fetch: async (url, o) => { calls.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'הורים יקרים, ' + NAME_TOKEN + ' מגיע...\n## נוכחות\n...' }], usage: { input_tokens: 900, output_tokens: 400 }, stop_reason: 'end_turn' }) }; },
    apiKey: 'k', model: 'claude-sonnet-5-5', allowed: new Set(['U1']), now: () => Date.parse('2026-11-04T10:00:00Z')
  }, over || {});
  return { db, deps, calls };
}
const req = (uid, packet = PACKET, inst = 'afula-banim') => ({ uid, data: { inst, packet } });
const code = async (p, c) => { await assert.rejects(p, e => e.code === c); };

test('שרת: מנהל מורשה מקבל טיוטה; נשלח רק JSON מנוקה עם הנחיות הכתיבה, והשימוש נרשם במכסה נפרדת', async () => {
  const { db, deps, calls } = mk();
  const r = await summarize(req('U1'), deps);
  assert.match(r.text, /\{\{שם\}\}/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].system, SYSTEM);
  assert.match(SYSTEM, /אל תמציא/); assert.match(SYSTEM, /אבחנות/); assert.match(SYSTEM, /\{\{שם\}\}/); assert.match(SYSTEM, /אל תבצע/);
  const sent = calls[0].messages[0].content;
  assert.match(sent, /"cls": "כיתה ב׳"/); assert.match(sent, /"pct": 96/);
  assert.equal(db['insts/afula-banim/assist/U1/meta/summaryUsage'].days['2026-11-04'], 1);
  assert.equal(db['insts/afula-banim/assist/U1/meta/summaryUsage'].months['2026-11'].out, 400);
  assert.equal(db['insts/afula-banim/assist/U1/meta/usage'], undefined, 'לא נוגעים במכסת העוזר האישי');
});

test('שרת: שדות שאינם ברשימה (שם, הורים, טלפון) לא עוברים, גם אם נשלחו', async () => {
  const { deps, calls } = mk();
  const p = Object.assign({}, PACKET, { name: 'כהן משה', father: 'אברהם', fatherPhone: '050-1234567', id: '123456782' });
  await summarize(req('U1', p), deps);
  const sent = calls[0].messages[0].content;
  for (const x of ['כהן משה', 'אברהם', '050-1234567', '123456782', '"name"', '"father"']) assert.ok(!sent.includes(x), 'עבר: ' + x);
  const c = cleanPacket(p);
  assert.deepEqual(Object.keys(c).sort(), ['attendance', 'cls', 'events', 'insights', 'period', 'scale', 'snapshots']);
});

test('שרת: טלפון או מספר זהות בתוך הערה חוסמים את השליחה', async () => {
  for (const note of ['להתקשר לאבא 052-7654321', 'טלפון 0527654321', 'ת"ז 123456782', '+972-52-765-4321']) {
    const { deps, calls } = mk();
    const p = JSON.parse(JSON.stringify(PACKET)); p.snapshots[0].note = note;
    await code(summarize(req('U1', p), deps), 'invalid-argument');
    assert.equal(calls.length, 0, 'נשלח למרות: ' + note);
  }
  // תאריכים ומספרים רגילים לא נחסמים
  assert.doesNotThrow(() => cleanPacket(PACKET));
});

test('שרת: הרשאות — לא מחובר, לא ברשימה, מורשה אבל לא מנהל במוסד, מוסד לא תקין', async () => {
  let { deps, calls } = mk();
  await code(summarize(req(null), deps), 'unauthenticated');
  await code(summarize(req('T1'), deps), 'permission-denied');
  ({ deps, calls } = mk({ allowed: new Set(['U1', 'T1']) }));
  await code(summarize(req('T1'), deps), 'permission-denied');
  await code(summarize(req('U1', PACKET, '../x'), deps), 'invalid-argument');
  await code(summarize(req('U1', null), deps), 'invalid-argument');
  await code(summarize(req('U1', Object.assign({}, PACKET, { pad: 'x'.repeat(40000) })), deps), 'invalid-argument');
  assert.equal(calls.length, 0, 'שום דבר לא נשלח ל-Claude');
});

test('שרת: מכסה יומית, ושגיאות מהשירות מתורגמות להודעות ברורות', async () => {
  let { db, deps, calls } = mk();
  db['insts/afula-banim/assist/U1/meta/summaryUsage'] = { days: { '2026-11-04': DAILY_LIMIT } };
  await code(summarize(req('U1'), deps), 'resource-exhausted');
  assert.equal(calls.length, 0);
  for (const [status, body, c] of [[401, {}, 'failed-precondition'], [429, {}, 'resource-exhausted'], [400, { error: { type: 'invalid_request_error', message: 'credit balance too low' } }, 'failed-precondition'], [529, {}, 'unavailable']]) {
    ({ deps } = mk({ fetch: async () => ({ ok: false, status, json: async () => body }) }));
    await code(summarize(req('U1'), deps), c);
  }
  ({ deps } = mk({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ content: [], usage: {} }) }) }));
  await code(summarize(req('U1'), deps), 'unavailable');
});
