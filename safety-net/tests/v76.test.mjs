// v76: ארכיון אירועים (בלי מחיקה), הודעה/הדפסה להורים מהרמזור, דף תמונת מצב כיתות למנהל.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, settle, serverDump } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const seedEv = () => {
  const s = S.students.find(x => x.cls === S.config.classes[0]), ch = evTypes().find(x => /חוצפה/.test(x.name));
  const add = (o, d) => S.events.push(Object.assign({ id: 'v' + Math.random().toString(36).slice(2), sid: s.id, sname: s.name, cls: s.cls, date: daysAgo(d), time: '10:00', ts: Date.now() - 100000, tk: '' }, o));
  add({ type: ch.id, typeName: ch.name, kind: 'neg', sev: 2, lv: 2 }, 1);
  add({ type: 'e6', typeName: 'אלימות פיזית', kind: 'neg', sev: 3 }, 2);
  add({ type: 'p1', typeName: 'צל"ש', kind: 'pos', sev: 1, note: 'עזר לחבר' }, 1);
  S.config.lightPolicy = { on: true };
  return s.id;
};

test('ארכיון: העברה מסתירה מכל מקום, לא מוחקת מהשרת, אירוע חדש מופיע, החזרה מחזירה', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const sid = await page.evaluate(seedEv);
  await page.evaluate(async () => { await save(K.events, S.events); });
  await settle(page);
  const before = await page.evaluate(() => S.events.length);
  assert.ok(before >= 3);
  const countSrv = async () => { const d = (await serverDump(page)).docs; let n = 0; Object.keys(d).forEach(k => { if (/att\/L/.test(k) && d[k].ev) n += Object.keys(d[k].ev).length; }); return n; };
  const srv0 = await countSrv();
  assert.ok(srv0 >= before, 'השרת ריק');
  await page.evaluate(() => { S.tab = 'events'; S.evArchView = true; render(); });
  await page.click('[data-act="ev-arch"]');
  await settle(page);
  assert.equal(await page.evaluate(() => S.events.length), 0);
  assert.equal(await page.evaluate(() => S.evArch.length), before);
  assert.equal(await countSrv(), srv0, 'נמחק מהשרת');
  // לא מופיע: כרטיס, רמזור, לוח בקרה
  const r = await page.evaluate(sid => { const L = autoLight(sid); S.cardId = sid; S.tab = 'card'; render(); const card = document.getElementById('main').textContent; S.ltStu = sid; S.tab = 'light'; render(); const lv = document.getElementById('main').textContent; S.tab = 'dash'; render(); return { score: L.score, card: card + lv, dash: document.getElementById('main').textContent }; }, sid);
  assert.equal(r.score, 0); assert.doesNotMatch(r.card, /עזר לחבר/); assert.doesNotMatch(r.dash, /אלימות פיזית/);
  // אירוע חדש אחרי הארכיון — מופיע, והשמירה לא מוחקת את הארכיון
  await page.evaluate(sid => { const s = studentById(sid); S.events.push({ id: 'new1', sid, sname: s.name, cls: s.cls, type: 'p1', typeName: 'צל"ש', kind: 'pos', sev: 1, date: daysAgo(3), ts: Date.now() + 1000, tk: '' }); return save(K.events, S.events); }, sid);
  await settle(page);
  assert.equal(await countSrv(), srv0 + 1);
  // דף הארכיון מציג
  await page.evaluate(() => { S.tab = 'events'; S.evArchView = true; render(); });
  assert.match(await page.textContent('#main'), /עזר לחבר/);
  // רענון מהשרת: החלוקה נשמרת
  await page.evaluate(async () => { await refreshData(); });
  const dbg = await page.evaluate(() => ({ ev: S.events.map(e => e.id + ':' + e.ts), arch: S.evArch.length, A: S.config.evArch }));
  assert.equal(dbg.ev.filter(x => x.startsWith('new1')).length, 1, JSON.stringify(dbg));
  assert.equal(await page.evaluate(() => S.evArch.length), before);
  // החזרה
  await page.click('[data-act="ev-unarch"]');
  assert.equal(await page.evaluate(() => S.evArch.length), 0);
  assert.equal(await page.evaluate(() => S.events.length), before + 1);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('רמזור להורים: הודעה מוכנה (ניתנת לעריכה), וואטסאפ, הדפסה', async () => {
  const page = await newPage(browser, { width: 390, height: 844, mobile: true });
  await login(page, server.url, 'teacherA');
  const sid = await page.evaluate(seedEv);
  await page.evaluate(sid => { window.__open = []; window.open = u => window.__open.push(u); window.print = () => { window.__printed = document.getElementById('lt-print-root') && document.getElementById('lt-print-root').textContent; }; S.ltStu = sid; S.tab = 'light'; render(); }, sid);
  await page.click('[data-act="lt-msg"]');
  const t = await page.inputValue('#lt-msg-t');
  assert.match(t, /תמונת מצב ההתנהגות/); assert.match(t, /עזר לחבר/); assert.match(t, /נושאים לחיזוק/); assert.doesNotMatch(t, /נק׳/);
  await page.fill('#lt-msg-t', 'שלום, בדיקה');
  await page.click('[data-act="lt-wa"]');
  const u = await page.evaluate(() => window.__open[0]);
  assert.match(u, /^https:\/\/wa\.me\/\d+\?text=/); assert.match(decodeURIComponent(u), /שלום, בדיקה/);
  await page.click('[data-act="lt-print"]');
  await page.waitForTimeout(150);
  assert.match(await page.evaluate(() => window.__printed || ''), /תמונת מצב התנהגות/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('תמונת מצב כיתות: רק למנהל; אקלים ולמידה; סינון כיתה ותאריכים', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  await page.evaluate(seedEv);
  assert.ok(await page.$('.nav [data-tab="classbi"]'));
  await page.evaluate(() => { S.tab = 'classbi'; render(); });
  let t = await page.textContent('#main');
  assert.match(t, /התפלגות הצבעים לפי כיתה/); assert.match(t, /מגמה לפי שבועות/); assert.match(t, /אלימות פיזית/);
  await page.selectOption('[data-bif="cls"]', await page.evaluate(() => S.config.classes[0]));
  await page.click('[data-act="bi-mode"][data-id="learn"]');
  t = await page.textContent('#main');
  assert.match(t, /ממוצע לפי תחום וכיתה/); assert.match(t, /תלמידים לתשומת לב/);
  await page.click('[data-act="bi-range"][data-id="365"]');
  assert.deepEqual(page.errors, []);
  await page.context().close();
  const p2 = await newPage(browser, { width: 1366, height: 768 });
  await login(p2, server.url, 'teacherA');
  assert.equal(await p2.$('.nav [data-tab="classbi"]'), null);
  await p2.context().close();
});

// v84: חיפוש לפי שם תלמיד בתוך הארכיון
test('ארכיון: חיפוש לפי שם תלמיד (גם חלק מהשם), לחיצה על שם מסננת, ניקוי מחזיר הכול', async () => {
  const page = await newPage(browser, { width: 1366, height: 768 });
  await login(page, server.url, 'admin');
  const names = await page.evaluate(() => {
    const st = S.students.slice(0, 3), mk = (s, i) => ({ id: 'ax' + i, sid: s.id, sname: s.name, cls: s.cls, type: 'p1', typeName: 'צל"ש', kind: 'pos', sev: 1, date: daysAgo(10 + i), ts: Date.now() - i });
    S.evArch = [mk(st[0], 1), mk(st[0], 2), mk(st[1], 3), mk(st[2], 4)]; S.evaf = null;
    S.tab = 'events'; S.evArchView = true; render();
    return st.map(s => s.name);
  });
  const rows = () => page.$$eval('#main table tbody tr', r => r.length);
  assert.equal(await rows(), 4);
  // הקלדה: חלק מהשם, והמיקוד נשאר בתיבה
  const part = names[0].split(' ').slice(-1)[0];
  await page.fill('#evaq', part);
  await page.waitForFunction(n => document.querySelectorAll('#main table tbody tr').length === n, names.filter(n => n.indexOf(part) > -1).length >= 1 ? (await page.evaluate(p => S.evArch.filter(e => e.sname.indexOf(p) > -1).length, part)) : 0);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'evaq', 'המיקוד נשאר בתיבת החיפוש');
  assert.match(await page.textContent('#main'), /מתוך 4/);
  // ניקוי
  await page.click('[data-act="evaf-clear"]');
  assert.equal(await rows(), 4);
  // לחיצה על שם בטבלה
  await page.click('[data-act="evaf-name"][data-n="' + names[1] + '"]');
  assert.equal(await rows(), 1);
  assert.equal(await page.inputValue('#evaq'), names[1]);
  // אין תוצאות
  await page.fill('#evaq', 'שםשלאקיים');
  await page.waitForFunction(() => /לא נמצאו אירועים לחיפוש הזה/.test(document.getElementById('main').textContent));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
