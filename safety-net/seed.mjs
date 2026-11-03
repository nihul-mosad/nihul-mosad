// seed.mjs — מוסד בדיקה פיקטיבי ("demo") לסביבת הניסוי.
// כל השמות מומצאים. המבנה זהה למבנה הנתונים של המערכת (cls / roster / store / members / logins).

const GER = '׳';
const hexs = t => Array.from(new TextEncoder().encode(t)).map(b => b.toString(16).padStart(2, '0')).join('');
// זהה ל-keyify / ukey בקוד המערכת
export function keyify(x) { const t = String(x || '').trim().replace(/\s+/g, ' '); if (!t) return '0'; const l = t.toLowerCase(); if (/^[a-z0-9-]+$/.test(l)) return l; return 'h' + hexs(t); }
export function ukey(u) {
  const t = String(u || '').trim().replace(/\s+/g, ' ').replace(/[׳']/g, "'").replace(/[״"]/g, '"'), l = t.toLowerCase();
  if (/^[a-z0-9._-]+$/.test(l)) return l;
  return 'h' + hexs(t);
}

export const INST = 'demo';
export const CLASSES = ['א', 'ב', 'ג'].map(x => 'כיתה ' + x + GER);
export const USERS = {
  admin: { user: 'admin', email: 'admin@demo.test', password: 'admin-pass-1', uid: 'U_ADMIN', role: 'admin' },
  teacherA: { user: 'morea', email: 'morea@demo.test', password: 'teacher-pass-1', uid: 'U_TA', role: 'teacher', teacher: 'הרב ישראל ישראלי', cls: CLASSES[0] },
  teacherMath: { user: 'math', email: 'math@demo.test', password: 'teacher-pass-2', uid: 'U_TM', role: 'teacher', teacher: 'מר אהרן אהרוני', cls: '' }
};

export function buildSeed() {
  const docs = {}, users = {};
  const base = 'insts/' + INST + '/';
  docs['insts/' + INST] = { name: 'תלמוד תורה לבדיקות' };
  docs[base + 'store/config'] = { v: { name: 'תלמוד תורה לבדיקות', classes: CLASSES, logo: '',
    domains: [{ id: 'd1', name: 'לימודים' }, { id: 'd2', name: 'ריכוז והתמדה' }, { id: 'd3', name: 'התנהגות' }] } };

  // תלמידים: 4 בכל כיתה
  const names = [['כהן', 'אברהם'], ['לוי', 'יצחק'], ['מזרחי', 'יעקב'], ['פרץ', 'משה'], ['ביטון', 'אהרן'], ['דהן', 'יוסף'],
                 ['אזולאי', 'דוד'], ['פרידמן', 'שלמה'], ['שפירא', 'שמואל'], ['רוזן', 'בנימין'], ['גולד', 'נתן'], ['אלון', 'אליהו']];
  const students = names.map((n, i) => ({ id: 's' + (i + 1), name: n[0] + ' ' + n[1], cls: CLASSES[Math.floor(i / 4)],
    father: n[0] + ' אב', fatherPhone: '050-00000' + String(i).padStart(2, '0'), mother: n[0] + ' אם', motherPhone: '', notes: '' }));
  CLASSES.forEach(c => {
    const ck = keyify(c), list = students.filter(s => s.cls === c);
    const m = {}, r = {}; list.forEach(s => { m[s.id] = s; r[s.id] = { id: s.id, name: s.name, cls: s.cls }; });
    docs[base + 'cls/' + ck] = { m, o: list.map(s => s.id) };
    docs[base + 'roster/' + ck] = { m: r };
  });

  // מערכת שעות: כל יום א–ה, שני שיעורים לכל כיתה; שיעור 2 בכיתה א' הוא חשבון של מורה מקצועי
  const tt = {}, order = [];
  CLASSES.forEach((c, ci) => { for (let d = 0; d < 5; d++) for (let p = 1; p <= 2; p++) {
    const id = 'L' + ci + d + p, math = ci === 0 && p === 2;
    tt[id] = { id, day: d, period: p, subject: math ? 'חשבון' : 'גמרא', teacher: math ? USERS.teacherMath.teacher : (ci === 0 ? USERS.teacherA.teacher : 'מחנך ' + c), classes: [c], type: 'class' };
    order.push(id);
  } });
  docs[base + 'store/timetable'] = { m: tt, o: order };

  // משתמשים, חברים ופרטי כניסה
  Object.values(USERS).forEach(u => {
    users[u.email] = { uid: u.uid, password: u.password };
    docs[base + 'members/' + u.uid] = { user: u.user, role: u.role, cls: u.cls || '', teacher: u.teacher || '', active: true,
      classes: u.cls ? [keyify(u.cls)] : [], tclasses: CLASSES.map(keyify), lclasses: [], tk: u.teacher ? keyify(u.teacher) : 'u' + u.uid };
    docs['logins/' + INST + '_' + ukey(u.user)] = { email: u.email, inst: INST, key: ukey(u.user) };
  });
  // המורה המקצועי מלמד בכיתה א'
  docs[base + 'members/' + USERS.teacherMath.uid].lclasses = [keyify(CLASSES[0])];
  docs[base + 'members/' + USERS.teacherA.uid].lclasses = [keyify(CLASSES[0])];
  return { docs, users };
}
