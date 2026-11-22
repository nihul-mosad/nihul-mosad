// שעון נוכחות לצוות (clock.html): הדף רץ בדפדפן מול לוגיקת השרת האמיתית (functions/clock.js) עם מאגר בזיכרון.
// בודק: הקשת קוד, כניסה ויציאה, אישור על החתמה כפולה, זכירת העובד בטלפון, דיווח היעדרות, קוד שגוי,
// ושהדף לא פונה לשום שרת חיצוני ולא מכיל שום דרך לקרוא נתוני מוסד.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startServer, OUT } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { clock } = require('../../functions/clock.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const B = 'insts/demo-clock/';

let server, browser;
before(async () => {
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'clock.html'), path.join(OUT, 'clock.html'));
  fs.copyFileSync(path.join(ROOT, 'icons', 'icon-192.png'), path.join(OUT, 'icons', 'icon-192.png'));
  server = await startServer();
  browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
});
after(async () => { await browser.close(); server.srv.close(); });

function memDb() {
  const db = { 'insts/demo-clock': { name: 'ת"ת לדוגמה', clockOn: true }, [B + 'clockcodes/1234']: { sid: 'S1', name: 'משה כהן', active: true } };
  const colls = {}; let seq = 0;
  const deps = {
    getDoc: async p => db[p] ? JSON.parse(JSON.stringify(db[p])) : null,
    setDoc: async (p, d, m) => { db[p] = m ? Object.assign({}, db[p] || {}, d) : d; },
    addDoc: async (c, d) => { const id = 'D' + (++seq); (colls[c] = colls[c] || []).push(Object.assign({ id }, d)); return id; },
    query: async (c, f) => (colls[c] || []).filter(x => f.every(([k, v]) => x[k] === v)),
    hash: s => require('crypto').createHash('sha256').update(s).digest('hex'),
    now: () => Date.now()
  };
  return { db, colls, deps };
}

async function openClock(mem, { ctx } = {}) {
  ctx = ctx || await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.errors = []; page.external = []; page.sent = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { page.external.push(r.request().url()); r.abort(); });
  await page.exposeFunction('__clockNode', async data => {
    page.sent.push(data);
    try { return { r: await clock({ data, ip: '10.0.0.1' }, mem.deps) }; }
    catch (e) { return { e: { code: e.code, message: e.message } }; }
  });
  await page.addInitScript(() => {
    window.__CLOCK_FN__ = d => window.__clockNode(d).then(x => { if (x.e) { const er = new Error(x.e.message); er.code = x.e.code; throw er; } return x.r; });
  });
  await page.goto(server.url + 'clock.html?i=demo-clock', { waitUntil: 'domcontentloaded' });
  return { page, ctx };
}
const typeCode = async (page, code) => { for (const k of code) await page.click('.pad button[data-k="' + k + '"]'); };
const text = page => page.textContent('#view');

test('קוד נכון ← שלום לעובד, כניסה, יציאה ונרשם בשרת', async () => {
  const mem = memDb();
  const { page, ctx } = await openClock(mem);
  assert.match(await page.textContent('#dates'), /ב[א-ת]+ ת[ש-ת][א-ת]?״[א-ת]/, 'תאריך עברי מלא מוצג (למשל: י״ב בכסלו תשפ״ז)');
  await typeCode(page, '1234');
  await page.waitForFunction(() => /שלום משה כהן/.test(document.getElementById('view').textContent));
  assert.match(await text(page), /עוד לא החתמת היום/);
  assert.equal(await page.textContent('#instName'), 'ת"ת לדוגמה');
  await page.click('[data-act="in"]');
  await page.waitForFunction(() => /הכניסה נרשמה/.test(document.getElementById('view').textContent));
  assert.equal(mem.colls[B + 'punch'].length, 1);
  assert.equal(mem.colls[B + 'punch'][0].type, 'in');
  await page.click('[data-act="back"]');
  assert.match(await text(page), /נכנסת היום ב-/);
  assert.ok(await page.$('.big .out.next'), 'הכפתור הבא המודגש הוא יציאה');
  // כניסה שנייה מיד = לחיצה כפולה, לא נרשמת פעמיים
  await page.click('[data-act="in"]');
  await page.waitForFunction(() => /כבר נרשמה קודם/.test(document.getElementById('view').textContent));
  assert.equal(mem.colls[B + 'punch'].length, 1);
  await page.click('[data-act="back"]');
  await page.click('[data-act="out"]');
  await page.waitForFunction(() => /היציאה נרשמה/.test(document.getElementById('view').textContent));
  assert.deepEqual(mem.colls[B + 'punch'].map(p => p.type), ['in', 'out']);
  assert.deepEqual(page.errors, []);
  assert.ok(page.sent.every(d => Object.keys(d).every(k => ['inst', 'dev', 'code', 'action', 'force', 'reason', 'from', 'to', 'note'].includes(k))), 'הדף שולח רק את השדות שלו');
  await ctx.close();
});

test('יציאה בלי כניסה: חלון אישור בתוך הדף, ביטול לא רושם, אישור רושם', async () => {
  const mem = memDb();
  const { page, ctx } = await openClock(mem);
  await typeCode(page, '1234');
  await page.waitForSelector('[data-act="out"]');
  await page.click('[data-act="out"]');
  await page.waitForSelector('#dlg.on');
  assert.match(await page.textContent('#dlgTxt'), /לא רשומה לך כניסה/);
  await page.click('#dlgNo');
  assert.equal((mem.colls[B + 'punch'] || []).length, 0);
  await page.click('[data-act="out"]');
  await page.waitForSelector('#dlg.on');
  await page.click('#dlgYes');
  await page.waitForFunction(() => /היציאה נרשמה/.test(document.getElementById('view').textContent));
  assert.equal(mem.colls[B + 'punch'].length, 1);
  await ctx.close();
});

test('זכירה בטלפון: בפתיחה הבאה העובד מזוהה בלי קוד; "לא אני" מוחק', async () => {
  const mem = memDb();
  const first = await openClock(mem);
  await typeCode(first.page, '1234');
  await first.page.waitForFunction(() => /שלום משה כהן/.test(document.getElementById('view').textContent));
  await first.page.close();
  const again = await openClock(mem, { ctx: first.ctx });
  await again.page.waitForFunction(() => /שלום משה כהן/.test(document.getElementById('view').textContent));
  await again.page.click('[data-act="signout"]');
  assert.match(await text(again.page), /הקישו את קוד הנוכחות/);
  await again.page.close();
  const third = await openClock(mem, { ctx: first.ctx });
  await third.page.waitForTimeout(300);
  assert.match(await text(third.page), /הקישו את קוד הנוכחות/);
  await first.ctx.close();
});

test('דיווח היעדרות נשלח כממתין לאישור; "אחר" דורש הסבר', async () => {
  const mem = memDb();
  const { page, ctx } = await openClock(mem);
  await typeCode(page, '1234');
  await page.waitForSelector('[data-act="abs"]');
  await page.click('[data-act="abs"]');
  await page.click('[data-act="sendabs"]');
  assert.match(await text(page), /בחרו סיבה/);
  await page.click('[data-reason="אחר"]');
  await page.click('[data-act="sendabs"]');
  assert.match(await text(page), /כתבו בקצרה/);
  await page.click('[data-reason="מחלה"]');
  await page.click('[data-act="sendabs"]');
  await page.waitForFunction(() => /הדיווח נשלח/.test(document.getElementById('view').textContent));
  const a = mem.colls[B + 'absreq'];
  assert.equal(a.length, 1); assert.equal(a[0].status, 'pending'); assert.equal(a[0].reason, 'מחלה'); assert.equal(a[0].name, 'משה כהן');
  await ctx.close();
});

test('קוד שגוי: הודעה ברורה, הקוד מתאפס, ואין פנייה לשרתים חיצוניים מלבד פונטים ו-Firebase', async () => {
  const mem = memDb();
  const { page, ctx } = await openClock(mem);
  await typeCode(page, '9999');
  await page.waitForFunction(() => /הקוד לא נכון/.test(document.getElementById('view').textContent));
  assert.equal(await page.$$eval('.dots i.on', x => x.length), 0);
  assert.ok(page.external.every(u => /fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com\/firebasejs/.test(u)), 'פניות חיצוניות: ' + page.external.join(', '));
  await ctx.close();
});

test('בלי קוד מוסד בקישור — הודעה ולא מקלדת', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await page.goto(server.url + 'clock.html', { waitUntil: 'domcontentloaded' });
  assert.match(await page.textContent('#view'), /הקישור לא שלם/);
  assert.equal(await page.$('.pad'), null);
  await ctx.close();
});

test('הקוד של הדף לא מכיל גישה למאגר הנתונים', () => {
  const s = fs.readFileSync(path.join(ROOT, 'clock.html'), 'utf8');
  assert.ok(!/firebase-firestore|firebase-auth|\.firestore\(|\.auth\(/.test(s), 'clock.html לא טוען Firestore או Auth');
});
