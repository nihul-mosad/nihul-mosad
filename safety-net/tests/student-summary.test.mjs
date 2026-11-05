// סיכום תלמיד להורים — בגרסה הקלאסית של המערכת, בסביבת הניסוי המקומית (out/staging-local.html)
// עם "שרת" מדומה (demo-summary-mock.js, בלי AI ובלי רשת):
// רק מנהל, פרטיות החבילה, הכנסת השם רק אצלנו, PDF תקין, שמירה לתיקייה "סיכומי תלמידים" (תיקייה מדומה),
// הורדה כשאין תמיכה, שגיאות, נייד — ושהכרטיס הקלאסי לא השתנה מלבד הכפתור.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

function fakeFsApi(rootName) {
  const mkDir = name => { const files = {}, dirs = {}; return { kind: 'directory', name, files, dirs,
    async getDirectoryHandle(n, o) { if (!dirs[n]) { if (!o || !o.create) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } dirs[n] = mkDir(n); } return dirs[n]; },
    async getFileHandle(n, o) { if (!(n in files)) { if (!o || !o.create) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } files[n] = null; }
      return { kind: 'file', name: n, async createWritable() { let buf; return { async write(b) { buf = new Uint8Array(await b.arrayBuffer()); }, async close() { files[n] = buf; } }; } }; },
    async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; } }; };
  window.__root = mkDir(rootName); window.__picks = 0;
  window.showDirectoryPicker = async () => { window.__picks++; return window.__root; };
}

// נתונים לתלמיד s1 (בזיכרון הדף בלבד): תמונות מצב, אירועים, הערה עם שמות וטלפון
const addData = page => page.evaluate(() => {
  const s = studentById('s1'), o = studentById('s2'), d = n => daysAgo(n);
  const t = (S.config.homeroom || {})[s.cls] || 'הרב ישראל ישראלי';
  S.reviews.push({ id: 'r1', studentId: s.id, date: d(40), light: 'yellow', scores: { d1: 3, d2: 3, d3: 4 }, note: 'מתקדם' });
  S.reviews.push({ id: 'r2', studentId: s.id, date: d(5), light: 'green', scores: { d1: 4, d2: 3, d3: 5 },
    note: 'שיחה עם ' + s.father + ' (052-7654321). ' + s.name + ' עזר ל' + o.name + ' בהפסקה, לפי ' + t + '. ת"ז 123456782' });
  S.events.push({ id: 'pv1', sid: s.id, sname: s.name, cls: s.cls, type: 'e1', typeName: 'עזרה לחבר', kind: 'pos', sev: 1, date: iso(new Date()), time: '10:00', note: 'כל הכבוד ל' + s.name.split(' ').pop() + '!', by: t });
  S.events.push({ id: 'pv2', sid: s.id, sname: s.name, cls: s.cls, type: 'e2', typeName: 'הפרעה בשיעור', kind: 'neg', sev: 1, date: d(3), time: '11:00', note: '' });
  return { name: s.name, own: s.name.split(' ').pop(), father: s.father, mother: s.mother, phone: s.fatherPhone, other: o.name, teacher: t };
});

async function open({ who = 'admin', fsApi = 'מסמכים', width = 1280, height = 900, mobile = false } = {}) {
  const page = await newPage(browser, { width, height, mobile });
  await page.context().grantPermissions([]);
  await page.addInitScript(() => { window.__SUM_DELAY = 30; });
  if (fsApi) await page.addInitScript(fakeFsApi, fsApi); else await page.addInitScript(() => { delete window.showDirectoryPicker; });
  await login(page, server.url, who);
  return page;
}
const card = (page, sid) => page.evaluate(id => { S.tab = 'card'; S.cardId = id; render(); }, sid);
async function generate(page, sid = 's1') {
  await card(page, sid);
  await page.click('[data-act="sum-open"]');
  await page.click('#sumDlg [data-sum="gen"]');
  await page.waitForSelector('#sumText');
}
const files = page => page.evaluate(() => {
  const d = window.__root.dirs['סיכומי תלמידים'] || window.__root, out = {};
  for (const [n, u] of Object.entries(d.files)) { if (!u) continue; let s = ''; for (const c of u) s += String.fromCharCode(c);
    out[n] = { head: s.slice(0, 8), tail: s.trimEnd().slice(-5), pages: Number((s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/) || [])[1]), a4: s.includes('/MediaBox [0 0 595.28 841.89]') }; }
  return { files: out, picks: window.__picks, subdirs: Object.keys(window.__root.dirs) };
});
const today = () => { const d = new Date(); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); };

test('סיכום (גרסה קלאסית): הכפתור רק למנהל; מורה לא פותח את החלון; שאר הכרטיס כמו קודם', async () => {
  const page = await open();
  await card(page, 's1');
  assert.ok(await page.$('[data-act="sum-open"]'));
  // הכרטיס הקלאסי: אותם כפתורים כמו קודם + "סיכום להורים", ואין שכבות עיצוב חדשות
  assert.deepEqual(await page.$$eval('#main .head .row [data-act]', bs => bs.map(b => b.dataset.act)), ['goto-students', 'print', 'student-edit', 'sum-open']);
  assert.equal(await page.$('style#aura-3-1, style#aura-students, .s3-hero, .au-top'), null, 'נכנס עיצוב חדש');
  assert.deepEqual(page.errors, []);
  await page.context().close();
  const t = await open({ who: 'teacherA' });
  await card(t, 's1');
  assert.equal(await t.$('[data-act="sum-open"]'), null);
  await t.evaluate(() => sumOpen('s1'));
  assert.equal(await t.$('#sumDlg .sum-box'), null, 'מורה פתח את חלון הסיכום');
  assert.deepEqual(t.errors, []);
  await t.context().close();
});

test('סיכום: פרטיות — לא נשלחים שם, הורים, טלפונים; שמות בהערות מוחלפים; נשלחים רק מוסד וחבילה', async () => {
  const page = await open();
  const who = await addData(page);
  await generate(page);
  const req = await page.evaluate(() => window.__lastSummaryReq);
  assert.deepEqual(Object.keys(req).sort(), ['inst', 'packet']);
  const j = JSON.stringify(req);
  for (const x of [who.name, who.own, who.father, who.mother, who.other, who.teacher, who.phone, '052-7654321', '7654321', '123456782'].filter(Boolean))
    assert.ok(!j.includes(x), 'נשלח: ' + x);
  for (const x of ['התלמיד', 'תלמיד אחר', 'המורה', '[מספר הוסר]']) assert.ok(j.includes(x), 'לא הוחלף ל: ' + x);
  assert.deepEqual(page.errors, []);
  assert.ok(page.external.every(u => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)), 'פנייה החוצה: ' + page.external.join(', '));
  await page.context().close();
});

test('סיכום: החבילה נגזרת מהנתונים, והשם מוכנס לטיוטה רק במערכת', async () => {
  const page = await open();
  await addData(page);
  await generate(page);
  const r = await page.evaluate(() => {
    const s = studentById('s1'), p = window.__lastSummaryReq.packet, a = attStats(s.id, daysAgo(29), iso(new Date()));
    return { p, a, name: s.name, text: document.getElementById('sumText').value };
  });
  assert.equal(r.p.attendance.last30.total, r.a.total);
  assert.equal(r.p.events.length, 2);
  assert.deepEqual(r.p.snapshots.map(x => x.light), ['צהוב', 'ירוק']);
  assert.deepEqual(r.p.snapshots[1].scores, { 'לימודים': 4, 'ריכוז והתמדה': 3, 'התנהגות': 5 });
  assert.ok(r.p.insights.length > 0);
  assert.ok(r.text.includes(r.name) && !r.text.includes('{{שם}}'));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('סיכום: שמירה כ-PDF — יוצרת "סיכומי תלמידים", בחירת מיקום פעם אחת, וסיכום נוסף לא דורס', async () => {
  const page = await open();
  await addData(page);
  await generate(page);
  await page.fill('#sumText', 'הורים יקרים, טקסט שנערך ביד.\n## נוכחות\n' + 'משפט ארוך לבדיקת מעבר עמוד. '.repeat(260));
  await page.click('#sumDlg [data-sum="save"]');
  await page.waitForSelector('#sumDlg .sum-ok', { timeout: 30000 });
  const name = await page.evaluate(() => studentById('s1').name), fn = name + ' - ' + today() + '.pdf';
  let f = await files(page);
  assert.deepEqual(f.subdirs, ['סיכומי תלמידים']);
  assert.deepEqual(Object.keys(f.files), [fn]);
  assert.equal(f.files[fn].head, '%PDF-1.4'); assert.equal(f.files[fn].tail, '%%EOF'); assert.ok(f.files[fn].a4); assert.ok(f.files[fn].pages >= 2);
  await page.click('#sumDlg [data-sum="save"]');
  await page.waitForFunction(n => { const d = window.__root.dirs['סיכומי תלמידים']; return d.files[n]; }, fn.replace('.pdf', ' (2).pdf'), { timeout: 30000 });
  f = await files(page);
  assert.equal(f.picks, 1, 'ביקש לבחור תיקייה שוב'); assert.equal(Object.keys(f.files).length, 2);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('סיכום: בדפדפן בלי גישה לתיקיות — PDF יורד כרגיל עם שם התלמיד', async () => {
  const page = await open({ fsApi: null });
  await generate(page);
  assert.match(await page.textContent('#sumDlg .sum-folder'), /ההורדות/);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#sumDlg [data-sum="save"]')]);
  const name = await page.evaluate(() => studentById('s1').name);
  assert.equal(dl.suggestedFilename(), name + ' - ' + today() + '.pdf');
  assert.equal(fs.readFileSync(await dl.path()).subarray(0, 8).toString('latin1'), '%PDF-1.4');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('סיכום: שגיאה מהשרת מוצגת, "נסו שוב" עובד, ופרט מזהה בחבילה עוצר את השליחה', async () => {
  const page = await open();
  await page.evaluate(() => { window.__SUM_FAIL = 'הגעת למכסת הסיכומים היומית (40)'; });
  await card(page, 's1');
  await page.click('[data-act="sum-open"]');
  await page.click('#sumDlg [data-sum="gen"]');
  await page.waitForSelector('#sumDlg .sum-err');
  assert.match(await page.textContent('#sumDlg .sum-err'), /מכסת הסיכומים/);
  await page.evaluate(() => { window.__SUM_FAIL = ''; });
  await page.click('#sumDlg [data-sum="gen"]');
  await page.waitForSelector('#sumText');
  await page.click('#sumDlg .sum-x');
  // שם תלמיד שזהה לשם של תחום מעקב (שמופיע בחבילה בציוני תמונת המצב) — הבדיקה האחרונה עוצרת את השליחה
  await page.evaluate(() => { window.__lastSummaryReq = null; const s = studentById('s2'); s.name = domains()[0].name;
    S.reviews.push({ id: 'rx', studentId: s.id, date: daysAgo(2), light: 'green', scores: { d1: 4 }, note: '' }); });
  await card(page, 's2');
  await page.click('[data-act="sum-open"]');
  await page.click('#sumDlg [data-sum="gen"]');
  await page.waitForSelector('#sumDlg .sum-err');
  assert.match(await page.textContent('#sumDlg .sum-err'), /לא נשלחה/);
  assert.equal(await page.evaluate(() => window.__lastSummaryReq), null);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('סיכום בנייד: החלון בתוך המסך, בלי גלילה אופקית, ומעל הכול', async () => {
  const page = await open({ width: 360, height: 760, mobile: true });
  await generate(page);
  const r = await page.evaluate(() => {
    const b = document.querySelector('#sumDlg .sum-box').getBoundingClientRect();
    const bad = [...document.querySelectorAll('#sumDlg .sum-box *')].filter(e => { const x = e.getBoundingClientRect(); return x.width && (x.right > innerWidth + .5 || x.left < -.5); }).map(e => e.className || e.tagName);
    const top = document.elementFromPoint(innerWidth / 2, b.top + 30);
    return { inside: b.left >= 0 && b.right <= innerWidth + .5 && b.bottom <= innerHeight + .5, bad, pageH: document.documentElement.scrollWidth > innerWidth, onTop: !!(top && top.closest('#sumDlg')) };
  });
  assert.ok(r.inside); assert.deepEqual(r.bad, []); assert.equal(r.pageH, false); assert.ok(r.onTop, 'משהו מכסה את החלון');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
