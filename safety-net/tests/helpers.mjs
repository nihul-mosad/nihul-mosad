// עזרים משותפים לבדיקות: שרת סטטי מקומי, דפדפן, זריעת מוסד בדיקה וכניסה.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildSeed, USERS, INST } from '../seed.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(here, '..', 'out');
export { USERS, INST };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
export function startServer() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(OUT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
      if (!p.startsWith(OUT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

export async function launch() { return chromium.launch(); }

// דף חדש: חוסם כל פנייה החוצה (גוגל פונטים, CDN), זורע את המוסד ושומר שגיאות JavaScript
export async function newPage(browser, { seed = true, width = 1280, height = 900, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.errors = [];
  page.external = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { page.external.push(r.request().url()); r.abort(); });
  if (seed) {
    const data = buildSeed();
    await page.addInitScript(d => { if (!sessionStorage.getItem('__fakefs__')) sessionStorage.setItem('__fakefs__', JSON.stringify(Object.assign({ seq: 1000, writes: 0 }, d))); }, data);
  }
  return page;
}

export async function login(page, base, who) {
  const u = USERS[who];
  await page.goto(base + 'staging-local.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#li', { state: 'visible' });
  await page.fill('#li', INST); await page.fill('#lu', u.user); await page.fill('#lp', u.password);
  await page.click('#loginBtn');
  await page.waitForFunction(() => document.getElementById('shell').classList.contains('on') && typeof S !== 'undefined' && S.me, null, { timeout: 15000 });
}

// הנתונים כפי שהם שמורים ב"שרת" המדומה
export const serverDoc = (page, p) => page.evaluate(p => window.__fakefs.getDoc(p), p);
export const serverDump = page => page.evaluate(() => window.__fakefs.dump());
// מחכה שכל הכתיבות בתור של המערכת יסתיימו
export const settle = page => page.evaluate(async () => { await Promise.all(Object.values(WQ)); await new Promise(r => setTimeout(r, 50)); await Promise.all(Object.values(WQ)); });
