// אזור המדדים והגרפים במסך התלמידים (saView) בהדגמה המבודדת (out/aura-demo.html):
// ערכים שנגזרים מהנתונים (חישוב בלתי תלוי בבדיקה), הרשאות, מצב ללא נתונים, שינוי נתונים, סינון מול חיפוש, ונייד בלי גלישה.
// שעון קבוע (יום רביעי 12:00 שעון ישראל) — כדי שהתוצאות לא יהיו תלויות בשעת ההרצה או באזור הזמן.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, OUT } from './helpers.mjs';

const FILE = path.join(OUT, 'aura-demo.html');
const NOW = '2026-11-04T12:00:00+02:00';
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function open(role = 'admin', viewport = { width: 1648, height: 928 }, theme = 'light') {
  const ctx = await browser.newContext({ viewport, timezoneId: 'Asia/Jerusalem' });
  await ctx.addInitScript(([r, t]) => { try { if (r !== 'admin') sessionStorage.setItem('aura-demo-role', r); sessionStorage.setItem('aura-demo-theme', t); localStorage.setItem('tt:theme', t); } catch (e) {} }, [role, theme]);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  page.errors = []; page.external = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route(/^(?!file:|data:|blob:)/, r => { page.external.push(r.request().url()); r.abort(); });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => document.getElementById('shell').classList.contains('on') && typeof S !== 'undefined' && S.me && S.students.length, null, { timeout: 15000 });
  await page.evaluate(() => { S.tab = 'students'; render(); });
  return page;
}

// מה שמוצג במסך
const shown = page => page.evaluate(() => {
  const k = n => document.querySelector('.sa-kpi[data-sa="' + n + '"]');
  return {
    count: Number(k('count').querySelector('strong').textContent),
    att: k('att').querySelector('strong').textContent.trim(), attOk: Number(k('att').dataset.ok), attN: Number(k('att').dataset.n),
    events: Number(k('events').querySelector('strong').textContent),
    trend: k('trend').querySelector('strong').textContent.trim(), delta: k('trend').dataset.delta,
    classes: [...document.querySelectorAll('.sa-cr')].map(r => ({ cls: r.dataset.cls, n: Number(r.dataset.n), pct: r.querySelector('em').textContent, w: r.querySelector('.sa-bar i').style.width })),
    lights: Object.fromEntries([...document.querySelectorAll('.sa-leg [data-k]')].map(d => [d.dataset.k, Number(d.querySelector('strong').textContent)])),
    arcs: [...document.querySelectorAll('.sa-ring circle[data-k]')].map(c => c.dataset.k),
    center: Number(document.querySelector('.sa-mid b').textContent),
    weeks: [...document.querySelectorAll('.sa-trend .xl')].map(t => t.textContent),
    weekN: [...document.querySelectorAll('.sa-trend .xn')].map(t => t.textContent),
    points: document.querySelectorAll('.sa-trend .pt circle').length,
    trendEmpty: !!document.querySelector('.sa-wk .sa-empty'),
  };
});

// חישוב בלתי תלוי מהנתונים הגולמיים (S.latt / S.att / S.events / S.reviews), בלי הפונקציות של המסך
const expected = page => page.evaluate(() => {
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const today = ymd(new Date()), from = ago(30);
  const list = (S.me.role === 'admin' ? S.students : S.students.filter(s => myClasses().indexOf(s.cls) > -1)).filter(s => !S.filter || s.cls === S.filter);
  const ids = new Set(list.map(s => s.id));
  // סימוני נוכחות: לפי שיעור (S.latt), ובימים בלי סימון שיעורים לתלמיד — הסימון היומי (S.att)
  const marks = (f, t, set = ids) => { let ok = 0, n = 0; const lessonDays = {};
    for (const d of Object.keys(S.latt)) { if (d < f || d > t) continue;
      for (const [k, v] of Object.entries(S.latt[d] || {})) { const sid = k.slice(k.indexOf(':') + 1); if (!v || !set.has(sid)) continue; lessonDays[sid + d] = 1; n++; if (v === 'present' || v === 'late') ok++; } }
    for (const d of Object.keys(S.att)) { if (d < f || d > t) continue;
      for (const [sid, v] of Object.entries(S.att[d] || {})) { if (!v || !set.has(sid) || lessonDays[sid + d]) continue; n++; if (v === 'present' || v === 'late') ok++; } }
    return { ok, n, pct: n ? Math.round(ok / n * 100) : null }; };
  const att = marks(from, today);
  const events = S.events.filter(e => ids.has(e.sid) && e.date >= from && e.date <= today).length;
  const lights = { green: 0, yellow: 0, red: 0, none: 0 };
  list.forEach(s => { const r = S.reviews.filter(x => x.studentId === s.id).sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.ts || 0) - (b.ts || 0)).pop(); lights[r && ['green', 'yellow', 'red'].includes(r.light) ? r.light : 'none']++; });
  const classes = [...new Set(list.map(s => s.cls))].filter(c => myClasses().includes(c)).map(c => ({ cls: c, ...marks(from, today, new Set(list.filter(s => s.cls === c).map(s => s.id))) }));
  // ממוצע פשוט של אחוזי התלמידים — כדי לוודא שהמסך לא משתמש בו כשהוא שונה
  const per = list.map(s => marks(from, today, new Set([s.id]))).filter(m => m.n);
  const naive = per.length ? Math.round(per.reduce((a, m) => a + m.ok / m.n * 100, 0) / per.length) : null;
  return { count: list.length, att, events, lights, classes, naive };
});

test('פילוחים: כל המדדים והגרפים מחושבים מהנתונים (חישוב בלתי תלוי), והנוכחות היא שיעור כולל של סימונים', async () => {
  const page = await open();
  const s = await shown(page), e = await expected(page);
  assert.equal(s.count, e.count);
  assert.equal(s.count, await page.evaluate(() => myStudents().length), 'מספר התלמידים לפי myStudents()');
  assert.equal(s.attOk, e.att.ok); assert.equal(s.attN, e.att.n); assert.equal(s.att, e.att.pct + '%');
  assert.ok(e.att.n > 100, 'בנתוני הדמה צריכים להיות סימוני נוכחות');
  assert.equal(s.events, e.events);
  assert.deepEqual(s.lights, e.lights);
  assert.equal(s.center, e.count);
  assert.equal(Object.values(s.lights).reduce((a, b) => a + b, 0), e.count, 'כל תלמיד נספר פעם אחת בדיוק בטבעת');
  assert.deepEqual(s.classes.map(c => c.cls), e.classes.map(c => c.cls));
  s.classes.forEach((c, i) => { assert.equal(c.n, e.classes[i].n); assert.equal(c.pct, e.classes[i].pct + '%'); assert.equal(c.w, e.classes[i].pct + '%', 'אורך העמודה לפי האחוז'); });
  // מגמה: 6 שבועות עם תאריך ומספר תצפיות, ונקודה לכל שבוע שיש בו נתונים
  assert.equal(s.weeks.length, 6); assert.ok(s.weeks.every(w => /^\d{1,2}\.\d{1,2}$/.test(w)), 'תאריך לכל שבוע');
  assert.equal(s.points, s.weekN.filter(n => n !== '—').length);
  assert.ok(s.weekN.some(n => Number(n) > 0), 'מספר סימונים לשבוע');
  assert.match(s.trend, /^[+−]?\d+(\.\d)?נק׳$/, 'יש מספיק נתונים להשוואה בנתוני הדמה');
  assert.ok(await page.$('.sa-trend[role="img"][aria-label*="סימונים"]'), 'תיאור נגיש לגרף המגמה');
  assert.ok(await page.$('.sa-ring[role="img"][aria-label*="ללא תמונת מצב"]'), 'תיאור נגיש לטבעת');
  // האזור נמצא מעל החיפוש והטבלה
  assert.ok(await page.evaluate(() => document.querySelector('.sa').compareDocumentPosition(document.getElementById('q')) & Node.DOCUMENT_POSITION_FOLLOWING));
  assert.deepEqual(page.errors, []);
  assert.ok(page.external.every(u => /^https:\/\/fonts\./.test(u)), 'פנייה החוצה: ' + page.external.join(', '));
  await page.context().close();
});

test('פילוחים: שיעור כולל ולא ממוצע של אחוזי תלמידים (תלמיד עם מעט סימונים לא מקבל משקל יתר)', async () => {
  const page = await open();
  // בתוך הדף בלבד: לתלמיד אחד נשאר סימון אחד בלבד בתקופה, והוא חיסור
  await page.evaluate(() => { const sid = S.students[0].id; Object.keys(S.latt).forEach(d => { Object.keys(S.latt[d]).forEach(k => { if (k.endsWith(':' + sid)) delete S.latt[d][k]; }); });
    const d = Object.keys(S.latt).sort().pop(); const l = Object.keys(S.latt[d])[0].split(':')[0]; S.latt[d][l + ':' + sid] = 'absent'; LIDX = null; render(); });
  const s = await shown(page), e = await expected(page);
  assert.equal(s.att, e.att.pct + '%');
  assert.notEqual(e.naive, e.att.pct, 'במקרה הזה הממוצע הפשוט שונה מהשיעור הכולל');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('פילוחים: הרשאות — מחנך רואה רק את התלמידים, הכיתות והאירועים שלו; מורה מקצועי בלי כיתה לא מגיע למסך', async () => {
  const page = await open('teacher');
  const s = await shown(page), e = await expected(page);
  const mine = await page.evaluate(() => myClasses());
  assert.deepEqual(mine, ['כיתה א׳']);
  assert.equal(s.count, e.count); assert.equal(s.count, 16, 'רק 16 התלמידים של כיתה א׳ (מתוך 80 בהדגמה)');
  assert.deepEqual(s.classes.map(c => c.cls), mine, 'רק הכיתה של המחנך בגרף');
  assert.equal(s.events, e.events);
  // תלמיד מכיתה אחרת, עם אירוע, נוכחות ותמונת מצב, שנמצא בזיכרון הדף — לא נספר באף מדד
  await page.evaluate(() => { const o = { id: 'x-other', name: 'תלמיד מכיתה אחרת', cls: 'כיתה ב׳' }; S.students.push(o);
    S.events.push({ id: 'x-ev', sid: o.id, sname: o.name, cls: o.cls, type: 'e1', typeName: 'בדיקה', kind: 'neg', sev: 1, date: iso(new Date()), time: '09:00' });
    S.reviews.push({ id: 'x-rv', studentId: o.id, date: iso(new Date()), light: 'red', scores: {} });
    const d = Object.keys(S.latt).sort().pop(); S.latt[d]['Lx:' + o.id] = 'absent'; LIDX = null; render(); });
  assert.deepEqual(await shown(page), s, 'נתונים של תלמיד שלא בהרשאה השפיעו על המדדים');
  assert.equal(s.att, e.att.pct + '%');
  assert.deepEqual(page.errors, []);
  await page.context().close();

  const math = await open('math');
  assert.notEqual(await math.evaluate(() => S.tab), 'students', 'מורה מקצועי בלי כיתה לא אמור לראות את מסך התלמידים');
  assert.equal(await math.$('.sa'), null);
  assert.deepEqual(math.errors, []);
  await math.context().close();
});

test('פילוחים: מצב ללא נתונים — "—", "אין מספיק נתונים", וכל התלמידים בקטגוריה "ללא תמונת מצב" ולא בירוק', async () => {
  const page = await open();
  await page.evaluate(() => { S.latt = {}; S.att = {}; S.events = []; S.reviews = []; LIDX = null; render(); });
  const s = await shown(page), n = await page.evaluate(() => S.students.length);
  assert.equal(s.count, n);
  assert.equal(s.att, '—'); assert.equal(s.attN, 0);
  assert.equal(s.events, 0);
  assert.equal(s.trend, 'אין מספיק נתונים'); assert.equal(s.delta, '');
  assert.deepEqual(s.lights, { green: 0, yellow: 0, red: 0, none: n });
  assert.deepEqual(s.arcs, ['none'], 'הטבעת כולה "ללא תמונת מצב"');
  assert.ok(s.classes.every(c => c.pct === '—' && c.w === '0%'));
  assert.ok(s.trendEmpty, 'גרף המגמה מציג הודעה במקום ערכים');
  // וגם בלי תלמידים בכלל
  await page.evaluate(() => { S.students = []; render(); });
  assert.equal(await page.$eval('.sa-kpi[data-sa="count"] strong', e => e.textContent), '0');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('פילוחים: "אין מספיק נתונים" להשוואה כשהנוכחות קיימת רק בתקופה האחרונה', async () => {
  const page = await open();
  await page.evaluate(() => { const cut = daysAgo(13); Object.keys(S.latt).forEach(d => { if (d < cut) delete S.latt[d]; }); S.att = {}; LIDX = null; render(); });
  const s = await shown(page);
  assert.notEqual(s.att, '—', 'נוכחות 30 יום עדיין מוצגת');
  assert.equal(s.trend, 'אין מספיק נתונים');
  assert.ok(s.weekN.filter(n => n === '—').length >= 3, 'שבועות בלי נתונים מסומנים "—"');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('פילוחים: שינוי נתונים משנה את המדדים — אירועים, חיסורים ותמונת מצב חדשה', async () => {
  const page = await open();
  const a = await shown(page);
  await page.evaluate(() => {
    const st = S.students[3];
    for (let i = 0; i < 2; i++) S.events.push({ id: 'n' + i, sid: st.id, sname: st.name, cls: st.cls, type: 'e1', typeName: 'בדיקה', kind: 'neg', sev: 1, date: iso(new Date()), time: '10:00' });
    S.events.push({ id: 'old', sid: st.id, sname: st.name, cls: st.cls, type: 'e1', typeName: 'בדיקה', kind: 'neg', sev: 1, date: daysAgo(45), time: '10:00' });
    const d = Object.keys(S.latt).filter(x => x <= iso(new Date())).sort().pop();
    Object.keys(S.latt[d]).forEach(k => { S.latt[d][k] = 'absent'; });
    const r = lastReview(st.id), nl = r.light === 'red' ? 'green' : 'red';
    S.reviews.push({ id: 'rvnew', studentId: st.id, date: iso(new Date()), ts: Date.now(), light: nl, scores: {} });
    const gone = S.students[4].id; S.reviews = S.reviews.filter(x => x.studentId !== gone);
    LIDX = null; render(); window.__nl = nl; window.__ol = r.light; window.__gl = (lastReview(gone) || {}).light;
  });
  const b = await shown(page), e = await expected(page);
  assert.equal(b.events, a.events + 2, 'רק שני האירועים מ-30 הימים נספרו');
  assert.ok(b.attOk < a.attOk, 'החיסורים לא הורידו את מספר הנוכחים');
  assert.equal(b.att, e.att.pct + '%');
  assert.deepEqual(b.lights, e.lights);
  assert.equal(b.lights.none, a.lights.none + 1, 'תלמיד בלי תמונת מצב נוסף לקטגוריה הנפרדת');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('פילוחים: סינון כיתה משנה את המדדים; החיפוש מסנן את הטבלה בלבד', async () => {
  const page = await open();
  const all = await shown(page);
  await page.fill('#q', 'כהן');
  await page.waitForTimeout(150);
  const q = await shown(page);
  assert.deepEqual({ ...q }, { ...all }, 'החיפוש שינה את המדדים');
  assert.ok(await page.$eval('.sa-sh span', e => /החיפוש מסנן את הרשימה בלבד/.test(e.textContent)), 'הסבר שהחיפוש לא משפיע על המדדים');
  assert.ok((await page.$$('.scroll tbody tr')).length < all.count, 'החיפוש לא סינן את הטבלה');
  await page.fill('#q', '');
  await page.selectOption('select[data-ch="filter"]', 'כיתה ב׳');
  await page.waitForTimeout(150);
  const f = await shown(page), e = await expected(page);
  assert.equal(f.count, e.count); assert.ok(f.count < all.count);
  assert.deepEqual(f.classes.map(c => c.cls), ['כיתה ב׳']);
  assert.equal(f.att, e.att.pct + '%'); assert.equal(f.events, e.events); assert.deepEqual(f.lights, e.lights);
  assert.match(await page.$eval('.sa-kpi[data-sa="count"] small', e => e.textContent), /מתוך \d+/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

for (const theme of ['light', 'dark']) {
  test('פילוחים בנייד (' + theme + '): שום גרף או כרטיס לא גולש מהמסך, ואין גלילה אופקית של העמוד', async () => {
    const page = await open('admin', { width: 360, height: 780 }, theme);
    const r = await page.evaluate(() => {
      const bad = [...document.querySelectorAll('.sa, .sa *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > innerWidth + .5 || b.left < -.5); }).map(e => e.getAttribute('class'));
      const svg = document.querySelector('.sa-trend').getBoundingClientRect();
      return { bad, pageH: document.documentElement.scrollWidth > innerWidth, svgW: svg.width, theme: document.documentElement.getAttribute('data-theme') };
    });
    assert.equal(r.theme, theme);
    assert.deepEqual(r.bad, []); assert.equal(r.pageH, false); assert.ok(r.svgW > 250, 'גרף המגמה מכווץ מדי');
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}
