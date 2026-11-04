// סיכום תלמיד להורים — בצד המערכת, בהדגמה המבודדת (out/aura-demo.html) עם "שרת" מדומה (demo-summary-mock.js):
// רק מנהל, פרטיות החבילה (בלי שם, הורים, טלפונים; שמות בהערות מוחלפים), הכנסת השם רק אצלנו,
// PDF תקין, שמירה לתיקייה "סיכומי תלמידים" (תיקייה מדומה), הורדה כשאין תמיכה, שגיאות, ונייד.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, OUT } from './helpers.mjs';

const FILE = path.join(OUT, 'aura-demo.html');
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// תיקייה מדומה בזיכרון במקום חלון בחירת התיקייה של Chrome
function fakeFsApi(rootName) {
  const mkDir = name => { const files = {}, dirs = {}; return { kind: 'directory', name, files, dirs,
    async getDirectoryHandle(n, o) { if (!dirs[n]) { if (!o || !o.create) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } dirs[n] = mkDir(n); } return dirs[n]; },
    async getFileHandle(n, o) { if (!(n in files)) { if (!o || !o.create) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } files[n] = null; }
      return { kind: 'file', name: n, async createWritable() { let buf; return { async write(b) { buf = new Uint8Array(await b.arrayBuffer()); }, async close() { files[n] = buf; } }; } }; },
    async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; } }; };
  window.__root = mkDir(rootName); window.__picks = 0;
  window.showDirectoryPicker = async () => { window.__picks++; return window.__root; };
}

async function open({ role = 'admin', viewport = { width: 1440, height: 900 }, theme = 'light', fsApi = 'מסמכים' } = {}) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'Asia/Jerusalem', acceptDownloads: true });
  await ctx.addInitScript(([r, t]) => { try { if (r !== 'admin') sessionStorage.setItem('aura-demo-role', r); sessionStorage.setItem('aura-demo-theme', t); localStorage.setItem('tt:theme', t); } catch (e) {} window.__SUM_DELAY = 30; }, [role, theme]);
  if (fsApi) await ctx.addInitScript(fakeFsApi, fsApi);
  else await ctx.addInitScript(() => { delete window.showDirectoryPicker; });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00+02:00'));
  page.errors = []; page.external = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route(/^(?!file:|data:|blob:)/, r => { page.external.push(r.request().url()); r.abort(); });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => document.getElementById('shell').classList.contains('on') && typeof S !== 'undefined' && S.me && S.students.length, null, { timeout: 15000 });
  return page;
}
const card = (page, sid) => page.evaluate(id => { S.tab = 'card'; S.cardId = id; render(); }, sid);
async function generate(page, sid) {
  await card(page, sid);
  await page.click('.s3-acts [data-act="sum-open"]');
  await page.click('#sumDlg [data-sum="gen"]');
  await page.waitForSelector('#sumText');
}
const pdfInfo = page => page.evaluate(() => {
  const d = window.__root.dirs['סיכומי תלמידים'] || window.__root; const out = {};
  for (const [n, u] of Object.entries(d.files)) { let s = ''; for (const c of u) s += String.fromCharCode(c); out[n] = { head: s.slice(0, 8), tail: s.trimEnd().slice(-5), pages: Number((s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/) || [])[1]), a4: s.includes('/MediaBox [0 0 595.28 841.89]'), jpeg: s.includes('/DCTDecode'), size: u.length }; }
  return { names: Object.keys(d.files), files: out, picks: window.__picks, subdirs: Object.keys(window.__root.dirs) };
});

test('סיכום: הכפתור מוצג רק למנהל; מחנך לא יכול לפתוח את החלון', async () => {
  const page = await open();
  await card(page, 's22');
  assert.ok(await page.$('.s3-acts [data-act="sum-open"]'));
  await page.context().close();
  const t = await open({ role: 'teacher' });
  await card(t, 's5');
  assert.equal(await t.$('.s3-acts [data-act="sum-open"]'), null);
  await t.evaluate(() => sumOpen('s5'));
  assert.equal(await t.$('#sumDlg .sum-box'), null, 'מחנך פתח את חלון הסיכום');
  assert.deepEqual(t.errors, []);
  await t.context().close();
});

test('סיכום: פרטיות — לא נשלחים שם, הורים, טלפונים; שמות בהערות מוחלפים; נשלחים רק מוסד וחבילה', async () => {
  const page = await open();
  const who = await page.evaluate(() => {
    const s = studentById('s22'), o = S.students.find(x => x.id !== s.id && x.cls === s.cls), t = (S.config.homeroom || {})[s.cls] || S.me.teacher;
    const last = reviewsOf(s.id).pop();
    last.note = 'שיחה עם ' + s.father + ' (052-7654321). ' + s.name + ' עזר ל' + o.name + ' בהפסקה, לפי ' + t + '. ת"ז 123456782';
    const own = s.name.split(/\s+/).pop();
    S.events.push({ id: 'pv1', sid: s.id, sname: s.name, cls: s.cls, type: 'e1', typeName: 'עזרה לחבר', kind: 'pos', sev: 1, date: iso(new Date()), time: '10:00', note: 'כל הכבוד ל' + own + '! אבא ' + s.father + ' עודכן', by: t });
    return { name: s.name, own, father: s.father, mother: s.mother, phones: [s.fatherPhone, s.motherPhone].filter(Boolean), other: o.name, teacher: t };
  });
  await generate(page, 's22');
  const req = await page.evaluate(() => window.__lastSummaryReq);
  assert.deepEqual(Object.keys(req).sort(), ['inst', 'packet']);
  const j = JSON.stringify(req);
  for (const x of [who.name, who.own, who.father, who.mother, who.other, who.teacher, '052-7654321', '7654321', '123456782'].concat(who.phones).filter(Boolean))
    assert.ok(!j.includes(x), 'נשלח: ' + x);
  for (const x of ['התלמיד', 'תלמיד אחר', 'המורה', 'ההורה', '[מספר הוסר]']) assert.ok(j.includes(x), 'לא הוחלף ל: ' + x);
  assert.deepEqual(page.errors, []);
  assert.ok(page.external.every(u => /^https:\/\/fonts\./.test(u)), 'פנייה החוצה: ' + page.external.join(', '));
  await page.context().close();
});

test('סיכום: החבילה נגזרת מהנתונים, והשם מוכנס לטיוטה רק במערכת', async () => {
  const page = await open();
  await generate(page, 's22');
  const r = await page.evaluate(() => {
    const s = studentById('s22'), p = window.__lastSummaryReq.packet, a = attStats(s.id, daysAgo(29), iso(new Date()));
    return { p, a, ev: S.events.filter(e => e.sid === s.id && e.date >= daysAgo(90)).length, revs: reviewsOf(s.id).length, name: s.name, text: document.getElementById('sumText').value };
  });
  assert.equal(r.p.attendance.last30.pct, r.a.pct); assert.equal(r.p.attendance.last30.total, r.a.total);
  assert.equal(r.p.events.length, Math.min(30, r.ev));
  assert.equal(r.p.snapshots.length, Math.min(4, r.revs));
  assert.ok(r.p.snapshots.every(x => ['ירוק', 'צהוב', 'אדום', ''].includes(x.light)));
  assert.ok(r.p.insights.length > 0);
  assert.ok(r.text.includes(r.name), 'השם לא הוכנס לטיוטה');
  assert.ok(!r.text.includes('{{שם}}'), 'נשאר סימן שם בטיוטה');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('סיכום: שמירה כ-PDF — יוצרת את התיקייה "סיכומי תלמידים", בחירת מיקום פעם אחת, וסיכום נוסף לא דורס', async () => {
  const page = await open();
  await generate(page, 's22');
  await page.fill('#sumText', 'הורים יקרים, טקסט שנערך ביד.\n## נוכחות\n' + 'משפט ארוך לבדיקת מעבר עמוד. '.repeat(260));
  await page.click('#sumDlg [data-sum="save"]');
  await page.waitForSelector('#sumDlg .sum-ok', { timeout: 30000 });
  let f = await pdfInfo(page);
  const name = await page.evaluate(() => studentById('s22').name);
  assert.deepEqual(f.subdirs, ['סיכומי תלמידים']);
  assert.deepEqual(f.names, [name + ' - 4.11.2026.pdf']);
  const p1 = f.files[f.names[0]];
  assert.equal(p1.head, '%PDF-1.4'); assert.equal(p1.tail, '%%EOF'); assert.ok(p1.a4 && p1.jpeg);
  assert.ok(p1.pages >= 2, 'טקסט ארוך צריך לעבור לעמוד שני');
  assert.equal(f.picks, 1);
  // שמירה נוספת של אותו תלמיד באותו יום — בלי לבחור שוב תיקייה, ובשם חדש
  await page.click('#sumDlg [data-sum="save"]');
  await page.waitForFunction(n => window.__root.dirs['סיכומי תלמידים'].files[n] !== undefined && window.__root.dirs['סיכומי תלמידים'].files[n] !== null, name + ' - 4.11.2026 (2).pdf', { timeout: 30000 });
  f = await pdfInfo(page);
  assert.equal(f.picks, 1, 'ביקש לבחור תיקייה שוב');
  assert.equal(f.names.length, 2);
  assert.match(await page.textContent('#sumDlg .sum-folder'), /סיכומי תלמידים/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('סיכום: אם נבחרה תיקייה בשם "סיכומי תלמידים" — שומרים בה ישירות', async () => {
  const page = await open({ fsApi: 'סיכומי תלמידים' });
  await generate(page, 's30');
  await page.click('#sumDlg [data-sum="save"]');
  await page.waitForSelector('#sumDlg .sum-ok', { timeout: 30000 });
  const f = await pdfInfo(page);
  assert.deepEqual(f.subdirs, [], 'נוצרה תיקייה כפולה');
  assert.equal(f.names.length, 1);
  await page.context().close();
});

test('סיכום: בדפדפן בלי גישה לתיקיות — הקובץ יורד כרגיל עם שם התלמיד', async () => {
  const page = await open({ fsApi: null });
  await generate(page, 's22');
  assert.match(await page.textContent('#sumDlg .sum-folder'), /ההורדות/);
  // בקובץ מקומי (file://) Chrome מתעלם משם ההורדה, לכן בודקים את השם שהמערכת נותנת לקישור
  await page.evaluate(() => { const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__dlName = this.download; window.__dlHref = this.href; return c.call(this); }; });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#sumDlg [data-sum="save"]')]);
  const r = await page.evaluate(() => ({ name: studentById('s22').name, dl: window.__dlName, href: window.__dlHref }));
  assert.equal(r.dl, r.name + ' - 4.11.2026.pdf');
  assert.match(r.href, /^blob:/);
  const bytes = await (await import('node:fs')).promises.readFile(await dl.path());
  assert.equal(bytes.subarray(0, 8).toString('latin1'), '%PDF-1.4', 'הקובץ שירד אינו PDF');
  await page.waitForSelector('#sumDlg .sum-ok');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('סיכום: שגיאה מהשרת מוצגת בבירור, ו"נסו שוב" עובד; ומשהו מזהה בחבילה עוצר את השליחה', async () => {
  const page = await open();
  await page.evaluate(() => { window.__SUM_FAIL = 'הגעת למכסת הסיכומים היומית (40)'; });
  await card(page, 's22');
  await page.click('.s3-acts [data-act="sum-open"]');
  await page.click('#sumDlg [data-sum="gen"]');
  await page.waitForSelector('#sumDlg .sum-err');
  assert.match(await page.textContent('#sumDlg .sum-err'), /מכסת הסיכומים/);
  await page.evaluate(() => { window.__SUM_FAIL = ''; });
  await page.click('#sumDlg [data-sum="gen"]');
  await page.waitForSelector('#sumText');
  await page.click('#sumDlg .sum-x');
  // שם תלמיד שזהה לשם של תחום מעקב — הבדיקה האחרונה תופסת אותו בחבילה ולא שולחת
  await page.evaluate(() => { window.__lastSummaryReq = null; const s = studentById('s30'); s.name = domains()[0].name; });
  await card(page, 's30');
  await page.click('.s3-acts [data-act="sum-open"]');
  await page.click('#sumDlg [data-sum="gen"]');
  await page.waitForSelector('#sumDlg .sum-err');
  assert.match(await page.textContent('#sumDlg .sum-err'), /לא נשלחה/);
  assert.equal(await page.evaluate(() => window.__lastSummaryReq), null, 'החבילה נשלחה למרות פרט מזהה');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

for (const theme of ['light', 'dark']) {
  test('סיכום בנייד (' + theme + '): החלון בתוך המסך, בלי גלילה אופקית, ומעל סרגל הניווט', async () => {
    const page = await open({ viewport: { width: 360, height: 760 }, theme });
    await generate(page, 's22');
    const r = await page.evaluate(() => {
      const b = document.querySelector('#sumDlg .sum-box').getBoundingClientRect(), nav = document.getElementById('bnav');
      const bad = [...document.querySelectorAll('#sumDlg .sum-box *')].filter(e => { const x = e.getBoundingClientRect(); return x.width && (x.right > innerWidth + .5 || x.left < -.5); }).map(e => e.className || e.tagName);
      return { inside: b.left >= 0 && b.right <= innerWidth + .5 && b.top >= 0 && b.bottom <= innerHeight + .5, bad, pageH: document.documentElement.scrollWidth > innerWidth,
        zBox: +getComputedStyle(document.querySelector('#sumDlg .sum-box')).zIndex, zNav: nav ? +getComputedStyle(nav).zIndex || 0 : 0 };
    });
    assert.ok(r.inside, 'החלון חורג מהמסך'); assert.deepEqual(r.bad, []); assert.equal(r.pageH, false);
    assert.ok(r.zBox > r.zNav, 'סרגל הניווט מעל החלון');
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}
