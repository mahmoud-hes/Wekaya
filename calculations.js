// ==========================================================================
// Wekaya (وقاية) v2 - Clinical algorithms (pure functions, unit-tested)
// References: AGA Clinical Care Pathway for MASLD (Gastroenterology, Mar 2026);
// EASL-EASD-EASO MASLD CPG (J Hepatol 2024); AASLD MASLD/MASH guidance (2023,
// semaglutide update Nov 2025); Rinella et al., Hepatology 2023 (nomenclature);
// Vilar-Gomez et al., Gastroenterology 2015 (weight-loss dose-response);
// Inker et al., NEJM 2021 (CKD-EPI 2021, race-free).
// This file is educational decision-support. It does NOT diagnose.
// ==========================================================================
(function (root) {
    'use strict';

    const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const C = {
        VERSION: '2.0.0',

        // ------------------------------------------------------------------
        // Date helpers (local time, never UTC -> fixes the Cairo 00:00-03:00 bug)
        // ------------------------------------------------------------------
        toLocalISO(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        },
        todayLocal() { return C.toLocalISO(new Date()); },
        parseLocalDate(str) {
            if (!str) return null;
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
            if (!m) return null;
            const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            return isNaN(d.getTime()) ? null : d;
        },
        // Month arithmetic that clamps (Jan 31 + 1 month = Feb 28, not Mar 3)
        addMonths(date, n) {
            const x = new Date(date.getTime());
            const day = x.getDate();
            x.setDate(1);
            x.setMonth(x.getMonth() + n);
            const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
            x.setDate(Math.min(day, last));
            return x;
        },
        formatDate(date, lang) {
            if (!date) return '';
            return lang === 'en'
                ? `${MONTHS_EN[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
                : `${date.getDate()} ${MONTHS_AR[date.getMonth()]} ${date.getFullYear()}`;
        },
        // Age at a given date from a birth date (so old labs use the age at test time)
        ageAt(birthDateStr, onDateStr) {
            const b = C.parseLocalDate(birthDateStr);
            if (!b) return null;
            const on = C.parseLocalDate(onDateStr) || new Date();
            let age = on.getFullYear() - b.getFullYear();
            const before = on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate());
            if (before) age -= 1;
            return age >= 0 ? age : null;
        },

        // ------------------------------------------------------------------
        // 1. BMI
        // ------------------------------------------------------------------
        calculateBMI(weightKg, heightCm) {
            if (!weightKg || !heightCm || heightCm <= 0 || weightKg <= 0) return null;
            const h = heightCm / 100;
            const bmi = parseFloat((weightKg / (h * h)).toFixed(1));
            let cls;
            if (bmi < 18.5) cls = { key: 'under', ar: 'وزن أقل من الطبيعي', en: 'Underweight', color: '#3E6679', rAr: 'يُنصح بتقييم التغذية العامة؛ لا يُنصح بإنقاص الوزن.', rEn: 'Assess overall nutrition; weight loss is not advised.' };
            else if (bmi < 25) cls = { key: 'normal', ar: 'وزن ضمن النطاق الطبيعي', en: 'Healthy weight range', color: '#204C3F', rAr: 'نطاق وزن صحي. الكبد الدهني يحدث أيضاً عند بعض ذوي الوزن الطبيعي، فالفحص الدوري مهم لو توجد عوامل خطورة.', rEn: 'Healthy range. MASLD can still occur at normal weight, so periodic screening matters when risk factors exist.' };
            else if (bmi < 30) cls = { key: 'over', ar: 'وزن زائد', en: 'Overweight', color: '#8A5A3C', rAr: 'يرتبط بزيادة احتمال تراكم دهون الكبد ومقاومة الأنسولين.', rEn: 'Associated with a higher likelihood of liver fat and insulin resistance.' };
            else if (bmi < 35) cls = { key: 'ob1', ar: 'سمنة (الدرجة الأولى)', en: 'Obesity (class 1)', color: '#A04A2E', rAr: 'احتمال أعلى لتراكم دهون الكبد والتهابه؛ إنقاص الوزن التدريجي هو العلاج الأساسي.', rEn: 'Higher likelihood of liver fat and inflammation; gradual weight loss is the core treatment.' };
            else cls = { key: 'ob2', ar: 'سمنة (الدرجة الثانية أو أعلى)', en: 'Obesity (class 2 or higher)', color: '#9B2F2A', rAr: 'احتمال مرتفع لالتهاب الكبد الدهني؛ يُفضّل التنسيق مع طبيب لوضع خطة متكاملة (قد تشمل علاجاً دوائياً).', rEn: 'Higher likelihood of steatohepatitis; coordinate with a physician on a comprehensive plan (which may include medication).' };
            return {
                bmi, classKey: cls.key, categoryAr: cls.ar, categoryEn: cls.en, color: cls.color,
                riskAr: cls.rAr, riskEn: cls.rEn,
                idealWeightMin: parseFloat((18.5 * h * h).toFixed(1)),
                idealWeightMax: parseFloat((24.9 * h * h).toFixed(1)),
                heightCm, weightKg
            };
        },

        // ------------------------------------------------------------------
        // 2. eGFR - CKD-EPI 2021 (race-free). Used to flag protein caution.
        // ------------------------------------------------------------------
        calculateEGFR(creatinine, age, sex) {
            if (!creatinine || creatinine <= 0 || !age || age < 18) return null;
            const female = sex === 'female';
            const kappa = female ? 0.7 : 0.9;
            const alpha = female ? -0.241 : -0.302;
            const r = creatinine / kappa;
            const egfr = 142 * Math.pow(Math.min(r, 1), alpha) * Math.pow(Math.max(r, 1), -1.2) * Math.pow(0.9938, age) * (female ? 1.012 : 1);
            return Math.round(egfr);
        },

        // ------------------------------------------------------------------
        // 3. Energy & macros. Goal depends on BMI (no deficit when BMI < 25).
        // ------------------------------------------------------------------
        calculateCaloricNeeds(p) {
            const { weight, height, age, gender = 'male', activityLevel = 'light' } = p || {};
            if (!weight || !height || !age) return null;
            const notes = [];
            if (age < 18) {
                return { blocked: true, reason: 'minor', goal: 'none', notes: [{ ar: 'هذه الأداة للبالغين فقط. لو عمرك أقل من 18 سنة استشر طبيب الأطفال.', en: 'This tool is for adults only. If you are under 18, consult a pediatrician.' }] };
            }
            const bmiData = C.calculateBMI(weight, height);
            let bmr = 10 * weight + 6.25 * height - 5 * age + (gender === 'male' ? 5 : -161);
            const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }[activityLevel] || 1.375;
            const tdee = Math.round(bmr * mult);

            let goal = 'lose';
            let deficit = 500;
            if (bmiData.bmi < 25) { goal = 'maintain'; deficit = 0; }
            if (p.pregnantOrBreastfeeding) {
                goal = 'maintain'; deficit = 0;
                notes.push({ ar: 'في الحمل أو الرضاعة لا يُنصح بنظام إنقاص وزن دون إشراف طبي.', en: 'No weight-loss diet during pregnancy or breastfeeding without medical supervision.' });
            }
            if (bmiData.bmi < 18.5) notes.push({ ar: 'وزنك أقل من الطبيعي؛ الهدف هنا الحفاظ على الوزن وتقييم التغذية مع طبيب.', en: 'You are underweight; the goal is maintenance and a nutrition assessment with a doctor.' });
            else if (goal === 'maintain' && !p.pregnantOrBreastfeeding) notes.push({ ar: 'وزنك ضمن النطاق الطبيعي فلا يوجد عجز سعرات. ركّز على جودة الغذاء والنشاط.', en: 'Your weight is in the healthy range, so no calorie deficit is applied. Focus on food quality and activity.' });

            const floor = gender === 'female' ? 1200 : 1500;
            let target = tdee - deficit;
            if (goal === 'lose' && target < floor) { target = floor; notes.push({ ar: `تم رفع الهدف للحد الأدنى الآمن (${floor} سعرة).`, en: `Target raised to the safe minimum (${floor} kcal).` }); }

            if (p.diabetesMeds && goal === 'lose') notes.push({ ar: 'لو بتاخد أنسولين أو أدوية سكر (خصوصاً السلفونيل يوريا)، تخفيض السعرات أو زيادة النشاط قد يسبب هبوط سكر؛ راجع طبيبك قبل البدء.', en: 'If you take insulin or glucose-lowering drugs (especially sulfonylureas), cutting calories or adding activity can cause hypoglycemia; check with your doctor first.' });

            // Macros: protein 25%, fat 30%, rest carbs. Cap protein if eGFR is reduced.
            let protein = Math.round((target * 0.25) / 4);
            let fats = Math.round((target * 0.30) / 9);
            if (p.egfr != null && p.egfr < 60) {
                protein = Math.min(protein, Math.round(0.8 * weight));
                notes.push({ ar: 'وظائف الكلى المسجلة منخفضة (eGFR أقل من 60)؛ تم تحديد البروتين بحد أقصى 0.8 جم/كجم. ناقش الكمية مع طبيبك.', en: 'Recorded kidney function is reduced (eGFR < 60); protein capped at 0.8 g/kg. Discuss the amount with your doctor.' });
            }
            const carbs = Math.max(0, Math.round((target - protein * 4 - fats * 9) / 4));
            return {
                blocked: false, goal, bmr: Math.round(bmr), tdee, targetCalories: Math.round(target), deficit,
                macros: { protein, carbs, fats }, notes
            };
        },

        // Weight-loss ladder (Vilar-Gomez 2015; EASL/AASLD): 5% -> steatosis, 7% -> MASH, >=10% -> fibrosis
        weightGoal(bmiData, baselineWeight) {
            if (!bmiData || !baselineWeight) return null;
            if (bmiData.bmi < 25) return { applicable: false };
            const steps = [5, 7, 10].map(pct => ({
                pct, kg: parseFloat((baselineWeight * pct / 100).toFixed(1)), targetWeight: parseFloat((baselineWeight * (1 - pct / 100)).toFixed(1))
            }));
            steps[0].ar = 'تحسّن تشحّم الكبد'; steps[0].en = 'Less liver fat';
            steps[1].ar = 'تحسّن/زوال التهاب الكبد (MASH) عند كثيرين'; steps[1].en = 'MASH improves or resolves in many';
            steps[2].ar = 'تراجع التليف عند بعض المرضى'; steps[2].en = 'Fibrosis regresses in some patients';
            return { applicable: true, steps, safeRateKgPerWeek: [0.5, 1.0] };
        },

        // ------------------------------------------------------------------
        // 4. FIB-4, MELD, applicability
        // ------------------------------------------------------------------
        calculateFIB4(age, ast, platelets, alt) {
            if (!age || !ast || !platelets || !alt || alt <= 0 || platelets <= 0) return null;
            let plt = platelets > 1000 ? platelets / 1000 : platelets; // accept 235000 or 235
            return parseFloat(((age * ast) / (plt * Math.sqrt(alt))).toFixed(2));
        },
        fib4Cutoffs(age) { return { low: age >= 65 ? 2.0 : 1.3, high: 2.67 }; },
        fib4Applicability(age, hasDiabetes) {
            const notes = [];
            if (age != null && age < 35) notes.push({ ar: 'FIB-4 أقل دقة تحت سن 35 سنة؛ فسّر النتيجة مع طبيبك.', en: 'FIB-4 is less reliable under age 35; interpret with your doctor.' });
            if (age != null && age >= 65) notes.push({ ar: 'بعد سن 65 يُستخدم حد فاصل أعلى (2.0) لتقليل النتائج الإيجابية الكاذبة.', en: 'After age 65 a higher cut-off (2.0) is used to reduce false positives.' });
            if (hasDiabetes) notes.push({ ar: 'مع مرض السكري قد تختلف دقة المؤشر؛ المتابعة السنوية والفحص التأكيدي أهم.', en: 'With diabetes the index may perform differently; yearly follow-up and confirmatory testing matter more.' });
            return notes;
        },
        calculateMELD(creatinine, bilirubin, inr) {
            if (!creatinine || !bilirubin || !inr) return null;
            const cr = Math.max(1.0, Math.min(4.0, creatinine));
            const bili = Math.max(1.0, bilirubin);
            const i = Math.max(1.0, inr);
            return Math.round(9.57 * Math.log(cr) + 3.78 * Math.log(bili) + 11.2 * Math.log(i) + 6.43);
        },

        // ------------------------------------------------------------------
        // 5. Alcohol category (Rinella 2023: MASLD <140/210 g/wk, MetALD up to 350/420, ALD above)
        // ------------------------------------------------------------------
        alcoholCategory(sex, drinksPerWeek) {
            if (drinksPerWeek == null || isNaN(drinksPerWeek) || drinksPerWeek < 0) return null;
            const grams = drinksPerWeek * 14; // ~14 g pure alcohol per standard drink
            const female = sex === 'female';
            const t1 = female ? 140 : 210, t2 = female ? 350 : 420;
            let key = 'masld_range';
            if (grams > t2) key = 'ald_range'; else if (grams >= t1) key = 'metald';
            const msg = {
                masld_range: { ar: drinksPerWeek === 0 ? 'لا كحول: ممتاز للكبد.' : 'استهلاك الكحول ضمن النطاق الذي يُصنَّف معه المرض كـ MASLD، لكن الأفضل التوقف التام.', en: drinksPerWeek === 0 ? 'No alcohol: best for the liver.' : 'Alcohol intake is within the range classified as MASLD, but stopping completely is best.' },
                metald: { ar: 'استهلاك الكحول في النطاق المسمى MetALD (تداخل الكبد الدهني الأيضي مع الكحول). يُنصح بخفضه والتحدث مع طبيبك.', en: 'Alcohol intake falls in the MetALD range (metabolic + alcohol overlap). Reduce it and talk to your doctor.' },
                ald_range: { ar: 'الاستهلاك المسجل يقع في نطاق مرض الكبد المرتبط بالكحول. استشر طبيباً.', en: 'The recorded intake is in the alcohol-related liver disease range. Please see a doctor.' }
            }[key];
            return { key, gramsPerWeek: grams, messageAr: msg.ar, messageEn: msg.en };
        },

        // ------------------------------------------------------------------
        // 6. Cardiometabolic criteria count (nomenclature 2023). Unknown != absent.
        // ------------------------------------------------------------------
        cardiometabolicCriteria(p) {
            const female = p.gender === 'female';
            const c = [];
            const bmi = p.bmi;
            if (bmi != null || p.waistCm) c.push({ k: 'adiposity', met: (bmi != null && bmi >= 25) || (p.waistCm && p.waistCm > (female ? 80 : 94)) });
            if (p.hasDiabetes != null) c.push({ k: 'glycemia', met: !!p.hasDiabetes || (p.hba1c != null && p.hba1c >= 5.7) });
            return { evaluated: c.length, met: c.filter(x => x.met).length, items: c };
        },

        // ------------------------------------------------------------------
        // 7. Liver-risk interpretation (FIB-4 first-line, per AGA 2026 / EASL 2024)
        // ------------------------------------------------------------------
        interpretLiverHealth(opts) {
            const { fib4, meld = null, age = 45, testDateStr = null, hasDiabetes = false, hcvHbv = 'unknown', todayStr = null } = opts || {};
            const today = C.parseLocalDate(todayStr) || new Date();
            if (fib4 === null || fib4 === undefined || isNaN(fib4)) {
                return {
                    tier: 'unknown', titleAr: 'لم تُسجَّل تحاليل بعد', titleEn: 'No lab results recorded yet',
                    statusBadgeAr: 'غير محدد', statusBadgeEn: 'Not recorded', badgeClass: 'badge-neutral', color: '#5B6B7A',
                    summaryAr: 'سجّل نتائج AST وALT وعدد الصفائح الدموية لحساب مؤشر FIB-4 وتحديد خطوة المتابعة المناسبة.',
                    summaryEn: 'Enter AST, ALT and platelet count to compute the FIB-4 index and the appropriate next step.',
                    nextLabMonths: null, nextLabLabelAr: 'سجّل تحاليلك أولاً', nextLabLabelEn: 'Enter your labs first',
                    nextLabDateFormatted: '—', nextLabDateFormattedEn: '—', overdue: false,
                    panelListAr: ['AST وALT', 'صورة دم كاملة (الصفائح)'], panelListEn: ['AST and ALT', 'CBC with platelets'],
                    doctorActionAr: 'راجع طبيبك لتحديد الفحوصات المناسبة لحالتك.', doctorActionEn: 'Ask your doctor which tests suit your situation.',
                    notes: [], needsSecondTier: false
                };
            }
            const cut = C.fib4Cutoffs(age);
            const rank = { low: 0, moderate: 1, high: 2 };
            const fibTier = fib4 < cut.low ? 'low' : fib4 <= cut.high ? 'moderate' : 'high';
            const meldTier = meld === null || meld < 10 ? 'low' : meld < 15 ? 'moderate' : 'high';
            let tier = rank[fibTier] >= rank[meldTier] ? fibTier : meldTier;
            if (hcvHbv === 'active' && tier === 'low') tier = 'moderate';
            const notes = C.fib4Applicability(age, hasDiabetes);
            if (meld !== null && meldTier !== 'low') notes.push({ ar: 'مؤشر MELD المُسجَّل يستدعي مراجعة طبية حتى لو كان FIB-4 منخفضاً.', en: 'The recorded MELD value warrants medical review even if FIB-4 is low.' });
            if (hcvHbv === 'active') notes.push({ ar: 'عدوى فيروسية نشطة تحتاج متابعة علاجية منفصلة مع أخصائي كبد.', en: 'An active viral infection needs separate treatment follow-up with a hepatologist.' });

            const T = {
                low: {
                    color: '#204C3F', badgeClass: 'badge-success', months: hasDiabetes ? 12 : 24,
                    titleAr: 'احتمال التليف المتقدم منخفض', titleEn: 'Low likelihood of advanced fibrosis',
                    badgeAr: 'مؤشر مطمئن ✓', badgeEn: 'Reassuring result ✓',
                    summaryAr: 'قيمة FIB-4 أقل من الحد الفاصل، وهذا يستبعد غالباً وجود تليف متقدم (قيمة تنبؤية سلبية ≥ 90% حسب إرشادات AGA 2026). لكن هذا لا يعني أن الكبد خالٍ من الدهون؛ استمر في نمط الحياة الصحي وكرر الفحص في موعده.',
                    summaryEn: 'FIB-4 is below the cut-off, which usually rules out advanced fibrosis (negative predictive value ≥ 90% per AGA 2026). It does not mean the liver is free of fat; keep up the lifestyle changes and repeat testing on schedule.',
                    labelAr: hasDiabetes ? 'بعد 12 شهراً (فحص سنوي)' : 'كل سنة إلى سنتين (حسب تقدير الطبيب)', labelEn: hasDiabetes ? 'In 12 months (yearly check)' : 'Every 1-2 years (per your doctor)',
                    panelAr: ['صورة دم كاملة (الصفائح) + AST وALT لإعادة حساب FIB-4', 'دهون الدم (Lipid Profile)', 'سكر صائم وHbA1c'],
                    panelEn: ['CBC (platelets) + AST/ALT to recompute FIB-4', 'Lipid profile', 'Fasting glucose and HbA1c'],
                    docAr: 'تكفي المتابعة الدورية مع طبيب الأسرة أو الباطنة.', docEn: 'Routine follow-up with your primary-care physician is generally sufficient.'
                },
                moderate: {
                    color: '#8A5A3C', badgeClass: 'badge-warning', months: 3,
                    titleAr: 'منطقة غير حاسمة: يلزم فحص تأكيدي', titleEn: 'Indeterminate zone: confirmatory test needed',
                    badgeAr: 'يلزم فحص تأكيدي ⚠️', badgeEn: 'Confirmatory test needed ⚠️',
                    summaryAr: 'القيمة وقعت في المنطقة غير الحاسمة، وهذا شائع ولا يعني وجود تليف مؤكد. توصي الإرشادات (AGA 2026 وEASL-EASD-EASO 2024) بفحص ثانٍ مثل قياس مرونة الكبد (FibroScan/VCTE) أو تحليل ELF لتحديد الخطر بدقة.',
                    summaryEn: 'The value is in the indeterminate zone. This is common and does not confirm fibrosis. Guidelines (AGA 2026, EASL-EASD-EASO 2024) recommend a second test such as liver stiffness measurement (FibroScan/VCTE) or ELF to stratify risk accurately.',
                    labelAr: 'خلال نحو 3 أشهر لإجراء الفحص التأكيدي (موعد تقريبي يحدده طبيبك)', labelEn: 'Within about 3 months for the confirmatory test (approximate; your doctor decides)',
                    panelAr: ['قياس مرونة الكبد FibroScan (VCTE) أو تحليل ELF', 'AST وALT وصورة دم كاملة', 'HbA1c ودهون الدم', 'فحص فيروسات الكبد (HCV/HBV) إن لم يُجرَ من قبل'],
                    panelEn: ['Liver stiffness: FibroScan (VCTE) or ELF test', 'AST, ALT and CBC', 'HbA1c and lipid profile', 'HCV/HBV screening if never done'],
                    docAr: 'احجز مع طبيب باطنة أو جهاز هضمي لترتيب الفحص التأكيدي.', docEn: 'Book with an internist or gastroenterologist to arrange the confirmatory test.'
                },
                high: {
                    color: '#9B2F2A', badgeClass: 'badge-danger', months: 1,
                    titleAr: 'يُوصى بتقييم أخصائي كبد', titleEn: 'Specialist evaluation recommended',
                    badgeAr: 'يُنصح بمراجعة أخصائي 🩺', badgeEn: 'Specialist review advised 🩺',
                    summaryAr: 'القيمة أعلى من 2.67، وهو الحد المرتبط باحتمال أعلى للتليف المتقدم. يُنصح بتقييم عند أخصائي كبد أو جهاز هضمي مع فحص مرونة الكبد. هذه نتيجة فحص أولي وليست تشخيصاً.',
                    summaryEn: 'The value is above 2.67, the threshold linked to a higher likelihood of advanced fibrosis. Evaluation by a hepatologist/gastroenterologist with liver stiffness testing is advised. This is a screening result, not a diagnosis.',
                    labelAr: 'خلال 2 إلى 4 أسابيع', labelEn: 'Within 2 to 4 weeks',
                    panelAr: ['استشارة أخصائي كبد/جهاز هضمي', 'سونار على البطن + FibroScan', 'Albumin وBilirubin وINR', 'استبعاد أسباب أخرى (فيروسات، مناعة ذاتية، حديد)'],
                    panelEn: ['Hepatology/GI consultation', 'Abdominal ultrasound + FibroScan', 'Albumin, bilirubin, INR', 'Exclude other causes (viral, autoimmune, iron)'],
                    docAr: 'يرجى حجز موعد قريب مع أخصائي كبد لمراجعة النتائج.', docEn: 'Please book a prompt appointment with a hepatologist to review your results.'
                }
            }[tier];

            let base = C.parseLocalDate(testDateStr) || today;
            const nextDate = C.addMonths(base, T.months);
            return {
                tier, titleAr: T.titleAr, titleEn: T.titleEn, statusBadgeAr: T.badgeAr, statusBadgeEn: T.badgeEn,
                badgeClass: T.badgeClass, color: T.color, summaryAr: T.summaryAr, summaryEn: T.summaryEn,
                nextLabMonths: T.months, nextLabLabelAr: T.labelAr, nextLabLabelEn: T.labelEn,
                nextLabDate: C.toLocalISO(nextDate),
                nextLabDateFormatted: C.formatDate(nextDate, 'ar'), nextLabDateFormattedEn: C.formatDate(nextDate, 'en'),
                overdue: nextDate.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(),
                panelListAr: T.panelAr, panelListEn: T.panelEn, doctorActionAr: T.docAr, doctorActionEn: T.docEn,
                notes, needsSecondTier: tier !== 'low',
                _internalRaw: { fib4, meld, fibTier, meldTier, lowCutoff: cut.low, highCutoff: cut.high }
            };
        },

        // ------------------------------------------------------------------
        // 8. Activity recommendation. Net kcal = (MET-1) * kg * hours (conservative).
        // Guidance: >=150 min/wk moderate activity + resistance 2x/wk; benefits exist even without weight loss.
        // ------------------------------------------------------------------
        generateActivityRecommendation(activityLevel = 'light', weightKg = 80, bmi = 28) {
            const L = (activityLevel === 'sedentary' || bmi >= 35) ? 'start' : activityLevel;
            const P = {
                start: { met: 3.0, min: 25, ar: 'مشي خفيف ومنتظم (بداية تدريجية)', en: 'Easy regular walking (gradual start)', dAr: 'مشي مريح 25 دقيقة يومياً، ويمكن تقسيمها (15 دقيقة صباحاً و10 بعد الغداء). زِد المدة تدريجياً.', dEn: 'Easy 25-minute walk daily, can be split (15 min morning, 10 after lunch). Increase gradually.', tAr: 'ارتدِ حذاء مريحاً وتجنب الإجهاد المفاجئ على المفاصل.', tEn: 'Wear comfortable shoes and avoid sudden joint strain.' },
                light: { met: 4.3, min: 35, ar: 'مشي سريع بوتيرة تسمح بالكلام', en: 'Brisk walking (talk-test pace)', dAr: 'مشي سريع 35 دقيقة بحيث تتنفس أسرع قليلاً مع قدرتك على الحديث. الهدف 150 دقيقة أسبوعياً على الأقل.', dEn: 'Brisk 35-minute walk at a pace where you breathe faster but can still talk. Aim for at least 150 min/week.', tAr: 'النشاط يفيد الكبد حتى لو لم ينزل الوزن بسرعة.', tEn: 'Activity benefits the liver even before weight changes.' },
                moderate: { met: 5.0, min: 40, ar: 'مشي نشط + تمارين مقاومة خفيفة', en: 'Brisk activity + light resistance', dAr: '30 دقيقة مشي نشط أو دراجة، ثم 10 دقائق تمارين بوزن الجسم (قرفصاء، ضغط على الحائط). كرر المقاومة مرتين أسبوعياً.', dEn: '30 min brisk walking or cycling, then 10 min bodyweight exercises (squats, wall push-ups). Do resistance twice weekly.', tAr: 'بناء العضلات يحسّن حساسية الأنسولين.', tEn: 'Building muscle improves insulin sensitivity.' },
                active: { met: 7.0, min: 45, ar: 'برنامج لياقة متنوع', en: 'Varied conditioning program', dAr: 'هرولة خفيفة أو تمارين دائرية 45 دقيقة مع يومين مقاومة أسبوعياً وأيام راحة.', dEn: '45 min light jogging or circuit training, two resistance days weekly, plus rest days.', tAr: 'تناول وجبة بروتين بعد التمرين وحافظ على الترطيب.', tEn: 'Have a protein meal after training and stay hydrated.' }
            }[L];
            const kcal = Math.max(0, Math.round((P.met - 1) * weightKg * (P.min / 60)));
            return {
                titleAr: P.ar, titleEn: P.en, targetDurationMinutes: P.min, caloriesBurnEstimate: kcal,
                descriptionAr: P.dAr, descriptionEn: P.dEn, tipsAr: P.tAr, tipsEn: P.tEn,
                safetyAr: 'لو عندك ألم بالصدر أو ضيق نفس أو دوخة أو مرض قلب، استشر طبيبك قبل بدء أي برنامج.',
                safetyEn: 'If you have chest pain, breathlessness, dizziness or heart disease, consult your doctor before starting.'
            };
        },

        // ------------------------------------------------------------------
        // 9. Red-flag triage for the FAQ assistant (symptoms needing urgent care)
        // ------------------------------------------------------------------
        detectRedFlags(text) {
            const t = String(text || '').toLowerCase();
            const ar = ['اصفرار', 'يرقان', 'قيء دم', 'تقيأ دم', 'استفراغ دم', 'براز اسود', 'براز أسود', 'دم في البراز', 'ارتباك', 'تشوش', 'غيبوبة', 'انتفاخ البطن', 'استسقاء', 'ألم شديد في البطن', 'الم شديد', 'نزيف', 'ضيق تنفس شديد', 'ألم في الصدر', 'الم في الصدر', 'إغماء', 'اغماء'];
            const en = ['jaundice', 'yellow skin', 'yellow eyes', 'vomiting blood', 'vomit blood', 'black stool', 'blood in stool', 'confusion', 'coma', 'swollen belly', 'ascites', 'severe abdominal pain', 'bleeding', 'chest pain', 'fainting', 'passed out'];
            return ar.some(k => t.includes(k)) || en.some(k => t.includes(k));
        }
    };

    if (typeof window !== 'undefined') window.WekayaCalculations = C;
    if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof globalThis !== 'undefined' ? globalThis : this);
