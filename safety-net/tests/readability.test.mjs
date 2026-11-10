// קריאות טקסט בצבעי מצב (צהוב / ירוק / אדום) בשכבת העיצוב, במצב בהיר ובמצב כהה.
// באג שנמצא: צבעי המצב של העיצוב בהירים מדי כשהם משמשים כצבע טקסט על רקע בהיר (ניגודיות 1.8).
// הבדיקה מחשבת ניגודיות אמיתית בין צבע הטקסט לרקע שמאחוריו, בכל המסכים שבהם יש טקסט כזה.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newPage, login } from './helpers.mjs';

let server, browser;
before(async () => { server = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); server.srv.close(); });

const fill = () => {
  const ids = S.students.map(s => s.id); let k = 0;
  for (let i = 1; i <= 20; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (d.getDay() > 4) continue; const ds = iso(d); S.latt[ds] = S.latt[ds] || {};
    ids.forEach(id => { for (let p = 1; p <= 3; p++) { k++; S.latt[ds]['L0' + p + ':' + id] = (k % 23 === 0 ? 'absent' : k % 17 === 0 ? 'late' : 'present'); } }); }
  ids.slice(0, 6).forEach((id, j) => { const s = studentById(id); S.events.push({ id: 'ev' + j, sid: id, sname: s.name, cls: s.cls, type: 'e1', typeName: 'הפרעה בשיעור', kind: j % 2 ? 'neg' : 'pos', sev: 1, date: daysAgo(j), time: '10:00', note: '' }); });
  ids.slice(0, 4).forEach((id, j) => S.reviews.push({ id: 'rv' + j, studentId: id, date: daysAgo(3 + j), light: ['green', 'yellow', 'red'][j % 3], scores: { d1: 3 }, note: '' }));
  LIDX = null;
};
// ניגודיות של כל טקסט שצבעו נקבע ישירות לצבע מצב
const lowContrast = () => {
  const lum = c => { const m = (c.match(/[\d.]+/g) || []).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return { L: .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]), a: m.length > 3 ? m[3] : 1 }; };
  const bg = el => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; const b = lum(cs.backgroundColor); if (b.a > .85) return b; } return lum(getComputedStyle(document.body).backgroundColor); };
  const out = [];
  document.querySelectorAll('#main [style*="color:var(--late)"], #main [style*="color:var(--yellow)"], #main [style*="color:var(--present)"], #main [style*="color:var(--green)"], #main [style*="color:var(--absent)"], #main [style*="color:var(--red)"]').forEach(e => {
    const st = e.getAttribute('style'); if (!/(^|;)\s*color:var\(--/.test(st)) return;
    const r = e.getBoundingClientRect(); if (!r.width || !e.textContent.trim()) return;
    const f = lum(getComputedStyle(e).color), b = bg(e); if (!b) return;
    const ratio = (Math.max(f.L, b.L) + .05) / (Math.min(f.L, b.L) + .05);
    if (ratio < 4.5) out.push(e.textContent.trim().slice(0, 20) + ' ' + ratio.toFixed(2));
  });
  return out;
};

for (const scheme of ['light', 'dark']) {
  test('קריאות (' + scheme + '): טקסט בצבעי מצב בניגודיות של 4.5 לפחות בכל המסכים', async () => {
    const page = await newPage(browser, { width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, server.url, 'admin');
    await page.evaluate(fill);
    const tabs = await page.evaluate(() => tabsFor().map(t => t[0]));
    const bad = [];
    let checked = 0;
    for (const t of tabs.concat(['card'])) {
      const r = await page.evaluate(([t, fnSrc]) => {
        if (t === 'card') { S.tab = 'card'; S.cardId = myStudents()[0].id; render(); const d = document.querySelector('details.s3-more'); if (d) d.open = true; }
        else { S.tab = t; render(); }
        const n = document.querySelectorAll('#main [style*="color:var(--"]').length;
        return { n, low: (0, eval)('(' + fnSrc + ')')() };
      }, [t, lowContrast.toString()]);
      checked += r.n;
      r.low.forEach(x => bad.push(t + ': ' + x));
    }
    assert.ok(checked > 0, 'לא נמצא טקסט בצבעי מצב לבדיקה');
    assert.deepEqual(bad, [], 'טקסט לא קריא: ' + bad.join(' | '));
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}
