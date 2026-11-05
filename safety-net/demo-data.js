/* =====================================================================
   demo-data.js — נתוני הדגמה פיקטיביים לתצוגת עיצוב בלבד
   ---------------------------------------------------------------------
   הקובץ נטען רק ב-preview.html. הוא:
   1. מחליף את כל פעולות השמירה בפעולות ריקות (שום דבר לא נשמר ולא נשלח),
   2. ממלא את המערכת בנתונים מומצאים (שמות, כיתות, מערכת שעות, נוכחות…),
   3. מדלג על מסך הכניסה ופותח ישר את הממשק כמנהל.
   כל השמות והמספרים כאן מומצאים ואינם קשורים לאנשים אמיתיים.
   ===================================================================== */
(function () {
  // ---- 1. אין שמירה, אין רשת ----
  window.save = async function () {};
  window.saveSec = async function () {};
  window.writeDoc = async function () {};
  window.queued = function (path, fn) { return Promise.resolve(); };
  window.syncMembers = async function () {};
  window.logAct = function () {};
  // מאגר נתונים מדומה: כל קריאה מחזירה "ריק", כל כתיבה לא עושה כלום
  const emptySnap = { docs: [], empty: true, size: 0, forEach: function () {} };
  const fakeDoc = function () { return { id: 'demo', get: async () => ({ exists: false, id: 'demo', data: () => null }), set: async () => {}, update: async () => {}, delete: async () => {},
    collection: fakeCol, onSnapshot: () => () => {} }; };
  function fakeCol() { const c = { get: async () => emptySnap, doc: fakeDoc, add: async () => fakeDoc(), onSnapshot: () => () => {} };
    c.where = c.orderBy = c.limit = c.startAfter = () => c; return c; }
  try { FS = { collection: fakeCol, doc: fakeDoc, batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }), settings() {} }; } catch (e) {}
  // טעינות נתונים מהשרת שבתצוגה הזו אין להן מקור — מחזירות מיד
  ['loadRem', 'loadDuty', 'loadGrades', 'loadDaylog', 'loadMeetings', 'loadSec', 'loadConsole', 'dlRefreshRead'].forEach(function (f) { window[f] = async function () {}; });

  // ---- 2. נתונים מומצאים ----
  const G = "'";
  const CL = ['א', 'ב', 'ג', 'ד', 'ה'].map(x => 'כיתה ' + x + G);
  const FIRST = ['אברהם', 'יצחק', 'יעקב', 'משה', 'אהרן', 'יוסף', 'דוד', 'שלמה', 'שמואל', 'בנימין', 'נתן', 'אליהו', 'מנחם', 'חיים', 'ישראל', 'מאיר'];
  const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אזולאי', 'פרידמן', 'שפירא', 'רוזן', 'גולד', 'אלון'];
  let n = 0;
  const students = [];
  CL.forEach((c, ci) => {
    for (let i = 0; i < 7; i++) {
      const f = FIRST[(ci * 3 + i) % FIRST.length], l = LAST[(ci * 5 + i * 7) % LAST.length];
      n++;
      students.push({ id: 's' + n, name: l + ' ' + f, cls: c, father: l + ' ' + FIRST[(i + 4) % FIRST.length], fatherPhone: '050-0000' + String(100 + n).slice(-3),
        mother: l + ' ' + ['שרה', 'רבקה', 'רחל', 'לאה', 'חנה', 'מרים', 'אסתר'][i], motherPhone: '052-0000' + String(200 + n).slice(-3), notes: '' });
    }
  });
  const staff = [
    { id: 't1', name: 'הרב ישראל ישראלי', role: 'מחנך', cls: CL[0], phone: '050-0000001', hours: '', start: '' },
    { id: 't2', name: 'הרב משה משולם', role: 'מחנך', cls: CL[1], phone: '050-0000002', hours: '', start: '' },
    { id: 't3', name: 'הרב דוד דודאי', role: 'מחנך', cls: CL[2], phone: '050-0000003', hours: '', start: '' },
    { id: 't4', name: 'הרב יוסף יוספי', role: 'מחנך', cls: CL[3], phone: '050-0000004', hours: '', start: '' },
    { id: 't5', name: 'מר אהרן אהרוני', role: 'מורה חשבון', cls: '', phone: '050-0000005', hours: '', start: '' },
    { id: 't6', name: 'מר שמעון שמעוני', role: 'מורה אנגלית', cls: '', phone: '050-0000006', hours: '', start: '' }
  ];
  const SUBJ = ['גמרא', 'חומש', 'חשבון', 'עברית', 'אנגלית', 'משנה'];
  const tch = { 'גמרא': null, 'חומש': null, 'משנה': null, 'חשבון': 'מר אהרן אהרוני', 'עברית': null, 'אנגלית': 'מר שמעון שמעוני' };
  const timetable = [];
  CL.forEach((c, ci) => {
    const home = staff[Math.min(ci, 3)].name;
    for (let d = 0; d < 5; d++) for (let p = 1; p <= 6; p++) {
      const s = SUBJ[(d + p + ci) % SUBJ.length];
      timetable.push({ id: 'L' + ci + d + p, day: d, period: p, subject: s, teacher: tch[s] || home, classes: [c], type: 'class' });
    }
  });

  const iso = d => d.toISOString().slice(0, 10);
  const back = k => { const d = new Date(); d.setDate(d.getDate() - k); return iso(d); };
  const latt = {};
  const vals = ['present', 'present', 'present', 'present', 'present', 'present', 'late', 'absent', 'excused'];
  for (let k = 1; k <= 20; k++) {
    const d = back(k), wd = new Date(d + 'T12:00:00').getDay();
    if (wd > 4) continue;
    const day = latt[d] = {};
    timetable.filter(l => l.day === wd).forEach((l, i) => {
      if ((k + i) % 6 === 0) return;               // חלק מהשיעורים לא דווחו — כדי להדגים את מסך "שיעורים שלא דווחו"
      students.filter(s => l.classes.indexOf(s.cls) > -1).forEach((s, j) => { day[l.id + ':' + s.id] = vals[(k * 3 + i + j * 5) % vals.length]; });
    });
  }
  const T = [['e1', 'הפרעה בשיעור', 'neg', 1], ['e3', 'חוצפה כלפי איש צוות', 'neg', 2], ['e6', 'אלימות פיזית', 'neg', 3], ['p2', 'תפילה יפה', 'pos', 1], ['p4', 'עזרה לחבר', 'pos', 1], ['p3', 'השתתפות פעילה', 'pos', 1]];
  const NOTES = ['דיבר בזמן ההסבר אחרי שתי בקשות', '', 'עזר לחבר חדש להתמצא', 'השתתף יפה בדיון על הפרשה', 'דחף ילד בתור להפסקה', ''];
  const events = [];
  for (let i = 0; i < 18; i++) {
    const s = students[(i * 5) % students.length], t = T[i % T.length];
    events.push({ id: 'ev' + i, sid: s.id, sname: s.name, cls: s.cls, type: t[0], typeName: t[1], kind: t[2], sev: t[3], date: back(i % 12 + 1), time: '10:' + String(10 + i).slice(-2),
      period: (i % 6) + 1, note: NOTES[i % NOTES.length], by: staff[i % staff.length].name, byUid: 'demo', tk: '', ts: Date.now() - i * 864e5, handled: i % 4 === 1 });
  }
  const reviews = [];
  students.forEach((s, i) => { reviews.push({ id: 'r' + i, studentId: s.id, date: back(7), light: ['green', 'green', 'yellow', 'red'][i % 4], scores: { d1: 3 + (i % 3), d3: 2 + (i % 4) }, note: i % 5 ? '' : 'צריך חיזוק בקריאה', by: 'הרב ישראל ישראלי', ts: Date.now() }); });
  const tasks = [
    { id: 'k1', text: 'להזמין ספרי לימוד לכיתה ג׳', due: back(-3), status: 'open', by: 'מנהל', uid: 'demo' },
    { id: 'k2', text: 'לתאם אסיפת הורים', due: back(-7), status: 'open', by: 'מנהל', uid: 'demo' },
    { id: 'k3', text: 'לבדוק ציוד עזרה ראשונה', due: back(2), status: 'done', by: 'מנהל', uid: 'demo' }
  ];
  const meetings = [{ id: 'm1', date: back(6), title: 'ישיבת צוות שבועית', part: 'כל הצוות', body: 'סקירת השבוע, נוכחות ותפילות.', dec: 'מעקב אחרי איחורים בבוקר.', by: 'מנהל', byUid: 'demo', ts: Date.now() }];

  // ---- 3. כניסה אוטומטית כמנהל ----
  function boot() {
    S.inst = 'demo';
    S.me = { role: 'admin', user: 'מנהל לדוגמה', id: 'demo' };
    Object.assign(S.config, { name: 'תלמוד תורה לדוגמה', classes: CL.slice(), domains: SEED_DOMAINS.slice(), users: [] });
    S.students = students; S.staff = staff; S.timetable = timetable; S.latt = latt; S.att = {};
    S.events = events; S.reviews = reviews; S.tasks = tasks; S.meetings = meetings;
    S.markCls = ''; S.revCls = CL[0];
    S.rem = { d: {}, at: Date.now() };
    if (typeof dutyEmpty === 'function') { S.duty = dutyEmpty(); S.config.duty = S.duty; }
    if (typeof LIDX !== 'undefined') LIDX = null;
    ['boot', 'login'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    document.getElementById('shell').classList.add('on');
    const h = (location.hash || '').slice(1);
    if (h) S.tab = h;
    render();
  }
  if (document.readyState === 'complete') setTimeout(boot, 50); else window.addEventListener('load', () => setTimeout(boot, 50));
})();
