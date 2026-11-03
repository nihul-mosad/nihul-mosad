/* demo-controller.js — הדגמת AURA 3.1: כניסה אוטומטית למשתמש דמה, החלפת תפקיד ומצב תצוגה.
   כל המשתמשים והנתונים מומצאים (demo-seed-rich.js). אין כאן שום חיבור לרשת. */
(function () {
  'use strict';
  var ROLES = { admin: 'מנהל', teacher: 'מחנך כיתה א׳', math: 'מורה מקצועי' };
  function get(k) { var v = null; try { v = sessionStorage.getItem(k); } catch (e) {} if (v == null) try { v = localStorage.getItem(k); } catch (e) {} return v; }
  function put(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} try { localStorage.setItem(k, v); } catch (e) {} }
  var role = ROLES[get('aura-demo-role')] ? get('aura-demo-role') : 'admin';
  var tried = 0, t = setInterval(function () {
    var lg = document.getElementById('login'), sh = document.getElementById('shell');
    if (sh && sh.classList.contains('on')) { clearInterval(t); return; }
    if (++tried > 60) { clearInterval(t); return; }
    if (!lg || getComputedStyle(lg).display === 'none' || !document.getElementById('li')) return;
    var u = window.__DEMO_USERS[role];
    document.getElementById('li').value = window.__DEMO_INST; document.getElementById('lu').value = u.user; document.getElementById('lp').value = u.password;
    clearInterval(t); document.getElementById('loginBtn').click();
  }, 200);

  var bar = document.createElement('div');
  bar.id = 'auraDemoBar';
  bar.innerHTML = '<span class="adb-dot"></span><b>הדגמה</b><span class="adb-txt">נתונים מומצאים · מנותק מהשרת</span>' +
    '<select aria-label="תפקיד">' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (k === role ? ' selected' : '') + '>' + ROLES[k] + '</option>'; }).join('') + '</select>' +
    '<button type="button" aria-label="מצב בהיר / כהה">◐</button>';
  var st = document.createElement('style');
  st.textContent = '#auraDemoBar{position:fixed;bottom:14px;left:14px;z-index:99999;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-radius:999px;' +
    'background:rgba(14,22,65,.88);color:#fff;font:500 12.5px "Noto Sans Hebrew",system-ui;box-shadow:0 10px 28px -10px rgba(0,0,0,.5);backdrop-filter:blur(10px)}' +
    '#auraDemoBar .adb-dot{width:8px;height:8px;border-radius:50%;background:#FCD679;box-shadow:0 0 0 3px rgba(252,214,121,.25)}' +
    '#auraDemoBar select,#auraDemoBar button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:3px 10px;font:inherit;cursor:pointer}' +
    '#auraDemoBar option{color:#121A3A}' +
    '@media(max-width:820px){#auraDemoBar{bottom:auto;top:12px;left:10px;padding:4px 6px 4px 10px;gap:6px}#auraDemoBar .adb-txt{display:none}#auraDemoBar select{max-width:96px}}';
  document.head.appendChild(st);
  document.body.appendChild(bar);
  bar.querySelector('select').addEventListener('change', function (e) { put('aura-demo-role', e.target.value); if (typeof logout === 'function' && typeof S !== 'undefined' && S.me) logout(); else location.reload(); });
  bar.querySelector('button').addEventListener('click', function () {
    var d = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (typeof setTheme === 'function') setTheme(d); else document.documentElement.setAttribute('data-theme', d);
    if (typeof render === 'function' && typeof S !== 'undefined' && S.me) render();
  });
})();
