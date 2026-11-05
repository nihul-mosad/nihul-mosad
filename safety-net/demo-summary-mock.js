// הדגמה בלבד: "שרת" מדומה לסיכום תלמיד להורים. אין כאן AI ואין רשת —
// הטקסט נבנה מתבנית קבועה לפי חבילת הנתונים, כדי שאפשר יהיה לראות את כל התהליך (חלון, עריכה, PDF, שמירה).
// הבקשה האחרונה נשמרת ב-window.__lastSummaryReq, כדי שהבדיקות יוכלו לוודא מה "נשלח".
(function () {
  window.__FAKE_FN = window.__FAKE_FN || {};
  window.__FAKE_FN.studentSummary = async function (req) {
    window.__lastSummaryReq = JSON.parse(JSON.stringify(req || {}));
    await new Promise(r => setTimeout(r, window.__SUM_DELAY == null ? 900 : window.__SUM_DELAY));
    if (window.__SUM_FAIL) { const e = new Error(window.__SUM_FAIL); e.code = 'functions/resource-exhausted'; throw e; }
    const p = (req && req.packet) || {}, a = (p.attendance && p.attendance.last30) || {}, ev = p.events || [];
    const pos = ev.filter(e => e.kind === 'pos'), neg = ev.filter(e => e.kind !== 'pos');
    const last = (p.snapshots || [])[(p.snapshots || []).length - 1] || null;
    const sc = last ? Object.entries(last.scores || {}).sort((x, y) => y[1] - x[1]) : [];
    const N = '{{שם}}';
    const text = [
      '[טקסט הדגמה — נוצר מתבנית קבועה, בלי AI]',
      'הורים יקרים, שלום רב. אנו שמחים לשתף אתכם בתמונת המצב של ' + N + ' ב' + (p.cls || 'כיתה') + ' בתקופה האחרונה.',
      '## נוכחות',
      a.pct == null ? 'בתקופה האחרונה עוד לא נרשמו מספיק נתוני נוכחות.' : N + ' נכח ב-' + a.pct + '% מהשיעורים בחודש האחרון' + (a.late ? ', עם ' + a.late + ' איחורים' : '') + '.',
      '## התנהגות ותפקוד בכיתה',
      ev.length ? 'בשלושת החודשים האחרונים נרשמו ' + pos.length + ' אירועים לשבח ו-' + neg.length + ' אירועים לשיפור.' : 'לא נרשמו אירועים מיוחדים בתקופה האחרונה.',
      '## חוזקות',
      sc.length ? 'בתמונת המצב האחרונה בולט במיוחד התחום "' + sc[0][0] + '".' : 'נשמח להכיר את ' + N + ' עוד יותר בהמשך השנה.',
      '## נקודות לחיזוק',
      sc.length > 1 ? 'כדאי לחזק את התחום "' + sc[sc.length - 1][0] + '", בעידוד ובשיחה חיובית.' : 'נמשיך לעקוב ולעדכן.',
      '## המלצות לשיתוף פעולה עם הבית',
      'נשמח לשיחה קצרה ולתיאום ציפיות, כדי שנוכל יחד להמשיך את הצמיחה של ' + N + '.'
    ].join('\n');
    return { text, usage: { in: 0, out: 0 }, model: 'הדגמה (בלי AI)' };
  };
})();
