/* =====================================================================
   fake-firebase.js — מאגר Firebase מדומה, בזיכרון הדפדפן בלבד.
   ---------------------------------------------------------------------
   משמש את סביבת הניסוי המקומית (staging-local.html) ואת הבדיקות האוטומטיות.
   מממש את החלק של Firebase compat שהמערכת משתמשת בו בפועל:
   initializeApp, auth (כניסה בסיסמה), firestore (doc / collection / batch /
   update עם FieldPath / FieldValue.delete).
   אין כאן שום חיבור לרשת: הנתונים נשמרים ב-sessionStorage של הלשונית בלבד,
   ולכן אין שום דרך שהקובץ הזה ייגע בנתוני המוסד האמיתיים.
   ===================================================================== */
(function () {
  'use strict';
  const KEY = '__fakefs__';
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const DELETE = { __fake: 'delete' };
  const SERVER_TS = { __fake: 'serverTimestamp' };

  // ---------- אחסון ----------
  function loadStore() {
    try { const s = sessionStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {}
    return { docs: {}, users: {}, seq: 1, writes: 0 };
  }
  let ST = loadStore();
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} }
  const norm = p => String(p).replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');

  // ---------- הזרקת תקלות (לבדיקות של אמינות השמירה) ----------
  const control = {
    failWrites: null,      // למשל 'permission-denied' או 'unavailable'
    failReads: null,
    writeDelayMs: 0,
    log: [],               // כל הכתיבות, לבדיקה
    dump: () => clone(ST),
    reset: () => { ST = { docs: {}, users: {}, seq: 1, writes: 0 }; persist(); control.log = []; },
    seed: (data) => { if (data.docs) Object.keys(data.docs).forEach(p => { ST.docs[norm(p)] = clone(data.docs[p]); });
                      if (data.users) Object.assign(ST.users, clone(data.users)); persist(); },
    getDoc: p => clone(ST.docs[norm(p)]),
    projectId: null
  };
  function err(code) { const e = new Error(code); e.code = code; return e; }
  async function gateWrite(path, kind) {
    if (control.writeDelayMs) await new Promise(r => setTimeout(r, control.writeDelayMs));
    if (control.failWrites) throw err(control.failWrites);
    control.log.push({ path, kind, at: Date.now() }); ST.writes++;
  }
  async function gateRead() { if (control.failReads) throw err(control.failReads); }

  // ---------- עזרי ערכים ----------
  function resolve(v) {
    if (v === SERVER_TS) return Date.now();
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object' && !v.__fake) { const o = {}; Object.keys(v).forEach(k => { const r = resolve(v[k]); if (v[k] !== DELETE) o[k] = r; }); return o; }
    return v;
  }
  function deepMerge(base, add) {
    const out = (base && typeof base === 'object' && !Array.isArray(base)) ? Object.assign({}, base) : {};
    Object.keys(add).forEach(k => {
      const v = add[k];
      if (v === DELETE) { delete out[k]; return; }
      if (v && typeof v === 'object' && !Array.isArray(v) && !v.__fake) out[k] = deepMerge(out[k], v);
      else out[k] = resolve(v);
    });
    return out;
  }
  function setPath(obj, parts, v) {
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]]; }
    const last = parts[parts.length - 1];
    if (v === DELETE) delete o[last]; else o[last] = clone(resolve(v));
  }
  function FieldPath(...parts) { this._parts = parts.map(String); }

  // ---------- Firestore ----------
  function snap(path) {
    const d = ST.docs[path];
    return { id: path.split('/').pop(), ref: docRef(path), exists: d !== undefined, data: () => clone(d) };
  }
  function docRef(p) {
    const path = norm(p);
    return {
      id: path.split('/').pop(), path,
      get: async () => { await gateRead(); return snap(path); },
      set: async (data, opts) => {
        await gateWrite(path, 'set');
        ST.docs[path] = (opts && opts.merge) ? clone(deepMerge(ST.docs[path], data)) : clone(resolve(data)); persist();
      },
      update: async (...args) => {
        await gateWrite(path, 'update');
        if (ST.docs[path] === undefined) throw err('not-found');
        const doc = clone(ST.docs[path]);
        if (args.length === 1 && typeof args[0] === 'object' && !(args[0] instanceof FieldPath)) {
          Object.keys(args[0]).forEach(k => setPath(doc, k.split('.'), args[0][k]));
        } else {
          for (let i = 0; i < args.length; i += 2) {
            const fp = args[i], v = args[i + 1];
            setPath(doc, fp instanceof FieldPath ? fp._parts : String(fp).split('.'), v);
          }
        }
        ST.docs[path] = doc; persist();
      },
      delete: async () => { await gateWrite(path, 'delete'); delete ST.docs[path]; persist(); },
      collection: c => colRef(path + '/' + c),
      onSnapshot: (cb) => { setTimeout(() => cb(snap(path)), 0); return () => {}; }
    };
  }
  function colRef(p, filters, order, lim) {
    const path = norm(p);
    const q = {
      doc: id => docRef(path + '/' + (id || ('auto' + (ST.seq++)))),
      add: async data => { const r = docRef(path + '/auto' + (ST.seq++)); await r.set(data); return r; },
      where: (f, op, v) => colRef(path, (filters || []).concat([[f, op, v]]), order, lim),
      orderBy: (f, dir) => colRef(path, filters, [f, dir || 'asc'], lim),
      limit: n => colRef(path, filters, order, n),
      get: async () => {
        await gateRead();
        const depth = path.split('/').length + 1;
        let ds = Object.keys(ST.docs).filter(k => k.indexOf(path + '/') === 0 && k.split('/').length === depth).map(snap);
        (filters || []).forEach(([f, op, v]) => { ds = ds.filter(s => { const x = (s.data() || {})[f]; return op === '==' ? x === v : true; }); });
        if (order) ds.sort((a, b) => { const x = (a.data() || {})[order[0]], y = (b.data() || {})[order[0]]; return (x > y ? 1 : x < y ? -1 : 0) * (order[1] === 'desc' ? -1 : 1); });
        if (lim) ds = ds.slice(0, lim);
        return { docs: ds, empty: !ds.length, size: ds.length, forEach: fn => ds.forEach(fn) };
      },
      onSnapshot: () => () => {}
    };
    return q;
  }
  function makeFirestore() {
    return {
      doc: docRef, collection: colRef,
      batch: () => { const ops = []; return {
        set: (r, d, o) => ops.push(() => r.set(d, o)), update: (r, ...a) => ops.push(() => r.update(...a)),
        delete: r => ops.push(() => r.delete()), commit: async () => { for (const op of ops) await op(); } }; },
      settings() {}, enablePersistence: async () => {}, clearPersistence: async () => {}, terminate: async () => {}
    };
  }

  // ---------- Auth ----------
  function makeAuth() {
    let current = null; const listeners = [];
    try { const u = sessionStorage.getItem(KEY + 'user'); if (u) current = JSON.parse(u); } catch (e) {}
    const userObj = u => u && Object.assign({}, u, {
      updatePassword: async p => { ST.users[u.email].password = p; persist(); },
      reauthenticateWithCredential: async c => { if (ST.users[u.email].password !== c.password) throw err('auth/wrong-password'); }
    });
    const setUser = u => { current = u; try { if (u) sessionStorage.setItem(KEY + 'user', JSON.stringify(u)); else sessionStorage.removeItem(KEY + 'user'); } catch (e) {} listeners.forEach(cb => cb(userObj(u))); };
    return {
      get currentUser() { return userObj(current); },
      onAuthStateChanged(cb) { listeners.push(cb); setTimeout(() => cb(userObj(current)), 0); return () => { const i = listeners.indexOf(cb); if (i > -1) listeners.splice(i, 1); }; },
      setPersistence: async () => {},
      signInWithEmailAndPassword: async (email, pw) => {
        const u = ST.users[email];
        if (!u || u.password !== pw) throw err('auth/invalid-credential');
        setUser({ uid: u.uid, email }); return { user: userObj({ uid: u.uid, email }) };
      },
      createUserWithEmailAndPassword: async (email, pw) => {
        if (ST.users[email]) throw err('auth/email-already-in-use');
        const uid = 'u' + (ST.seq++); ST.users[email] = { uid, password: pw }; persist(); return { user: userObj({ uid, email }) };
      },
      signOut: async () => setUser(null)
    };
  }

  // ---------- firebase (compat) ----------
  const apps = [];
  function initializeApp(cfg, name) {
    name = name || '[DEFAULT]';
    // שכבת הגנה: אסור שסביבת ניסוי תרוץ עם פרויקט הייצור
    if (cfg && cfg.projectId === 'nihul-mosad') {
      document.title = 'נעצר: פרויקט הייצור';
      throw new Error('fake-firebase: refused to start with the production projectId');
    }
    control.projectId = cfg && cfg.projectId;
    const fs = makeFirestore(), au = makeAuth();
    const app = { name, options: cfg, firestore: () => fs, auth: () => au, functions: () => ({ httpsCallable: () => async () => { throw err('unavailable'); } }) };
    apps.push(app); return app;
  }
  const firebase = {
    apps, initializeApp, app: n => apps.find(a => a.name === (n || '[DEFAULT]')),
    auth: Object.assign(() => apps[0].auth(), { Auth: { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } },
      EmailAuthProvider: { credential: (email, password) => ({ email, password }) } }),
    firestore: Object.assign(() => apps[0].firestore(), { FieldPath, FieldValue: { delete: () => DELETE, serverTimestamp: () => SERVER_TS } }),
    functions: () => apps[0].functions()
  };
  window.firebase = firebase;
  window.__fakefs = control;
})();
