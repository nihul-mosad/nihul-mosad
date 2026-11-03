// בדיקות אבחון לחשדות מדוח האבחון. לא חוסמות פריסה: הן מתעדות התנהגות ומאשרות או מפריכות חשד.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login, serverDoc, settle, INST } from './helpers.mjs';
import { keyify, CLASSES, USERS } from '../seed.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function schoolDays(n) { const out = []; const d = new Date(); while (out.length < n) { d.setDate(d.getDate() - 1); if (d.getDay() <= 4) out.push(new Date(d)); } return out; }
const B = 'insts/' + INST + '/';

async function markLesson(page, day, statusFor) {
  const date = iso(day), lid = 'L0' + day.getDay() + '1';
  await page.evaluate(d => { S.tab = 'mark'; S.markView = 'lessons'; S.markDate = d; S.markLesson = null; render(); }, date);
  await page.click(`button.lrow[data-id="${lid}"]`);
  await page.click('[data-act="lm-all"]');
  for (const [sid, st] of Object.entries(statusFor || {})) await page.click(`[data-act="lm-set"][data-id="${sid}"][data-s="${st}"]`);
  await page.click('[data-act="lm-save"]');
  await settle(page);
  return { date, lid };
}

test('ממצא מ2: מעבר תלמיד בין כיתות — האם ההיסטוריה שלו נמחקת?', { todo: 'אבחון: התוצאה מתועדת, לא חוסמת' }, async () => {
  const page = await newPage(browser);
  const [d1, d2] = schoolDays(2);
  // 1. המחנך של כיתה א' מסמן חיסור לתלמיד s1 ביום הראשון
  await login(page, server.url, 'teacherA');
  const m1 = await markLesson(page, d2, { s1: 'absent' });
  const pathA = B + 'att/L' + m1.date.slice(0, 7) + '_' + keyify(CLASSES[0]) + '_' + keyify(USERS.teacherA.teacher);
  assert.equal((await serverDoc(page, pathA)).d[m1.date][m1.lid + ':s1'], 'absent', 'הכנה: החיסור לא נשמר');

  // 2. המנהל מעביר את s1 לכיתה ב' (רק שינוי כיתה, בלי לשמור נוכחות)
  await page.evaluate(() => logout()); await page.waitForTimeout(400);
  await login(page, server.url, 'admin');
  await page.evaluate(c => { const s = S.students.find(x => x.id === 's1'); s.cls = c; return save(K.students, S.students); }, CLASSES[1]);
  await settle(page);

  // 3. המחנך של כיתה א' מסמן שיעור אחר, ביום אחר
  await page.evaluate(() => logout()); await page.waitForTimeout(400);
  await login(page, server.url, 'teacherA');
  await markLesson(page, d1, {});

  // 4. האם החיסור של s1 עדיין קיים בשרת, במסמך של כיתה א' או במסמך של כיתה ב'?
  const all = await page.evaluate(() => window.__fakefs.dump().docs);
  const hits = Object.keys(all).filter(p => p.indexOf(B + 'att/') === 0)
    .filter(p => ((all[p].d || {})[m1.date] || {})[m1.lid + ':s1']);
  console.log('    [מ2] מסמכים שבהם החיסור של s1 עדיין קיים:', hits.length ? hits.join(', ') : '(אין — הנתון נמחק)');
  assert.ok(hits.length > 0, 'החשד אושר: אחרי מעבר כיתה ושמירה של המחנך הקודם, החיסור ההיסטורי של התלמיד נמחק מהשרת');
});
