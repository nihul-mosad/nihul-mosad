// build-staging.mjs — בונה עותקי ניסוי של המערכת מתוך ../index.html, בלי לשנות אותו.
//
//   out/staging-local.html     מאגר מדומה בזיכרון הדפדפן (fake-firebase.js). רץ בכל מקום, בלי רשת.
//   out/staging-emulator.html  מחובר ל-Firebase Emulator המקומי (פרויקט demo-nihul בלבד).
//   out/preview.html           נתוני הדגמה לעבודת עיצוב ולבדיקות עשן (demo-data.js).
//
// שכבות הגנה (כל אחת לבדה מספיקה כדי שהעותקים לא יגיעו לנתוני הייצור):
//   1. פרטי החיבור של הייצור מוחלפים, והבנייה נכשלת אם נשאר מהם זכר.
//   2. סקריפטי Firebase האמיתיים מ-gstatic מוסרים (בעותק המקומי) או מוחלפים בעותק מקומי שמחובר לאמולטור.
//   3. בדיקה בזמן ריצה: אם מזהה הפרויקט הוא nihul-mosad, העמוד נעצר ומציג מסך אדום.
//   4. רישום ה-Service Worker מוסר, כדי שעותק ניסוי לא יישמר במטמון של האתר האמיתי.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'index.html');
const OUT = path.join(here, 'out');
// סימנים לפרטי הייצור. בכוונה בלי המפתח עצמו: כל מפתח Google (AIza...) נתפס לפי תבנית.
const PROD_MARKERS = [/AIza[0-9A-Za-z_-]{30,}/, /nihul-mosad\.firebaseapp\.com/, /messagingSenderId\s*:\s*["']\d{6,}/, /projectId\s*:\s*["']nihul-mosad["']/];

const src = fs.readFileSync(SRC, 'utf8');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });

function must(cond, msg) { if (!cond) { console.error('BUILD FAILED: ' + msg); process.exit(1); } }
function replaceOnce(s, re, rep, what) { const m = s.match(re); must(m && m.length, 'pattern not found: ' + what); return s.replace(re, rep); }

const GUARD = `<script>/* staging guard */window.__STAGING__=true;</script>`;
const BANNER = (txt) => `<div id="stagingBanner" style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#B3261E;color:#fff;text-align:center;font:600 13px system-ui;padding:4px 8px;pointer-events:none">${txt}</div>`;
const RUNTIME_GUARD = `if(FB_CONFIG.projectId==='nihul-mosad'){document.body.innerHTML='<h1 style="color:#B3261E;padding:40px;font-family:system-ui">עותק ניסוי ניסה להתחבר לפרויקט הייצור — נעצר</h1>';throw new Error('staging guard: production project');}`;

function base(s) {
  // טעינה דינמית של Functions (עוזר אישי): מפנה לעותק מקומי, לעולם לא לשרת
  s = replaceOnce(s, /'https:\/\/www\.gstatic\.com\/firebasejs\/10\.14\.1\/firebase-functions-compat\.js'/, "'vendor/firebase-functions-compat.js'", 'functions loader');
  s = replaceOnce(s, /navigator\.serviceWorker\.register\('sw\.js'\)/, "Promise.resolve()/* no SW in staging */", 'service worker');
  s = s.replace('<title>ניהול המוסד</title>', '<title>ניסוי · ניהול המוסד</title>');
  return s;
}
function config(s, cfg) {
  s = replaceOnce(s, /const FB_CONFIG=\{[\s\S]*?\};/, 'const FB_CONFIG=' + JSON.stringify(cfg) + ';' + RUNTIME_GUARD, 'FB_CONFIG');
  s = replaceOnce(s, /const OWNER_UID='[^']*',OWNER_EMAIL='[^']*',MAIL_DOMAIN='[^']*';/,
    "const OWNER_UID='STAGING_OWNER',OWNER_EMAIL='owner@demo.test',MAIL_DOMAIN='demo.test';", 'OWNER');
  return s;
}
const stripGstatic = s => s.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>\n?/g, '');
const beforeBodyEnd = (s, html) => { const i = s.lastIndexOf('</body>'); must(i > 0, '</body>'); return s.slice(0, i) + html + '\n' + s.slice(i); };
function finalCheck(name, s) {
  PROD_MARKERS.forEach(m => must(!m.test(s), name + ' still contains production marker ' + m));
  must(!/gstatic\.com\/firebasejs/.test(s), name + ' still loads Firebase from gstatic');
  fs.writeFileSync(path.join(OUT, name), s);
  console.log('built ' + name);
}

// 1. מקומי עם מאגר מדומה
{
  let s = base(stripGstatic(src));
  s = s.replace('<head>', '<head>\n' + GUARD + '\n<script src="fake-firebase.js"></script>\n<script src="demo-summary-mock.js"></script>');
  s = config(s, { apiKey: 'staging-local', authDomain: 'localhost', projectId: 'staging-local', appId: 'staging-local' });
  s = beforeBodyEnd(s, BANNER('סביבת ניסוי מקומית · מאגר מדומה בזיכרון · שום דבר לא נשמר בשרת'));
  finalCheck('staging-local.html', s);
  fs.copyFileSync(path.join(here, 'fake-firebase.js'), path.join(OUT, 'fake-firebase.js'));
  fs.copyFileSync(path.join(here, 'demo-summary-mock.js'), path.join(OUT, 'demo-summary-mock.js'));
}

// 2. אמולטור (פרויקט demo-* לא יכול להגיע לשרתי Firebase אמיתיים)
{
  let s = base(src);
  s = s.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/10\.14\.1\/(firebase-[a-z]+-compat\.js)"><\/script>/g,
    (m, f) => '<script src="vendor/' + f + '"></script>');
  ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js', 'firebase-functions-compat.js'].forEach(f =>
    fs.copyFileSync(path.join(here, 'node_modules', 'firebase', f), path.join(OUT, 'vendor', f)));
  s = s.replace('<head>', '<head>\n' + GUARD);
  s = config(s, { apiKey: 'demo-key', authDomain: 'demo-nihul.firebaseapp.com', projectId: 'demo-nihul', appId: 'demo-nihul' });
  s = replaceOnce(s, /FS=firebase\.firestore\(\);AUTH=firebase\.auth\(\);/,
    "FS=firebase.firestore();AUTH=firebase.auth();FS.useEmulator('127.0.0.1',8080);AUTH.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});", 'emulator hook');
  s = beforeBodyEnd(s, BANNER('סביבת ניסוי · Firebase Emulator מקומי · פרויקט demo-nihul'));
  finalCheck('staging-emulator.html', s);
}

// 3. תצוגת הדגמה (לעיצוב ולבדיקות עשן)
{
  let s = base(stripGstatic(src));
  s = config(s, { apiKey: 'preview', projectId: 'preview', appId: 'preview' });
  s = beforeBodyEnd(s, '<script src="demo-data.js"></script>');
  finalCheck('preview.html', s);
  fs.copyFileSync(path.join(here, 'demo-data.js'), path.join(OUT, 'demo-data.js'));
}
['icons', 'manifest.webmanifest'].forEach(f => fs.cpSync(path.join(here, '..', f), path.join(OUT, f), { recursive: true }));
console.log('index.html was read only — not modified.');
