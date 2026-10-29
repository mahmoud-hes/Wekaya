// ==========================================================================
// Wekaya (وقاية) v2 - Application logic.
// Single state object in localStorage ('wekaya_v2'), no demo data, no inline
// handlers (CSP-friendly), all user text escaped before innerHTML.
// ==========================================================================
(function () {
    'use strict';
    const D = window.WekayaData, C = window.WekayaCalculations;
    const KEY = 'wekaya_v2';
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (v, min, max) => { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) && n >= min && n <= max ? n : null; };
    const ltr = s => '\u2066' + s + '\u2069'; // keep numbers/units in order inside RTL text
    const nf = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
    const today = () => C.todayLocal();
    const safe = fn => { try { fn(); } catch (e) { console.error(fn.name || 'render', e); } };

    // ---------------------------------------------------------------- state
    const blank = () => ({ v: 2, profile: null, labs: [], weights: [], meals: { date: '', items: [] }, customFoods: [], activity: { date: '', done: false }, tipIndex: 0, lang: 'ar', ramadanManual: false, consentAt: null });

    function sanitize(o) {
        const b = blank();
        if (!o || typeof o !== 'object') return b;
        const p = o.profile;
        if (p && typeof p === 'object' && C.parseLocalDate(p.birthDate) && num(p.height, 100, 250) && num(p.weight, 25, 400)) {
            b.profile = {
                name: String(p.name || '').slice(0, 40), gender: p.gender === 'female' ? 'female' : 'male', birthDate: p.birthDate,
                height: num(p.height, 100, 250), weight: num(p.weight, 25, 400),
                activityLevel: ['sedentary', 'light', 'moderate', 'active'].includes(p.activityLevel) ? p.activityLevel : 'light',
                hasDiabetes: !!p.hasDiabetes, diabetesMeds: !!p.diabetesMeds, pregnant: !!p.pregnant,
                waistCm: num(p.waistCm, 40, 200), alcoholPerWeek: num(p.alcoholPerWeek, 0, 200) || 0,
                hcvHbv: ['unknown', 'negative', 'treated', 'active'].includes(p.hcvHbv) ? p.hcvHbv : 'unknown'
            };
        }
        if (Array.isArray(o.labs)) b.labs = o.labs.map(l => {
            if (!l || !C.parseLocalDate(l.date)) return null;
            const ast = num(l.ast, 1, 5000), alt = num(l.alt, 1, 5000), plt = num(l.plt, 1, 1500), age = num(l.ageAtTest, 18, 120);
            if (!ast || !alt || !plt || !age) return null;
            const cr = num(l.cr, 0.1, 20), bili = num(l.bili, 0.1, 60), inr = num(l.inr, 0.5, 12);
            return { id: String(l.id || 'l' + l.date), date: l.date, ast, alt, plt, cr, bili, inr, ageAtTest: age, fib4: C.calculateFIB4(age, ast, plt, alt), meld: C.calculateMELD(cr, bili, inr) };
        }).filter(Boolean);
        if (Array.isArray(o.weights)) b.weights = o.weights.map(w => (w && C.parseLocalDate(w.date) && num(w.weight, 25, 400)) ? { date: w.date, weight: num(w.weight, 25, 400) } : null).filter(Boolean);
        if (o.meals && Array.isArray(o.meals.items)) b.meals = { date: String(o.meals.date || ''), items: o.meals.items.filter(m => m && isFinite(m.cal)).map(m => ({ ts: Number(m.ts) || Date.now(), name: String(m.name || '').slice(0, 60), nameEn: String(m.nameEn || m.name || '').slice(0, 60), cal: Number(m.cal), p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0 })) };
        if (Array.isArray(o.customFoods)) b.customFoods = o.customFoods.filter(f => f && f.id && isFinite(f.cal)).map(f => ({ id: String(f.id), ar: String(f.ar || '').slice(0, 50), en: String(f.en || f.ar || '').slice(0, 50), portAr: String(f.portAr || '').slice(0, 40), portEn: String(f.portEn || f.portAr || '').slice(0, 40), cat: 'custom', liver: 'unrated', cal: Number(f.cal), p: Number(f.p) || 0, c: Number(f.c) || 0, f: Number(f.f) || 0, fibre: 0, tagAr: '', tagEn: '', custom: true }));
        if (o.activity && typeof o.activity === 'object') b.activity = { date: String(o.activity.date || ''), done: !!o.activity.done };
        b.tipIndex = Math.max(0, parseInt(o.tipIndex, 10) || 0);
        b.lang = o.lang === 'en' ? 'en' : 'ar';
        b.ramadanManual = !!o.ramadanManual;
        b.consentAt = typeof o.consentAt === 'string' ? o.consentAt : null;
        return b;
    }
    function loadState() { try { const raw = localStorage.getItem(KEY); return raw ? sanitize(JSON.parse(raw)) : blank(); } catch (e) { return blank(); } }
    let S = loadState();
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('⚠️ ' + (S.lang === 'en' ? 'Could not save (storage full or blocked)' : 'تعذر الحفظ (التخزين ممتلئ أو محظور)')); } }

    let lang = S.lang, foodFilter = 'all', foodQuery = '', obStep = 1, lastFocus = null, openId = null;
    const t = k => (D.i18n[lang] && D.i18n[lang][k]) || D.i18n.ar[k] || k;
    const L = (ar, en) => (lang === 'en' ? en : ar);

    function ensureToday() {
        const d = today(); let ch = false;
        if (S.meals.date !== d) { S.meals = { date: d, items: [] }; ch = true; }
        if (S.activity.date !== d) { S.activity = { date: d, done: false }; ch = true; }
        if (ch) save();
    }

    // ------------------------------------------------------------ derived
    const sortedLabs = () => S.labs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const sortedWeights = () => S.weights.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const latestLab = () => sortedLabs()[0] || null;
    const curWeight = () => { const w = sortedWeights(); return w.length ? w[w.length - 1].weight : (S.profile ? S.profile.weight : null); };
    const profAge = () => (S.profile ? C.ageAt(S.profile.birthDate, today()) : null);
    const bmiNow = () => (S.profile ? C.calculateBMI(curWeight(), S.profile.height) : null);
    function egfrNow() { const l = sortedLabs().find(x => x.cr); return l && S.profile ? C.calculateEGFR(l.cr, C.ageAt(S.profile.birthDate, today()), S.profile.gender) : null; }
    function planNow() {
        const p = S.profile; if (!p) return null;
        return C.calculateCaloricNeeds({ weight: curWeight(), height: p.height, age: profAge(), gender: p.gender, activityLevel: p.activityLevel, pregnantOrBreastfeeding: p.pregnant, diabetesMeds: p.diabetesMeds, egfr: egfrNow() });
    }
    function interpFor(lab, isLatest) {
        const p = S.profile || {};
        return C.interpretLiverHealth({ fib4: lab ? lab.fib4 : null, meld: lab ? lab.meld : null, age: lab ? lab.ageAtTest : (profAge() || 45), testDateStr: lab ? lab.date : null, hasDiabetes: !!p.hasDiabetes, hcvHbv: p.hcvHbv || 'unknown', todayStr: today() });
    }
    function hijriMonth() { try { return parseInt(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric' }).format(new Date()), 10); } catch (e) { return null; } }
    const isRamadan = () => S.ramadanManual || hijriMonth() === 9;
    const allFoods = () => D.foods.concat(S.customFoods);
    const foodName = f => (lang === 'en' ? f.en : f.ar);

    // ---------------------------------------------------------------- ui
    let toastTimer;
    function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }

    function applyI18n() {
        const h = document.documentElement; h.lang = lang; h.dir = lang === 'en' ? 'ltr' : 'rtl';
        document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
        document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
        document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
        $('btnLang').textContent = lang === 'en' ? 'ع' : 'EN';
        $('btnLang').setAttribute('aria-label', lang === 'en' ? 'ع العربية' : 'EN English');
        document.title = lang === 'en' ? 'Wekaya - MASLD companion' : 'وقاية - Wekaya';
    }

    function renderHeader() {
        const p = S.profile;
        $('pillName').textContent = p && p.name ? p.name : '';
        $('avatarInitial').textContent = p && p.name ? [...p.name][0] : (lang === 'en' ? '?' : '؟');
    }

    function renderDashboard() {
        const p = S.profile;
        $('dashEmpty').hidden = !!p; $('dashMain').hidden = !p;
        if (!p) return;
        const bmi = bmiNow(), plan = planNow(), w = curWeight();
        $('patientGreeting').textContent = `${t('greet')}${p.name ? ' ' + p.name : ''}`;
        $('patientDate').textContent = C.formatDate(new Date(), lang);
        $('vitalWeight').textContent = nf(w, 1);
        $('vitalBmi').textContent = bmi ? bmi.bmi : '—';
        const wg = C.weightGoal(bmi, sortedWeights()[0] ? sortedWeights()[0].weight : w);
        $('vitalGoal').textContent = wg && wg.applicable ? ltr(`-${wg.steps[1].kg} kg`) : t('goal_none');
        if (bmi) { const b = $('bmiBadge'); b.textContent = `BMI ${bmi.bmi} · ${L(bmi.categoryAr, bmi.categoryEn)}`; b.style.background = bmi.color; b.style.color = '#fff'; $('bmiText').textContent = L(bmi.riskAr, bmi.riskEn); }

        const lab = latestLab(), r = interpFor(lab, true);
        $('liverHero').className = 'card liver-status-hero tier-' + (r.tier === 'unknown' ? 'unknown' : r.tier);
        $('heroBadge').textContent = L(r.statusBadgeAr, r.statusBadgeEn);
        $('heroTitle').textContent = L(r.titleAr, r.titleEn);
        $('heroDesc').textContent = L(r.summaryAr, r.summaryEn);
        const notes = (r.notes || []).slice();
        const alc = C.alcoholCategory(p.gender, p.alcoholPerWeek);
        if (alc && alc.key !== 'masld_range') notes.push({ ar: alc.messageAr, en: alc.messageEn });
        if (p.hcvHbv === 'unknown') notes.push({ ar: 'حالة فيروسات الكبد (B/C) غير معروفة؛ اسأل طبيبك عن فحصها.', en: 'Hepatitis B/C status is unknown; ask your doctor about testing.' });
        $('heroNotes').innerHTML = notes.map(n => `<li>${esc(L(n.ar, n.en))}</li>`).join('');
        $('nextDate').textContent = lang === 'en' ? r.nextLabDateFormattedEn : r.nextLabDateFormatted;
        $('nextLabel').textContent = L(r.nextLabLabelAr, r.nextLabLabelEn);
        $('heroOverdue').hidden = !r.overdue;
        $('panelList').innerHTML = (lang === 'en' ? r.panelListEn : r.panelListAr).map(x => `<li>${esc(x)}</li>`).join('');
        $('doctorAction').textContent = L(r.doctorActionAr, r.doctorActionEn);

        renderRamadan(); renderCalories(plan); renderActivity(bmi); renderTip();
    }

    function renderRamadan() {
        const el = $('ramadanCard'), R = D.ramadan;
        el.hidden = !isRamadan();
        if (el.hidden) return;
        el.innerHTML = `<h4>🌙 ${esc(L(R.titleAr, R.titleEn))}</h4><p>${esc(L(R.introAr, R.introEn))}</p><p><strong>${esc(L(R.warnAr, R.warnEn))}</strong></p><ul>${(lang === 'en' ? R.tipsEn : R.tipsAr).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    }

    function renderCalories(plan) {
        const notes = $('planNotes');
        const eaten = S.meals.items.reduce((s, m) => s + m.cal, 0);
        $('calConsumed').textContent = nf(eaten);
        if (!plan || plan.blocked) {
            $('calTarget').textContent = '—'; $('calBurned').textContent = '0'; $('calRemaining').textContent = '—'; $('calRemLabel').textContent = '';
            $('ringProgress').style.strokeDashoffset = 326.7;
            ['macroP', 'macroC', 'macroF'].forEach(i => { $(i).textContent = '0'; });
            notes.innerHTML = plan ? plan.notes.map(n => `<li>${esc(L(n.ar, n.en))}</li>`).join('') : '';
            return;
        }
        const ac = C.generateActivityRecommendation(S.profile.activityLevel, curWeight(), bmiNow().bmi);
        const burn = S.activity.done ? Math.round(ac.caloriesBurnEstimate * 0.5) : 0; // half of the estimate: trackers overestimate
        const budget = plan.targetCalories + burn, left = budget - eaten;
        $('calTarget').textContent = nf(plan.targetCalories); $('calBurned').textContent = nf(burn);
        $('calRemaining').textContent = nf(Math.abs(left)); $('calRemLabel').textContent = left >= 0 ? t('cal_left') : t('cal_over');
        $('ringProgress').style.strokeDashoffset = (326.7 * (1 - Math.min(1, eaten / budget))).toFixed(1);
        $('macroP').textContent = plan.macros.protein; $('macroC').textContent = plan.macros.carbs; $('macroF').textContent = plan.macros.fats;
        const ns = plan.notes.slice(); if (plan.goal === 'maintain' && !ns.length) ns.push({ ar: t('cal_maint'), en: t('cal_maint') });
        notes.innerHTML = ns.map(n => `<li>${esc(L(n.ar, n.en))}</li>`).join('');
    }

    function renderActivity(bmi) {
        const a = C.generateActivityRecommendation(S.profile.activityLevel, curWeight(), bmi ? bmi.bmi : 28);
        $('actTime').textContent = a.targetDurationMinutes;
        $('actTitle').textContent = L(a.titleAr, a.titleEn);
        $('actDesc').textContent = L(a.descriptionAr, a.descriptionEn);
        $('actSafety').textContent = L(a.safetyAr, a.safetyEn);
        const b = $('btnToggleActivity'); b.textContent = S.activity.done ? t('act_done') : t('act_todo');
        b.classList.toggle('completed', S.activity.done); b.setAttribute('aria-pressed', String(S.activity.done));
    }

    function renderTip() {
        const tip = D.tips[S.tipIndex % D.tips.length];
        $('tipTag').textContent = L(tip.catAr, tip.catEn); $('tipTitle').textContent = L(tip.titleAr, tip.titleEn);
        $('tipBody').textContent = L(tip.bodyAr, tip.bodyEn); $('tipSource').textContent = L(tip.refAr, tip.refEn);
    }

    function renderFood() {
        const cats = ['all'].concat(D.categories);
        $('foodFilters').innerHTML = cats.map(c => `<button class="filter-pill${foodFilter === c ? ' active' : ''}" data-action="filter-food" data-cat="${c}" aria-pressed="${foodFilter === c}">${esc(c === 'all' ? t('food_all') : t('cat_' + c))}</button>`).join('');
        const q = foodQuery.trim().toLowerCase();
        const list = allFoods().filter(f => (foodFilter === 'all' || f.cat === foodFilter) && (!q || (f.ar + ' ' + f.en).toLowerCase().includes(q)));
        $('foodList').innerHTML = list.map(f => {
            const tag = f.custom ? t('food_custom_tag') : L(f.tagAr, f.tagEn);
            const del = f.custom ? `<button class="btn-remove-logged" data-action="delete-food" data-id="${esc(f.id)}" aria-label="${esc(t('lab_delete'))}">🗑</button>` : '';
            return `<div class="food-item-card"><div class="food-info"><div class="food-name">${esc(foodName(f))}</div><div class="food-portion">${esc(L(f.portAr, f.portEn))} · P${nf(f.p, 1)} C${nf(f.c, 1)} F${nf(f.f, 1)}</div><span class="food-liver-badge badge-${esc(f.liver)}">${esc(t('lv_' + f.liver))}${tag ? ' · ' + esc(tag) : ''}</span></div><div class="food-actions"><div class="food-cals">${nf(f.cal)}<small> kcal</small></div>${del}<button class="btn-add-food-log" data-action="add-food" data-id="${esc(f.id)}" aria-label="${esc(t('food_add') + ' ' + foodName(f))}">+</button></div></div>`;
        }).join('') || `<p class="form-hint">—</p>`;
        const items = S.meals.items;
        $('loggedTotal').textContent = items.length ? nf(items.reduce((s, m) => s + m.cal, 0)) + ' kcal' : '';
        $('loggedList').innerHTML = items.length ? items.map(m => `<div class="logged-item-row"><span class="logged-item-name">${esc(lang === 'en' ? m.nameEn : m.name)} · ${nf(m.cal)} kcal</span><button class="btn-remove-logged" data-action="remove-meal" data-ts="${m.ts}" aria-label="${esc(t('lab_delete'))}">✕</button></div>`).join('') : `<p class="form-hint">${esc(t('food_empty'))}</p>`;
    }

    function renderLabs() {
        if (!$('labDate').value) $('labDate').value = today();
        $('labDate').max = today();
        const labs = sortedLabs();
        $('labHistory').innerHTML = labs.length ? labs.map((l, i) => {
            const r = interpFor(l, false), prev = labs[i + 1], delta = prev ? (l.fib4 - prev.fib4) : null;
            const dtxt = delta == null ? '' : ` · Δ ${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
            return `<div class="logged-item-row" style="flex-wrap:wrap"><span class="logged-item-name">${esc(l.date)} · FIB-4 <strong>${l.fib4}</strong>${dtxt}<br><small>AST ${l.ast} · ALT ${l.alt} · PLT ${l.plt}${l.meld != null ? ' · MELD ' + l.meld : ''} · ${esc(L('العمر', 'age'))} ${l.ageAtTest}</small></span><span class="food-liver-badge ${r.tier === 'low' ? 'badge-good' : r.tier === 'moderate' ? 'badge-moderate' : 'badge-avoid'}">${esc(L(r.statusBadgeAr, r.statusBadgeEn))}</span><button class="btn-remove-logged" data-action="delete-lab" data-id="${esc(l.id)}" aria-label="${esc(t('lab_delete'))}">🗑</button></div>`;
        }).join('') : `<p class="form-hint">${esc(t('lab_empty'))}</p>`;
    }

    const shortDate = d => { const x = C.parseLocalDate(d); return x ? `${x.getDate()}/${x.getMonth() + 1}` : d; };
    function drawChart(pts) {
        const W = 320, H = 190, pl = 38, pr = 10, pt = 14, pb = 28;
        const ws = pts.map(p => p.weight); let mn = Math.min(...ws), mx = Math.max(...ws);
        if (mx - mn < 2) { mn -= 1; mx += 1; } else { mn -= 0.5; mx += 0.5; }
        const X = i => pl + (pts.length === 1 ? 0 : i * (W - pl - pr) / (pts.length - 1)), Y = v => pt + (mx - v) * (H - pt - pb) / (mx - mn);
        const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.weight).toFixed(1)}`).join(' ');
        const ma = pts.map((p, i) => { const s = pts.slice(Math.max(0, i - 6), i + 1); return `${X(i).toFixed(1)},${Y(s.reduce((a, b) => a + b.weight, 0) / s.length).toFixed(1)}`; }).join(' ');
        const dots = pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.weight).toFixed(1)}" r="3.5" fill="#204C3F"/>`).join('');
        return `<svg class="svg-chart" viewBox="0 0 ${W} ${H}" aria-hidden="true"><line x1="${pl}" y1="${pt}" x2="${pl}" y2="${H - pb}" stroke="#B4CFC5"/><line x1="${pl}" y1="${H - pb}" x2="${W - pr}" y2="${H - pb}" stroke="#B4CFC5"/><text x="${pl - 4}" y="${pt + 4}" text-anchor="end">${mx.toFixed(1)}</text><text x="${pl - 4}" y="${H - pb}" text-anchor="end">${mn.toFixed(1)}</text><text x="${pl}" y="${H - 8}" text-anchor="start">${esc(shortDate(pts[0].date))}</text><text x="${W - pr}" y="${H - 8}" text-anchor="end">${esc(shortDate(pts[pts.length - 1].date))}</text><polyline points="${line}" fill="none" stroke="#204C3F" stroke-width="2.2" stroke-linejoin="round"/>${pts.length >= 3 ? `<polyline points="${ma}" fill="none" stroke="#8A5A3C" stroke-width="2" stroke-dasharray="5 4"/>` : ''}${dots}</svg>`;
    }

    function renderProgress() {
        if (!$('wDate').value) $('wDate').value = today();
        $('wDate').max = today();
        if (!$('wValue').value && S.profile) $('wValue').value = curWeight();
        const pts = sortedWeights(), box = $('weightChart');
        box.innerHTML = pts.length >= 2 ? drawChart(pts) : `<p class="form-hint" style="text-align:center;padding:30px 8px">${esc(t('prog_empty'))}</p>`;
        box.setAttribute('aria-label', pts.length ? `${t('prog_now')}: ${curWeight()} kg` : '');
        if (!S.profile || !pts.length) { $('statCurrent').textContent = '—'; $('statChange').textContent = '—'; $('statChangeSub').textContent = ''; $('ladderBox').innerHTML = ''; return; }
        const base = pts[0].weight, cur = pts[pts.length - 1].weight, diff = +(cur - base).toFixed(1), pct = base ? (diff / base * 100) : 0;
        $('statCurrent').textContent = ltr(nf(cur, 1) + ' kg');
        $('statChange').textContent = ltr(`${diff > 0 ? '+' : ''}${diff} kg (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`);
        $('statChangeSub').textContent = Math.abs(diff) < 0.5 ? t('prog_stable') : (diff < 0 ? t('prog_down') : t('prog_up'));
        const g = C.weightGoal(C.calculateBMI(base, S.profile.height), base);
        $('ladderBox').innerHTML = `<div class="card-header"><div class="card-title-group"><span class="card-title">${esc(t('ladder_title'))}</span></div></div>` + (g && g.applicable
            ? `<ul class="ladder-list">${g.steps.map(s => `<li><span>${esc(t('ladder_reach'))} <bdi dir="ltr">${s.pct}% (${s.targetWeight} kg)</bdi> · ${esc(L(s.ar, s.en))}</span><b><bdi dir="ltr">${cur <= s.targetWeight ? '✓' : '-' + s.kg + ' kg'}</bdi></b></li>`).join('')}</ul><p class="form-hint">${esc(t('ladder_hint'))}</p>`
            : `<p class="form-hint">${esc(t('ladder_na'))}</p>`);
    }

    function renderGuidelines() {
        $('pillars').innerHTML = D.pillars.map(p => `<div class="guideline-pillar-card"><span class="pillar-number">${p.n}</span><h3 class="pillar-title">${esc(L(p.titleAr, p.titleEn))}</h3><p class="pillar-desc">${esc(L(p.descAr, p.descEn))}</p><ul class="pillar-key-items">${(lang === 'en' ? p.itemsEn : p.itemsAr).map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
        $('refList').innerHTML = D.references.map(r => `<li>${esc(r)}</li>`).join('');
    }

    function renderAll() {
        ensureToday(); applyI18n();
        [renderHeader, renderDashboard, renderFood, renderLabs, renderProgress, renderGuidelines].forEach(safe);
    }

    // ------------------------------------------------------------- modals
    function focusables(root) { return [...root.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(e => !e.disabled && !e.closest('[hidden]') && e.offsetParent !== null); }
    function openModal(id) {
        if (openId) closeModal(true);
        lastFocus = document.activeElement; openId = id;
        const m = $(id); m.classList.add('open');
        const f = focusables(m); if (f.length) f[0].focus();
    }
    const locked = () => openId === 'modalProfile' && !S.profile;
    function closeModal(force) {
        if (!openId || (!force && locked())) return;
        $(openId).classList.remove('open'); openId = null;
        if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* element gone */ }
    }
    document.addEventListener('keydown', e => {
        if (!openId) return;
        if (e.key === 'Escape') { closeModal(); return; }
        if (e.key === 'Tab') {
            const f = focusables($(openId)); if (!f.length) return;
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });

    // ---------------------------------------------------------- onboarding
    function setStep(n) { obStep = n; $('obStep1').hidden = n !== 1; $('obStep2').hidden = n !== 2; $('dot1').classList.toggle('active', n === 1); $('dot2').classList.toggle('active', n === 2); const f = focusables($('modalProfile')); if (f.length) f[0].focus(); }
    function openProfile() {
        const p = S.profile;
        $('pName').value = p ? p.name : ''; $('pGender').value = p ? p.gender : 'male'; $('pBirth').value = p ? p.birthDate : '';
        $('pHeight').value = p ? p.height : ''; $('pWeight').value = p ? curWeight() : ''; $('pActivity').value = p ? p.activityLevel : 'light';
        $('pDiabetes').checked = !!(p && p.hasDiabetes); $('pDiabMeds').checked = !!(p && p.diabetesMeds); $('pPregnant').checked = !!(p && p.pregnant);
        $('pWaist').value = p && p.waistCm ? p.waistCm : ''; $('pAlcohol').value = p ? p.alcoholPerWeek : 0; $('pViral').value = p ? p.hcvHbv : 'unknown';
        $('pConsent').checked = !!S.consentAt; $('obMsg1').textContent = ''; $('obMsg2').textContent = '';
        $('profileClose').hidden = !p; $('pBirth').max = today();
        updatePregRow(); updateBmiPreview(); openModal('modalProfile'); setStep(1);
    }
    function updatePregRow() { $('pregRow').hidden = $('pGender').value !== 'female'; if ($('pregRow').hidden) $('pPregnant').checked = false; }
    function updateBmiPreview() {
        const b = C.calculateBMI(parseFloat($('pWeight').value), parseFloat($('pHeight').value));
        $('bmiPreview').textContent = b ? `BMI ${b.bmi} · ${L(b.categoryAr, b.categoryEn)}` : '';
    }
    function validateStep1() {
        const age = C.ageAt($('pBirth').value, today());
        if (age == null) return t('ob_err_birth');
        if (age < 18) return t('ob_err_minor');
        if (age > 110) return t('ob_err_birth');
        if (!num($('pHeight').value, 120, 230) || !num($('pWeight').value, 30, 300)) return t('ob_err_body');
        return '';
    }
    function saveProfile() {
        const m1 = validateStep1(); if (m1) { setStep(1); $('obMsg1').textContent = m1; return; }
        if (!$('pConsent').checked) { $('obMsg2').textContent = t('ob_err_consent'); return; }
        const w = num($('pWeight').value, 30, 300), first = !S.profile;
        S.profile = {
            name: $('pName').value.trim().slice(0, 40), gender: $('pGender').value === 'female' ? 'female' : 'male', birthDate: $('pBirth').value,
            height: num($('pHeight').value, 120, 230), weight: w, activityLevel: $('pActivity').value,
            hasDiabetes: $('pDiabetes').checked, diabetesMeds: $('pDiabetes').checked && $('pDiabMeds').checked, pregnant: $('pPregnant').checked,
            waistCm: num($('pWaist').value, 40, 200), alcoholPerWeek: num($('pAlcohol').value, 0, 100) || 0, hcvHbv: $('pViral').value
        };
        S.consentAt = S.consentAt || new Date().toISOString();
        const d = today(), ex = S.weights.find(x => x.date === d);
        if (ex) ex.weight = w; else S.weights.push({ date: d, weight: w });
        save(); closeModal(true); renderAll(); toast(t('ob_saved'));
        if (first && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    }

    // ------------------------------------------------------------- labs
    function submitLab(e) {
        e.preventDefault(); const msg = $('labMsg'); msg.textContent = '';
        if (!S.profile) { msg.textContent = t('lab_err_age'); return; }
        const date = $('labDate').value, ast = num($('labAst').value, 5, 2000), alt = num($('labAlt').value, 5, 2000);
        let plt = parseFloat($('labPlt').value); if (plt > 1500) plt /= 1000; plt = num(plt, 10, 1500);
        const opt = (id, a, b) => { const v = $(id).value; return v === '' ? null : num(v, a, b); };
        const cr = opt('labCr', 0.2, 15), bili = opt('labBili', 0.1, 50), inr = opt('labInr', 0.5, 10);
        if (!C.parseLocalDate(date) || !ast || !alt || !plt || ($('labCr').value !== '' && cr == null) || ($('labBili').value !== '' && bili == null) || ($('labInr').value !== '' && inr == null)) { msg.textContent = t('lab_err_vals'); return; }
        if (date > today()) { msg.textContent = t('lab_err_future'); return; }
        if (S.labs.some(l => l.date === date)) { msg.textContent = t('lab_err_dup'); return; }
        const age = C.ageAt(S.profile.birthDate, date);
        if (age == null || age < 18) { msg.textContent = t('lab_err_age'); return; }
        S.labs.push({ id: 'l' + Date.now(), date, ast, alt, plt, cr, bili, inr, ageAtTest: age, fib4: C.calculateFIB4(age, ast, plt, alt), meld: C.calculateMELD(cr, bili, inr) });
        save(); ['labAst', 'labAlt', 'labPlt', 'labCr', 'labBili', 'labInr'].forEach(i => { $(i).value = ''; });
        renderAll(); toast(t('lab_saved')); showTab('dashboard');
    }

    // ---------------------------------------------------------- navigation
    function showTab(name) {
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
        document.querySelectorAll('.nav-tab-btn[data-tab]').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
        window.scrollTo(0, 0); const c = $('app'); if (c) c.scrollTop = 0;
    }

    // -------------------------------------------------------------- FAQ
    function addBubble(text, who, cls) { const d = document.createElement('div'); d.className = 'chat-bubble ' + who + (cls ? ' ' + cls : ''); d.textContent = text; $('chatMessages').appendChild(d); $('chatMessages').scrollTop = 1e6; }
    function openFaq() {
        $('chatChips').innerHTML = D.faq.map(f => `<button class="chat-chip" type="button" data-action="faq-chip" data-id="${f.id}">${esc(L(f.chipAr, f.chipEn))}</button>`).join('');
        if (!$('chatMessages').children.length) addBubble(t('faq_hello'), 'bot');
        openModal('modalFaq');
    }
    function answer(q) {
        if (C.detectRedFlags(q)) { addBubble(t('faq_redflag'), 'bot', 'alert'); return; }
        const s = q.toLowerCase(); let best = null, score = 0;
        D.faq.forEach(f => { const n = f.kAr.concat(f.kEn).filter(k => s.includes(k.toLowerCase())).length; if (n > score) { score = n; best = f; } });
        addBubble(best ? L(best.ar, best.en) : t('faq_unknown'), 'bot');
    }
    function summaryText() {
        const p = S.profile; if (!p) return t('pending_setup');
        const lab = latestLab(), r = interpFor(lab, true), b = bmiNow();
        const lines = [`${t('report_title')} - ${C.formatDate(new Date(), lang)}`, `${L('العمر', 'Age')}: ${profAge()} · ${p.gender === 'female' ? t('female') : t('male')} · BMI ${b ? b.bmi : '—'}`];
        if (lab) lines.push(`FIB-4 ${lab.fib4} (${lab.date}) · AST ${lab.ast} · ALT ${lab.alt} · PLT ${lab.plt}`, L(r.titleAr, r.titleEn));
        lines.push(p.hasDiabetes ? L('سكري: نعم', 'Diabetes: yes') : L('سكري: لا', 'Diabetes: no'), t('report_disc'));
        return lines.join('\n');
    }
    async function copyText(txt) {
        try { await navigator.clipboard.writeText(txt); toast(t('copied')); }
        catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(t('copied')); } catch (e2) { toast(t('shared_fail')); } ta.remove(); }
    }

    // ---------------------------------------------- report / ICS / backup
    function download(name, mime, data) { const u = URL.createObjectURL(new Blob([data], { type: mime })); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
    function printReport() {
        const p = S.profile; if (!p) { toast(t('pending_setup')); return; }
        const labs = sortedLabs(), b = bmiNow(), lab = labs[0], r = interpFor(lab, true), alc = C.alcoholCategory(p.gender, p.alcoholPerWeek);
        const rows = labs.map(l => `<tr><td>${esc(l.date)}</td><td>${l.ageAtTest}</td><td>${l.ast}</td><td>${l.alt}</td><td>${l.plt}</td><td><b>${l.fib4}</b></td><td>${l.cr ?? '—'}</td><td>${l.bili ?? '—'}</td><td>${l.inr ?? '—'}</td><td>${l.meld ?? '—'}</td></tr>`).join('');
        const wrows = sortedWeights().slice(-12).map(w => `<tr><td>${esc(w.date)}</td><td>${w.weight}</td></tr>`).join('');
        const dir = lang === 'en' ? 'ltr' : 'rtl';
        const html = `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(t('report_title'))}</title><style>body{font-family:Tajawal,Arial,sans-serif;max-width:780px;margin:24px auto;padding:0 16px;color:#15241F;line-height:1.6}h1{color:#204C3F;font-size:1.4rem}h2{font-size:1.05rem;color:#204C3F;border-bottom:1px solid #B4CFC5;padding-bottom:4px;margin-top:22px}table{border-collapse:collapse;width:100%;font-size:.85rem}td,th{border:1px solid #ccd8d2;padding:5px 7px;text-align:center}th{background:#EEF5F2}.d{background:#FFF8E6;border:1px solid #E8D29B;padding:8px 10px;border-radius:8px;font-size:.85rem}.n{font-size:.78rem;color:#485A52}@media print{body{margin:0}}</style></head><body><h1>${esc(t('report_title'))}</h1><p class="n">${esc(C.formatDate(new Date(), lang))}</p><p class="d">${esc(t('report_disc'))}</p><h2>${esc(L('البيانات الأساسية', 'Basics'))}</h2><p>${esc(p.name || '—')} · ${esc(p.gender === 'female' ? t('female') : t('male'))} · ${esc(L('العمر', 'Age'))} ${profAge()} · ${esc(L('الطول', 'Height'))} ${p.height} cm · ${esc(L('الوزن', 'Weight'))} ${curWeight()} kg · BMI ${b ? b.bmi : '—'}<br>${esc(L('سكري', 'Diabetes'))}: ${p.hasDiabetes ? esc(L('نعم', 'Yes')) : esc(L('لا', 'No'))} · ${esc(L('كحول (مشروب/أسبوع)', 'Alcohol (drinks/week)'))}: ${p.alcoholPerWeek}${alc ? ' (' + esc(alc.key) + ')' : ''} · ${esc(L('فيروسات B/C', 'HBV/HCV'))}: ${esc(p.hcvHbv)}${p.waistCm ? ' · ' + esc(L('الوسط', 'Waist')) + ' ' + p.waistCm + ' cm' : ''}</p><h2>${esc(L('نتائج التحاليل', 'Lab results'))}</h2>${labs.length ? `<table><tr><th>${esc(L('التاريخ', 'Date'))}</th><th>${esc(L('العمر', 'Age'))}</th><th>AST</th><th>ALT</th><th>PLT</th><th>FIB-4</th><th>Cr</th><th>Bili</th><th>INR</th><th>MELD</th></tr>${rows}</table>` : '<p>—</p>'}<h2>${esc(L('التفسير الآلي (أولي)', 'Automated interpretation (preliminary)'))}</h2><p><b>${esc(L(r.titleAr, r.titleEn))}</b><br>${esc(L(r.summaryAr, r.summaryEn))}</p>${r._internalRaw ? `<p class="n">FIB-4 cut-offs: ${r._internalRaw.lowCutoff} / ${r._internalRaw.highCutoff}</p>` : ''}<p>${esc(L('الخطوة التالية المقترحة', 'Suggested next step'))}: ${esc(L(r.nextLabLabelAr, r.nextLabLabelEn))} (${esc(lang === 'en' ? r.nextLabDateFormattedEn : r.nextLabDateFormatted)})</p><h2>${esc(L('الوزن (آخر 12 قراءة)', 'Weight (last 12 readings)'))}</h2><table><tr><th>${esc(L('التاريخ', 'Date'))}</th><th>kg</th></tr>${wrows}</table><h2>${esc(t('refs_title'))}</h2><ol class="n">${D.references.slice(0, 5).map(x => `<li>${esc(x)}</li>`).join('')}</ol></body></html>`;
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const w = window.open(url, '_blank');
        if (!w) { download('wekaya-report.html', 'text/html', html); } else { setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* user can print manually */ } }, 600); }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    function downloadICS() {
        const lab = latestLab(); if (!lab) { toast(t('pending_setup')); return; }
        const r = interpFor(lab, true); if (!r.nextLabDate) return;
        const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const title = (L('وقاية: ', 'Wekaya: ')) + (lang === 'en' ? r.nextLabLabelEn : r.nextLabLabelAr);
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wekaya//v2//EN', 'BEGIN:VEVENT', `UID:wekaya-${Date.now()}@local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${r.nextLabDate.replace(/-/g, '')}`, `SUMMARY:${t('ramadan_remind')}`, `DESCRIPTION:${title.replace(/[,;\n]/g, ' ')}`, 'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', `DESCRIPTION:${t('ramadan_remind')}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        download('wekaya-reminder.ics', 'text/calendar', ics);
    }
    async function openSettings() {
        $('setRamadan').checked = S.ramadanManual;
        let txt = t('persist_na');
        try { if (navigator.storage && navigator.storage.persisted) txt = (await navigator.storage.persisted()) ? t('persist_yes') : t('persist_no'); } catch (e) { /* ignore */ }
        $('persistStatus').textContent = txt; openModal('modalSettings');
    }

    // ------------------------------------------------------- click actions
    const actions = {
        'toggle-lang': () => { lang = lang === 'en' ? 'ar' : 'en'; S.lang = lang; save(); renderAll(); if (openId === 'modalFaq') { $('chatMessages').innerHTML = ''; openFaq(); } },
        'open-settings': openSettings, 'edit-profile': openProfile, 'open-faq': openFaq, 'close-modal': () => closeModal(),
        'ob-next': () => { const m = validateStep1(); $('obMsg1').textContent = m; if (!m) setStep(2); },
        'ob-back': () => setStep(1),
        'next-tip': () => { S.tipIndex = (S.tipIndex + 1) % D.tips.length; save(); renderTip(); },
        'toggle-activity': () => { S.activity = { date: today(), done: !S.activity.done }; save(); renderDashboard(); },
        'filter-food': el => { foodFilter = el.dataset.cat; renderFood(); },
        'add-food': el => { const f = allFoods().find(x => x.id === el.dataset.id); if (!f) return; ensureToday(); S.meals.items.push({ ts: Date.now() + Math.random(), name: f.ar, nameEn: f.en, cal: f.cal, p: f.p, c: f.c, f: f.f }); save(); renderFood(); renderDashboard(); toast('+ ' + foodName(f)); },
        'remove-meal': el => { S.meals.items = S.meals.items.filter(m => String(m.ts) !== el.dataset.ts); save(); renderFood(); renderDashboard(); },
        'delete-food': el => { S.customFoods = S.customFoods.filter(f => f.id !== el.dataset.id); save(); renderFood(); },
        'open-custom-food': () => { $('foodForm').reset(); $('cfMsg').textContent = ''; openModal('modalFood'); },
        'delete-lab': el => { S.labs = S.labs.filter(l => l.id !== el.dataset.id); save(); renderAll(); },
        'faq-chip': el => { const f = D.faq.find(x => x.id === el.dataset.id); if (!f) return; addBubble(L(f.chipAr, f.chipEn), 'user'); addBubble(L(f.ar, f.en), 'bot'); },
        'copy-summary': () => copyText(summaryText()),
        'print-report': printReport, 'download-ics': downloadICS,
        'export-json': () => download(`wekaya-backup-${today()}.json`, 'application/json', JSON.stringify(Object.assign({ app: 'wekaya' }, S), null, 1)),
        'import-json': () => $('importFile').click(),
        'delete-all': () => { if (!confirm(t('set_confirm_delete'))) return; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } S = blank(); S.lang = lang; closeModal(true); $('chatMessages').innerHTML = ''; renderAll(); toast(t('set_deleted')); openProfile(); }
    };
    document.addEventListener('click', e => {
        const tabBtn = e.target.closest('[data-tab]'); if (tabBtn) { showTab(tabBtn.dataset.tab); return; }
        const el = e.target.closest('[data-action]'); if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
        if (e.target.classList && e.target.classList.contains('modal-overlay') && !locked()) closeModal();
    });

    function wire() {
        $('profileForm').addEventListener('submit', e => { e.preventDefault(); saveProfile(); });
        ['pWeight', 'pHeight'].forEach(i => $(i).addEventListener('input', updateBmiPreview));
        $('pGender').addEventListener('change', updatePregRow);
        $('labForm').addEventListener('submit', submitLab);
        $('weightForm').addEventListener('submit', e => {
            e.preventDefault(); const d = $('wDate').value, w = num($('wValue').value, 30, 300);
            if (!C.parseLocalDate(d) || d > today() || !w) { toast(t('lab_err_vals')); return; }
            const ex = S.weights.find(x => x.date === d); if (ex) ex.weight = w; else S.weights.push({ date: d, weight: w });
            save(); renderAll(); toast(t('lab_saved'));
        });
        $('foodSearch').addEventListener('input', e => { foodQuery = e.target.value; renderFood(); });
        $('chatForm').addEventListener('submit', e => { e.preventDefault(); const q = $('chatInput').value.trim(); if (!q) return; addBubble(q, 'user'); $('chatInput').value = ''; answer(q); });
        $('foodForm').addEventListener('submit', e => {
            e.preventDefault(); const name = $('cfName').value.trim(), cal = num($('cfCal').value, 0, 3000);
            if (!name || cal == null) { $('cfMsg').textContent = t('cf_err'); return; }
            S.customFoods.push({ id: 'c' + Date.now(), ar: name, en: name, portAr: $('cfPortion').value.trim(), portEn: $('cfPortion').value.trim(), cat: 'custom', liver: 'unrated', cal, p: num($('cfP').value, 0, 300) || 0, c: num($('cfC').value, 0, 500) || 0, f: num($('cfF').value, 0, 300) || 0, fibre: 0, tagAr: '', tagEn: '', custom: true });
            save(); closeModal(true); renderFood(); toast(t('cf_saved'));
        });
        $('setRamadan').addEventListener('change', e => { S.ramadanManual = e.target.checked; save(); renderDashboard(); });
        $('importFile').addEventListener('change', e => {
            const f = e.target.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = () => { try { const o = JSON.parse(rd.result); if (!o || o.app !== 'wekaya' || !o.profile) throw new Error('bad'); S = sanitize(o); if (!S.profile) throw new Error('bad'); lang = S.lang; save(); closeModal(true); renderAll(); toast(t('set_imported')); } catch (err) { toast(t('set_import_err')); } e.target.value = ''; };
            rd.readAsText(f);
        });
        const off = () => { $('offlineBanner').style.display = navigator.onLine ? 'none' : 'block'; };
        window.addEventListener('online', off); window.addEventListener('offline', off); off();
        document.addEventListener('visibilitychange', () => { if (!document.hidden && (S.meals.date !== today() || S.activity.date !== today())) renderAll(); });
    }

    // -------------------------------------------------- language picker
    function showLangPicker() {
        const overlay = $('langPicker');
        overlay.removeAttribute('hidden');
        overlay.style.display = 'flex';
        $('pickAr').addEventListener('click', () => pickLang('ar'));
        $('pickEn').addEventListener('click', () => pickLang('en'));
    }

    function pickLang(chosen) {
        lang = chosen;
        S.lang = chosen;
        save();
        const overlay = $('langPicker');
        overlay.setAttribute('hidden', '');
        overlay.style.display = 'none';
        applyI18n();
        openProfile();
    }

    function init() {
        wire();
        // Detect a genuine first visit: no saved data exists at all
        const isFirstVisit = !localStorage.getItem(KEY);
        renderAll();
        const h = location.hash.slice(1); if (['labs', 'food', 'progress', 'guidelines'].includes(h)) showTab(h);
        if (isFirstVisit) {
            showLangPicker();
        } else if (!S.profile) {
            openProfile();
        }
        if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
