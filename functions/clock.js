/*
 * שעון נוכחות לצוות — ליבת השרת, בלי תלות ב-Firebase, כדי שאפשר יהיה לבדוק אותה.
 *
 * דף הנוכחות (clock.html) לא מחובר למערכת ולא קורא שום נתון של המוסד.
 * הוא שולח לכאן רק: קוד מוסד, קוד נוכחות של 4 ספרות ופעולה. השרת בודק את הקוד,
 * רושם את ההחתמה בשעון של השרת (לא בשעון של הטלפון), ומחזיר לעובד רק את השם שלו
 * ואת ההחתמות שלו מהיום.
 *
 * מבנה הנתונים (insts/{inst}/...):
 *   clockcodes/{code}   {sid, name, active}             — רק המנהל קורא וכותב
 *   punch/{id}          {sid, name, type:'in'|'out', t, day, hm, dev, src}
 *   absreq/{id}         {sid, name, from, to, reason, note, status:'pending', at, dev}
 *   clockguard/{key}    {fails, until, day}             — נעילה אחרי ניסיונות שגויים; אין גישה מהדפדפן
 */
'use strict';
const TZ = 'Asia/Jerusalem';
const MAX_FAILS = 5;                 // ניסיונות קוד שגוי ממכשיר אחד לפני נעילה
const MAX_NET_FAILS = 20;            // ניסיונות שגויים מאותה רשת (גם אם מחליפים מכשיר) לפני נעילה
const LOCK_MS = 15 * 60 * 1000;      // נעילה ל-15 דקות
const DUP_MS = 3 * 60 * 1000;        // אותה החתמה פעמיים בתוך 3 דקות = לחיצה כפולה
const REASONS = ['מחלה', 'חופשה', 'מילואים', 'אירוע משפחתי', 'השתלמות', 'אחר'];
const MAX_ABS_DAYS = 31;

function httpsError(code, msg) { const e = new Error(msg); e.code = code; return e; }

function dayOf(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
function hmOf(ms) { return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms)); }
const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/**
 * req:  { data: {inst, code, action:'who'|'in'|'out'|'abs', force, dev, from, to, reason, note}, ip }
 * deps: { getDoc(path)->data|null, setDoc(path,data,merge), addDoc(collPath,data)->id,
 *         query(collPath, [[field,value],...])->[{id,...data}], hash(str)->str, now() }
 */
async function clock(req, deps) {
  const d = req.data || {};
  const inst = String(d.inst || ''), code = String(d.code || ''), action = String(d.action || 'who');
  if (!/^[a-z0-9-]{2,40}$/.test(inst)) throw httpsError('invalid-argument', 'קישור לא תקין — חסר קוד מוסד');
  if (!/^\d{4}$/.test(code)) throw httpsError('invalid-argument', 'קוד הנוכחות הוא 4 ספרות');
  if (['who', 'in', 'out', 'abs'].indexOf(action) < 0) throw httpsError('invalid-argument', 'פעולה לא מוכרת');
  const dev = String(d.dev || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);

  const instDoc = await deps.getDoc('insts/' + inst);
  if (!instDoc || instDoc.disabled) throw httpsError('not-found', 'המוסד לא נמצא');
  if (!instDoc.clockOn) throw httpsError('failed-precondition', 'שעון הנוכחות עדיין לא הופעל במוסד הזה');

  const now = deps.now(), base = 'insts/' + inst + '/';
  // נעילה כפולה, כדי שאי אפשר יהיה לנחש קודים: לפי מכשיר (5 ניסיונות) ולפי רשת (20 ניסיונות)
  const today0 = dayOf(now);
  const gPath = base + 'clockguard/' + deps.hash(inst + '|' + (req.ip || '') + '|' + dev).slice(0, 32);
  const nPath = base + 'clockguard/n' + deps.hash(inst + '|' + (req.ip || '')).slice(0, 31);
  const g = (await deps.getDoc(gPath)) || {}, n = (await deps.getDoc(nPath)) || {};
  const lockedUntil = Math.max(g.until || 0, n.until || 0);
  if (lockedUntil > now) {
    const min = Math.ceil((lockedUntil - now) / 60000);
    throw httpsError('resource-exhausted', 'יותר מדי ניסיונות שגויים. נסו שוב בעוד ' + min + ' דקות');
  }

  const cc = await deps.getDoc(base + 'clockcodes/' + code);
  if (!cc || cc.active === false || !cc.sid) {
    const fails = (g.day === today0 ? (g.fails || 0) : 0) + 1, nf = (n.day === today0 ? (n.fails || 0) : 0) + 1;
    await deps.setDoc(gPath, { fails: fails, day: today0, until: fails >= MAX_FAILS ? now + LOCK_MS : 0, at: now });
    await deps.setDoc(nPath, { fails: nf, day: today0, until: nf >= MAX_NET_FAILS ? now + LOCK_MS : 0, at: now });
    const left = MAX_FAILS - fails;
    throw httpsError('permission-denied', left > 0 && nf < MAX_NET_FAILS ? 'הקוד לא נכון. נשארו ' + left + ' ניסיונות' : 'הקוד לא נכון. הגישה ננעלה ל-15 דקות');
  }
  if (g.fails) await deps.setDoc(gPath, { fails: 0, day: today0, until: 0, at: now });

  const sid = String(cc.sid), name = String(cc.name || '');
  const day = dayOf(now);
  const loadToday = async () => (await deps.query(base + 'punch', [['day', day], ['sid', sid]]))
    .map(p => ({ type: p.type, t: p.t, hm: p.hm })).sort((a, b) => a.t - b.t);
  let today = await loadToday();
  const last = today[today.length - 1];
  const state = () => ({ ok: true, name: name, instName: String(instDoc.name || '').slice(0, 60), day: day, today: today, inside: !!(today.length && today[today.length - 1].type === 'in') });

  if (action === 'who') return state();

  if (action === 'in' || action === 'out') {
    if (last && last.type === action && now - last.t < DUP_MS) return Object.assign(state(), { dup: true, hm: last.hm });
    if (!d.force) {
      if (action === 'in' && last && last.type === 'in') return Object.assign(state(), { confirm: 'כבר רשומה לך כניסה היום ב-' + last.hm + '. לרשום כניסה נוספת?' });
      if (action === 'out' && (!last || last.type !== 'in')) return Object.assign(state(), { confirm: last ? 'כבר רשומה לך יציאה ב-' + last.hm + '. לרשום יציאה נוספת?' : 'לא רשומה לך כניסה היום. לרשום יציאה בכל זאת?' });
    }
    const hm = hmOf(now);
    await deps.addDoc(base + 'punch', { sid: sid, name: name, type: action, t: now, day: day, hm: hm, dev: dev, src: 'web' });
    today = today.concat([{ type: action, t: now, hm: hm }]);
    return Object.assign(state(), { done: action, hm: hm });
  }

  // דיווח היעדרות — נכנס כ"ממתין לאישור" של המנהל
  const from = String(d.from || ''), to = String(d.to || d.from || ''), reason = String(d.reason || '');
  const note = String(d.note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!isoOk(from) || !isoOk(to)) throw httpsError('invalid-argument', 'תאריך לא תקין');
  if (dayDiff(from, to) < 0) throw httpsError('invalid-argument', 'תאריך הסיום לפני תאריך ההתחלה');
  if (dayDiff(from, to) >= MAX_ABS_DAYS) throw httpsError('invalid-argument', 'אפשר לדווח עד ' + MAX_ABS_DAYS + ' ימים בכל פעם');
  if (Math.abs(dayDiff(day, from)) > 60) throw httpsError('invalid-argument', 'אפשר לדווח עד חודשיים אחורה או קדימה');
  if (REASONS.indexOf(reason) < 0) throw httpsError('invalid-argument', 'בחרו סיבה מהרשימה');
  if (reason === 'אחר' && !note) throw httpsError('invalid-argument', 'כתבו בקצרה מה הסיבה');
  const id = await deps.addDoc(base + 'absreq', { sid: sid, name: name, from: from, to: to, reason: reason, note: note, status: 'pending', at: now, dev: dev });
  return Object.assign(state(), { done: 'abs', absId: id });
}

module.exports = { clock, dayOf, hmOf, REASONS, MAX_FAILS, MAX_NET_FAILS };
