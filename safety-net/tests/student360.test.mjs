// כרטיס תלמיד חכם (Student 360) ומסך הבית בהדגמה המבודדת (out/aura-demo.html):
// מבנה מלא, תובנות עם הסבר, הרשאות קיימות, וגרפים שנגזרים מהנתונים (לא ערכים קשיחים).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, OUT } from './helpers.mjs';

const FILE = path.join(OUT, 'aura-demo.html');
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function open(role = 'admin', viewport = { width: 1648, height: 928 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(r => { try { if (r !== 'admin') sessionStorage.setItem('aura-demo-role', r); } catch (e) {} }, role);
  const page = await ctx.newPage();
  page.errors = []; page.external = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route(/^(?!file:|data:|blob:)/, r => { page.external.push(r.request().url()); r.abort(); });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => document.getElementById('shell').classList.contains('on') && typeof S !== 'undefined' && S.me && S.students.length, null, { timeout: 15000 });
  return page;
}
const openCard = (page, sid) => page.evaluate(id => { S.tab = 'card'; S.cardId = id; render(); }, sid);
const kpiText = page => page.$$eval('.s3-kpis .au-kpi b', bs => bs.map(b => b.textContent.trim()));

test('כרטיס תלמיד: כל חלקי הכרטיס מוצגים, ולכל תובנה יש הסבר עם מספרים', async () => {
  const page = await open();
  await openCard(page, 's22');
  for (const sel of ['.s3-hero .s3-av', '.s3-hero h2', '.s3-kpis .au-kpi', '.s3-trend svg rect', '.s3-mix svg circle', '.s3-ins .s3-in', '.s3-evs svg', '.s3-dom .s3-d', '.s3-tl .s3-t', '.s3-more'])
    assert.ok(await page.$(sel), 'חסר: ' + sel);
  assert.equal((await page.$$('.s3-kpis .au-kpi')).length, 4);
  assert.equal(await page.$eval('.s3-hero h2', e => e.textContent), await page.evaluate(() => studentById('s22').name));
  const ins = await page.$$eval('.s3-in', xs => xs.map(x => x.textContent));
  assert.ok(ins.length > 0);
  for (const t of ins) { assert.match(t, /למה\?/, 'תובנה בלי הסבר: ' + t); }
  assert.ok(ins.filter(t => !/אין חריגות/.test(t)).every(t => /\d/.test(t)), 'הסבר בלי מספרים');
  assert.equal((await page.$$('.s3-dom .s3-d')).length, await page.evaluate(() => domains().length), 'שורה לכל תחום מעקב');
  assert.deepEqual(page.errors, []);
  assert.ok(page.external.every(u => /^https:\/\/fonts\./.test(u)), 'פנייה החוצה: ' + page.external.join(', '));
  await page.context().close();
});

test('כרטיס תלמיד: הנתונים בכרטיס נגזרים מהמאגר — אירועים וחיסורים חדשים משנים את המדדים ואת התובנות', async () => {
  const page = await open();
  await openCard(page, 's30');
  const before = await kpiText(page);
  const insBefore = await page.$$eval('.s3-in b', xs => xs.map(x => x.textContent));
  await page.evaluate(() => {
    const st = studentById('s30'), d = iso(new Date());
    for (let i = 0; i < 3; i++) S.events.push({ id: 'tst' + i, sid: st.id, sname: st.name, cls: st.cls, type: 'e1', typeName: 'הפרעה בשיעור', kind: 'neg', sev: 1, date: daysAgo(i), time: '10:00', by: 'בדיקה' });
    const lessons = S.timetable.filter(l => (l.classes || []).indexOf(st.cls) > -1 && l.day === new Date(d + 'T12:00:00').getDay());
    for (let k = 1; k <= 3; k++) { const dd = daysAgo(k); S.latt[dd] = S.latt[dd] || {}; S.timetable.filter(l => (l.classes || []).indexOf(st.cls) > -1).slice(0, 2).forEach(l => { S.latt[dd][l.id + ':' + st.id] = 'absent'; }); }
    LIDX = null; render();
  });
  const after = await kpiText(page);
  assert.notEqual(after[1], before[1], 'מספר החיסורים לא השתנה');
  assert.match(after[2], /\/\s*(\d+)/);
  assert.equal(Number(after[2].split('/')[1]) - Number(before[2].split('/')[1]), 3, 'שלושת האירועים לא נספרו');
  const insAfter = await page.$$eval('.s3-in b', xs => xs.map(x => x.textContent));
  assert.ok(insAfter.some(t => /ריבוי אירועים לשיפור/.test(t)), 'התובנה על ריבוי אירועים לא הופיעה: ' + insAfter.join(' | ') + ' (לפני: ' + insBefore.join(' | ') + ')');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('כרטיס תלמיד: פעולות מהירות לפי ההרשאות הקיימות (מנהל / מחנך / מחנך אחר / מורה מקצועי)', async () => {
  const cases = [['admin', 's22', ['ev-for', 'rev-one', 'print', 'student-edit', 'sum-open']], ['teacher', 's5', ['ev-for', 'rev-one', 'print']], ['teacher', 's22', null], ['math', 's5', null]];
  for (const [role, sid, want] of cases) {
    const page = await open(role, { width: 1400, height: 900 });
    await openCard(page, sid);
    const acts = await page.$$eval('.s3-acts [data-act]', bs => bs.map(b => b.dataset.act).filter(a => a !== 'goto-students'));
    if (want) assert.deepEqual(acts, want, role + ' ' + sid);
    else { assert.equal(acts.length, 0, role + ' ' + sid + ' לא אמור לראות את הכרטיס'); assert.match(await page.textContent('#main'), /זמין רק למחנך הכיתה ולמנהל/); }
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test('כרטיס תלמיד: "דיווח אירוע" ו"תמונת מצב" פותחים את הטפסים הקיימים עבור אותו תלמיד', async () => {
  const page = await open();
  await openCard(page, 's22');
  await page.click('.s3-acts [data-act="ev-for"]');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => S.tab), 'events');
  assert.deepEqual(await page.evaluate(() => S.evc && S.evc.sids), ['s22']);
  await openCard(page, 's22');
  await page.click('.s3-acts [data-act="rev-one"]');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => S.revList && S.revList[S.revIdx] && S.revList[S.revIdx].id), 's22');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('מסך הבית: הגרפים נגזרים מנתוני הדמה — אירוע חדש משנה את "אירועים לפי סוג", וחיסורים משנים את הנוכחות', async () => {
  const page = await open();
  const read = () => page.evaluate(() => ({ types: document.querySelector('.au-types .ring .c b').textContent, month: document.querySelector('.au-month .ring .c b').textContent, kpiOpen: document.querySelectorAll('.au-kpi b')[1].textContent }));
  const a = await read();
  await page.evaluate(() => { const st = S.students[0]; S.events.push({ id: 'tstd', sid: st.id, sname: st.name, cls: st.cls, type: 'e6', typeName: 'אלימות פיזית', kind: 'neg', sev: 3, date: iso(new Date()), time: '08:30', by: 'בדיקה', handled: false }); render(); });
  const b = await read();
  assert.equal(Number(b.types), Number(a.types) + 1, 'סה״כ האירועים לפי סוג לא עלה');
  assert.equal(Number(b.kpiOpen), Number(a.kpiOpen) + 1, 'מספר האירועים הפתוחים לא עלה');
  await page.evaluate(() => { const mo = iso(new Date()).slice(0, 7); Object.keys(S.latt).filter(d => d.slice(0, 7) === mo).forEach(d => { Object.keys(S.latt[d]).forEach(k => { S.latt[d][k] = 'absent'; }); }); LIDX = null; render(); });
  const c = await read();
  assert.notEqual(c.month, b.month, 'אחוז הנוכחות החודשי לא השתנה');
  assert.equal(c.month, '0%');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
