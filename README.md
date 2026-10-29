# وقاية (Wekaya) v2.0 — MASLD companion PWA

أداة تثقيفية للتوعية بالكبد الدهني الأيضي (MASLD). **ليست أداة تشخيص.**
Educational MASLD companion. **Not a diagnostic tool.**

## تشغيل / Run
- يحتاج HTTPS أو `localhost` لتشغيل الـ Service Worker: `python3 -m http.server 8000` ثم افتح `http://localhost:8000`.
- Serve over HTTPS (GitHub Pages / Netlify) so the app is installable and works offline.

## الاختبارات / Tests
- `node --test calculations.test.js` → 14 unit tests (FIB-4, tier logic, eGFR, calories, alcohol, dates, red flags).

## الهيكل / Structure
| ملف | الدور |
|---|---|
| `index.html` | الواجهة (CSP صارم، بدون inline handlers) |
| `app.js` | المنطق والحالة (مفتاح تخزين واحد `wekaya_v2`) |
| `calculations.js` | خوارزميات سريرية نقية (قابلة للاختبار) |
| `data.js` | المحتوى: الأطعمة، النصائح، المراجع، FAQ، الترجمة (بدون بيانات مريض وهمية) |
| `sw.js` | network-first مع تخزين مسبق كامل (يعمل offline) |
| `fonts/`, `icons/` | خط Tajawal محلي وأيقونات PWA |

## قبل النشر / Before publishing
راجع المراجع (DOI) وقيم الأطعمة مع مختص تغذية، واعرض الصياغات الطبية على طبيب كبد.
