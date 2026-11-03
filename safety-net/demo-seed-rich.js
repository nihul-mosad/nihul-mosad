/* =====================================================================
   demo-seed-rich.js — נתוני הדגמה עשירים ומומצאים לגמרי, לתצוגת העיצוב (aura-demo.html).
   ---------------------------------------------------------------------
   * כל השמות, הטלפונים והאירועים מומצאים. אין כאן שום נתון אמיתי.
   * התאריכים מחושבים יחסית ליום שבו פותחים את ההדגמה, כדי שלוח הבקרה ייראה "חי".
   * הפלט נכנס ישירות למאגר המדומה (fake-firebase.js) — אין שום חיבור לרשת.
   ===================================================================== */
(function () {
  'use strict';
  const GER = '׳';
  const hexs = t => Array.from(new TextEncoder().encode(t)).map(b => b.toString(16).padStart(2, '0')).join('');
  const keyify = x => { const t = String(x || '').trim().replace(/\s+/g, ' '); if (!t) return '0'; const l = t.toLowerCase(); if (/^[a-z0-9-]+$/.test(l)) return l; return 'h' + hexs(t); };
  const ukey = u => { const t = String(u || '').trim(), l = t.toLowerCase(); return /^[a-z0-9._-]+$/.test(l) ? l : 'h' + hexs(t); };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // מחולל אקראי קבוע (אותה הדגמה בכל פעם)
  let seed = 20261103; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = a => a[Math.floor(rnd() * a.length)];

  try { localStorage.setItem('tt:theme', sessionStorage.getItem('aura-demo-theme') || 'light'); } catch (e) {}
  const INST = 'demo';
  const CLASSES = ['כיתה א' + GER, 'כיתה ב' + GER, 'כיתה ג' + GER, 'כיתה ד' + GER, 'כיתה ה' + GER];
  const HOMEROOM = ['הרב ישראל ישראלי', 'הרב משה משולם', 'הרב דוד דודאי', 'הרב יוסף יוספי', 'הרב נחום נחומי'];
  const T_MATH = 'מר אהרן אהרוני', T_LANG = 'מר שמעון שמעוני';
  const USERS = {
    admin: { user: 'admin', email: 'admin@demo.test', password: 'demo-admin', uid: 'U_ADMIN', role: 'admin', teacher: 'מנחם אדלר', cls: '' },
    teacher: { user: 'morea', email: 'morea@demo.test', password: 'demo-teacher', uid: 'U_TA', role: 'teacher', teacher: HOMEROOM[0], cls: CLASSES[0] },
    math: { user: 'math', email: 'math@demo.test', password: 'demo-math', uid: 'U_TM', role: 'teacher', teacher: T_MATH, cls: '' }
  };

  const FAM = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אזולאי', 'פרידמן', 'שפירא', 'רוזן', 'גולד', 'אלון', 'אוחנה', 'חדד', 'וקנין', 'סויסה', 'גבאי', 'עמר', 'אדלר', 'ברגר', 'קליין', 'וייס', 'הלוי', 'אשכנזי'];
  const FIRST = ['אברהם', 'יצחק', 'יעקב', 'משה', 'אהרן', 'יוסף', 'דוד', 'שלמה', 'שמואל', 'בנימין', 'נתן', 'אליהו', 'מנחם', 'שניאור', 'לוי', 'חיים', 'מרדכי', 'ישראל', 'מאיר', 'נחום', 'זלמן', 'דובער', 'יהודה', 'אריאל', 'נתנאל', 'אלחנן', 'מתן', 'יונתן', 'עזרא', 'פנחס'];

  const today = new Date(); today.setHours(12, 0, 0, 0);
  const T = iso(today), mo = d => d.slice(0, 7);
  // ימי לימוד אחרונים (א–ה), כולל היום אם הוא יום לימודים
  const days = []; { const d = new Date(today); if (d.getDay() > 4) d.setDate(d.getDate() - (d.getDay() === 5 ? 1 : 2)); while (days.length < 32) { if (d.getDay() <= 4) days.unshift(new Date(d)); d.setDate(d.getDate() - 1); } }

  const docs = {}, users = {}, B = 'insts/' + INST + '/';
  docs['insts/' + INST] = { name: 'תלמוד תורה "אור" · הדגמה' };

  // תלמידים: 16 בכל כיתה
  const students = []; let n = 0;
  CLASSES.forEach((c, ci) => { const used = {};
    for (let i = 0; i < 16; i++) { let nm; do { nm = pick(FAM) + ' ' + pick(FIRST); } while (used[nm]); used[nm] = 1;
      n++; students.push({ id: 's' + n, name: nm, cls: c, father: nm.split(' ')[0] + ' (אב)', fatherPhone: '050-0000' + String(100 + n).slice(-3), mother: '', motherPhone: '', notes: '' }); } });
  CLASSES.forEach(c => { const ck = keyify(c), list = students.filter(s => s.cls === c), m = {}, r = {};
    list.forEach(s => { m[s.id] = s; r[s.id] = { id: s.id, name: s.name, cls: s.cls }; });
    docs[B + 'cls/' + ck] = { m, o: list.map(s => s.id) }; docs[B + 'roster/' + ck] = { m: r }; });

  // מערכת שעות: 5 שיעורים ביום
  const SUBJ = [null, 'גמרא', 'חומש', 'משנה', 'חשבון', 'לשון'];
  const tt = {}, order = [];
  CLASSES.forEach((c, ci) => { for (let d = 0; d < 5; d++) for (let p = 1; p <= 5; p++) {
    const id = 'L' + ci + d + p, teacher = p === 4 ? T_MATH : p === 5 ? T_LANG : HOMEROOM[ci];
    tt[id] = { id, day: d, period: p, subject: SUBJ[p], teacher, classes: [c], type: 'class' }; order.push(id); } });
  docs[B + 'store/timetable'] = { m: tt, o: order };

  const homeroom = {}; CLASSES.forEach((c, i) => homeroom[c] = HOMEROOM[i]);
  docs[B + 'store/config'] = { v: { name: 'תלמוד תורה "אור" · הדגמה', classes: CLASSES, logo: '', homeroom,
    domains: [{ id: 'd1', name: 'לימודים' }, { id: 'd2', name: 'ריכוז והתמדה' }, { id: 'd3', name: 'התנהגות' }, { id: 'd4', name: 'חברה' }] } };

  Object.values(USERS).forEach(u => {
    users[u.email] = { uid: u.uid, password: u.password };
    docs[B + 'members/' + u.uid] = { user: u.user, role: u.role, cls: u.cls, teacher: u.teacher, active: true,
      classes: u.cls ? [keyify(u.cls)] : [], tclasses: CLASSES.map(keyify), lclasses: u.teacher === T_MATH ? CLASSES.map(keyify) : u.cls ? [keyify(u.cls)] : [], tk: u.teacher ? keyify(u.teacher) : 'u' + u.uid };
    docs['logins/' + INST + '_' + ukey(u.user)] = { email: u.email, inst: INST, key: ukey(u.user) };
  });

  // נוכחות: שלושה שבועות אחורה, והיום — רק שיעורים שכבר התחילו, ושניים מהם בכוונה לא סומנו
  const PER = [null, '08:00', '09:00', '10:35', '11:25', '12:15'];
  const now = new Date(), hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const weak = { s5: .06, s22: .05, s40: .07, s51: .04 }, sick = {};
  days.forEach((d, i) => { if (i % 3 === 0) sick[iso(d)] = students[(i * 7) % students.length].id; });   // תלמידים "במעקב"
  const att = {}, put = (p, date, k, v) => { ((att[p] = att[p] || {})[date] = att[p][date] || {})[k] = v; };
  days.forEach(d => { const date = iso(d), isToday = date === T;
    CLASSES.forEach((c, ci) => { const list = students.filter(s => s.cls === c);
      for (let p = 1; p <= 5; p++) { const l = tt['L' + ci + d.getDay() + p];
        if (isToday && PER[p] > hm) continue;
        const path = B + 'att/L' + mo(date) + '_' + keyify(c) + '_' + keyify(l.teacher);
        list.forEach(s => { const age = (days.length - 1 - days.indexOf(d)) / days.length, r = rnd() - age * 0.007, w = sick[date] === s.id ? 3 : weak[s.id] || 0;
          put(path, date, l.id + ':' + s.id, r < .003 + w / 3 ? 'absent' : r < .016 + w / 2 ? 'late' : r < .019 + w / 2 ? 'excused' : 'present'); }); } }); });
  Object.keys(att).forEach(p => { docs[p] = { d: att[p] }; });

  // אירועים
  const EV = [['e1', 'הפרעה בשיעור', 'neg', 1], ['e4', 'שפה לא נקייה', 'neg', 2], ['e8', 'ללא שיעורי בית', 'neg', 1], ['e9', 'ללא ציוד', 'neg', 1], ['e6', 'אלימות פיזית', 'neg', 3],
    ['p1', 'צל״ש', 'pos', 1], ['p2', 'תפילה יפה', 'pos', 1], ['p3', 'השתתפות פעילה', 'pos', 1], ['p4', 'עזרה לחבר', 'pos', 1], ['p6', 'התקדמות יפה בלימודים', 'pos', 1]];
  for (let i = 0; i < 34; i++) {
    const s = pick(students), t = i === 3 ? EV[4] : pick(EV), d = days[days.length - 3 - Math.floor(rnd() * Math.min(18, days.length - 3))], date = iso(d);
    const ci = CLASSES.indexOf(s.cls), p = 1 + Math.floor(rnd() * 5), teacher = tt['L' + ci + d.getDay() + p].teacher, tk = keyify(teacher);
    const path = B + 'att/L' + mo(date) + '_' + keyify(s.cls) + '_' + tk, id = 'ev' + i;
    docs[path] = docs[path] || {}; (docs[path].ev = docs[path].ev || {})[id] = { id, sid: s.id, sname: s.name, cls: s.cls, type: t[0], typeName: t[1], kind: t[2], sev: t[3],
      date, time: PER[p], period: p, note: t[2] === 'pos' ? '' : 'תיאור לדוגמה', by: teacher, byUid: teacher === T_MATH ? 'U_TM' : teacher === HOMEROOM[0] ? 'U_TA' : 'U_X', tk, ts: d.getTime(),
      handled: t[3] < 2 || t[3] === 3 || rnd() < .5 };
  }

  { const last = days[days.length - 1], prev = days[days.length - 2];
    [[last, '09:12', 'e6', 'אלימות פיזית', 'neg', 3, 's33'], [prev, '14:20', 'e1', 'הפרעה בשיעור', 'neg', 1, 's12'], [prev, '11:05', 'p5', 'התנהגות למופת', 'pos', 1, 's57']].forEach((x, k) => {
      const s = students.find(z => z.id === x[6]), date = iso(x[0]), ci = CLASSES.indexOf(s.cls), teacher = HOMEROOM[ci], tk = keyify(teacher), path = B + 'att/L' + mo(date) + '_' + keyify(s.cls) + '_' + tk, id = 'evr' + k;
      docs[path] = docs[path] || {}; (docs[path].ev = docs[path].ev || {})[id] = { id, sid: s.id, sname: s.name, cls: s.cls, type: x[2], typeName: x[3], kind: x[4], sev: x[5], date, time: x[1], period: 1, note: '', by: teacher, byUid: 'U_X', tk, ts: x[0].getTime(), handled: true }; }); }
  // תמונות מצב: 4 לכל תלמיד לאורך כ-6 שבועות; האחרונה בשבועיים האחרונים.
  // מגמה: תלמידים "במעקב" יורדים, חלק משתפרים, השאר יציבים.
  const NOTES = ['משתתף יפה בשיעור', 'צריך חיזוק בקריאה', 'שיפור בהתמדה', 'עזר לחבר בהפסקה', 'קשה לו להתרכז אחרי ההפסקה', ''];
  students.forEach((s, i) => {
    const trend = weak[s.id] ? -1 : i % 4 === 1 ? 1 : 0, base = weak[s.id] ? 4 : 2 + Math.floor(rnd() * 3);
    for (let k = 3; k >= 0; k--) {
      const idx = Math.max(0, days.length - 1 - k * 7 - (k ? Math.floor(rnd() * 3) : Math.floor(rnd() * Math.min(9, days.length))));
      const d = days[idx], date = iso(d), path = B + 'rev/' + mo(date) + '_' + keyify(s.cls), id = 'rv' + s.id + '_' + k;
      const lvl = Math.max(1, Math.min(5, base + trend * (3 - k) * (weak[s.id] ? 0.8 : 0.5)));
      const sc = () => Math.max(1, Math.min(5, Math.round(lvl + (rnd() - .5) * 1.2)));
      const scores = { d1: sc(), d2: sc(), d3: sc(), d4: sc() }, avg = (scores.d1 + scores.d2 + scores.d3 + scores.d4) / 4;
      const light = avg < 2.6 ? 'red' : avg < 3.4 ? 'yellow' : 'green';
      docs[path] = docs[path] || { r: {} }; docs[path].r[id] = { id, studentId: s.id, date, light, scores, note: k === 0 ? NOTES[i % NOTES.length] : '', by: homeroom[s.cls], ts: d.getTime() + k };
    }
  });
  // אירועים נוספים לתלמידים במעקב (כדי שכרטיס התלמיד יראה מגמה)
  [['s22', ['e1', 'הפרעה בשיעור', 'neg', 1], [1, 3, 5, 8]], ['s22', ['e8', 'ללא שיעורי בית', 'neg', 1], [2, 9, 16]], ['s22', ['p3', 'השתתפות פעילה', 'pos', 1], [24, 30]],
   ['s5', ['e9', 'ללא ציוד', 'neg', 1], [4, 11]], ['s5', ['p2', 'תפילה יפה', 'pos', 1], [1, 6, 13]], ['s40', ['e4', 'שפה לא נקייה', 'neg', 2], [3, 6]]].forEach(([sid, t, back], g) => {
    const s = students.find(z => z.id === sid), ci = CLASSES.indexOf(s.cls);
    back.forEach((b, k) => { const d = days[Math.max(0, days.length - 1 - b)], date = iso(d), teacher = HOMEROOM[ci], tk = keyify(teacher), path = B + 'att/L' + mo(date) + '_' + keyify(s.cls) + '_' + tk, id = 'evx' + g + '_' + k;
      docs[path] = docs[path] || {}; (docs[path].ev = docs[path].ev || {})[id] = { id, sid: s.id, sname: s.name, cls: s.cls, type: t[0], typeName: t[1], kind: t[2], sev: t[3], date, time: PER[1 + (k % 5)], period: 1 + (k % 5), note: '', by: teacher, byUid: 'U_X', tk, ts: d.getTime(), handled: true }; });
  });

  // משימות של המנהל
  const add = k => { const d = new Date(today); d.setDate(d.getDate() + k); return iso(d); };
  const tasks = [['שיחת הורים – כיתה ה׳', add(0), 'open'], ['עדכון נוכחות יומית', add(0), 'done'], ['הכנת ישיבת צוות', add(0), 'open'],
    ['מעקב אחר אירועים', add(0), 'open'], ['להזמין ספרי לימוד לכיתה א׳', add(0), 'open'], ['לבדוק את מערכת השעות של יום ה׳', add(0), 'open'], ['תיאום סיור לימודי', add(9), 'open']]
    .map((x, i) => ({ id: 't' + i, text: x[0], due: x[1], status: x[2], uid: 'U_ADMIN' }));
  const tm = {}; tasks.forEach(t => tm[t.id] = t);
  docs[B + 'tasks/U_ADMIN'] = { m: tm, o: tasks.map(t => t.id) };

  // ישיבת צוות אחרונה
  const y = today.getMonth() + 1 >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  docs[B + 'store/meetings_' + y] = { m: { mt1: { id: 'mt1', title: 'ישיבת צוות שבועית', date: iso(days[Math.max(0, days.length - 4)]), items: [] } } };

  // גרסת נתוני הדמה: אם בלשונית נשמרו נתונים מגרסה קודמת של ההדגמה, מתחילים מחדש
  const VER = 'aura-3.1-r3';
  try { const old = sessionStorage.getItem('__fakefs__'); if (old && JSON.parse(old).ver !== VER) { sessionStorage.removeItem('__fakefs__'); sessionStorage.removeItem('__fakefs__user'); } } catch (e) {}
  window.__FAKE_SEED = { ver: VER, docs, users, seq: 1000, writes: 0 };
  window.__DEMO_USERS = USERS;
  window.__DEMO_INST = INST;
})();
