# design/

`aura-demo.html` — עותק בנוי של הדגמת AURA 3.1, לצפייה בלבד. פותחים אותו בדפדפן (קובץ מקומי), בלי שרת ובלי התקנה.

* נוצר אוטומטית מ-`index.html` על ידי `safety-net/build-staging.mjs` (`npm run build`). **לא עורכים אותו ידנית**.
* נתונים מומצאים בלבד, מאגר מדומה בזיכרון, מדיניות אבטחה (CSP) שחוסמת כל חיבור רשת. אין קשר ל-Firebase.
* התיקייה הזו לא מתפרסמת לאתר: `deploy.yml` מעתיק רק את `index.html`, `sw.js`, `manifest.webmanifest`, `robots.txt` ו-`icons/`.
