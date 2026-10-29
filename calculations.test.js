// Run with: node --test calculations.test.js
const test = require('node:test');
const assert = require('node:assert');
const C = require('./calculations.js');

test('FIB-4 matches hand calculation', () => {
    assert.strictEqual(C.calculateFIB4(46, 34, 235, 42), 1.03);
    assert.strictEqual(C.calculateFIB4(46, 34, 235000, 42), 1.03); // 10^3/uL input is normalised
    assert.strictEqual(C.calculateFIB4(46, 34, 0, 42), null);
});

test('FIB-4 cut-offs: 1.3 (2.0 if >=65) and 2.67', () => {
    assert.deepStrictEqual(C.fib4Cutoffs(46), { low: 1.3, high: 2.67 });
    assert.deepStrictEqual(C.fib4Cutoffs(65), { low: 2.0, high: 2.67 });
});

test('tier logic follows FIB-4 first, MELD only escalates', () => {
    const t = o => C.interpretLiverHealth(Object.assign({ age: 46, testDateStr: '2026-09-15', todayStr: '2026-10-23' }, o)).tier;
    assert.strictEqual(t({ fib4: 1.0, meld: null }), 'low');
    assert.strictEqual(t({ fib4: 1.0, meld: 6 }), 'low');
    assert.strictEqual(t({ fib4: 1.0, meld: 12 }), 'moderate'); // was 'high' in v1 (bug)
    assert.strictEqual(t({ fib4: 1.0, meld: 16 }), 'high');
    assert.strictEqual(t({ fib4: 1.3 }), 'moderate');
    assert.strictEqual(t({ fib4: 2.67 }), 'moderate');
    assert.strictEqual(t({ fib4: 2.68 }), 'high');
    assert.strictEqual(t({ fib4: 1.8, age: 70 }), 'low');
    assert.strictEqual(t({ fib4: 1.8, age: 46 }), 'moderate');
    assert.strictEqual(t({ fib4: 1.0, hcvHbv: 'active' }), 'moderate');
    assert.strictEqual(C.interpretLiverHealth({ fib4: null }).tier, 'unknown');
});

test('moderate tier asks for a confirmatory test (VCTE/ELF)', () => {
    const r = C.interpretLiverHealth({ fib4: 1.6, age: 46, testDateStr: '2026-09-15', todayStr: '2026-10-23' });
    assert.strictEqual(r.needsSecondTier, true);
    assert.ok(r.panelListEn.join(' ').match(/FibroScan/));
});

test('next-lab date clamps month ends and flags overdue', () => {
    assert.strictEqual(C.toLocalISO(C.addMonths(C.parseLocalDate('2026-01-31'), 1)), '2026-02-28');
    assert.strictEqual(C.toLocalISO(C.addMonths(C.parseLocalDate('2028-01-31'), 1)), '2028-02-29');
    const r = C.interpretLiverHealth({ fib4: 1.0, age: 46, testDateStr: '2024-01-10', todayStr: '2026-10-23' });
    assert.strictEqual(r.overdue, true);
    const r2 = C.interpretLiverHealth({ fib4: 1.0, age: 46, testDateStr: '2026-09-15', todayStr: '2026-10-23' });
    assert.strictEqual(r2.overdue, false);
});

test('local date helpers do not shift by UTC offset', () => {
    const d = new Date(2026, 9, 23, 0, 30); // 00:30 local
    assert.strictEqual(C.toLocalISO(d), '2026-10-23');
    assert.strictEqual(C.ageAt('1980-10-24', '2026-10-23'), 45);
    assert.strictEqual(C.ageAt('1980-10-23', '2026-10-23'), 46);
});

test('MELD formula and bounds', () => {
    assert.strictEqual(C.calculateMELD(0.95, 0.9, 1.05), 7);
    assert.strictEqual(C.calculateMELD(1.5, 4, 1.8), 22);
    assert.strictEqual(C.calculateMELD(null, 1, 1), null);
});

test('eGFR CKD-EPI 2021', () => {
    const e = C.calculateEGFR(1.0, 50, 'male');
    assert.ok(e >= 91 && e <= 93, 'got ' + e);
    assert.ok(C.calculateEGFR(0.95, 46, 'male') >= 98);
    assert.ok(C.calculateEGFR(2.0, 60, 'male') < 60);
});

test('calorie plan depends on BMI (no deficit for normal/underweight)', () => {
    const lean = C.calculateCaloricNeeds({ weight: 60, height: 175, age: 25, gender: 'male', activityLevel: 'sedentary' });
    assert.strictEqual(lean.goal, 'maintain');
    assert.strictEqual(lean.targetCalories, lean.tdee);
    const over = C.calculateCaloricNeeds({ weight: 84.5, height: 172, age: 46, gender: 'male', activityLevel: 'light' });
    assert.strictEqual(over.goal, 'lose');
    assert.strictEqual(over.targetCalories, over.tdee - 500);
    const f = C.calculateCaloricNeeds({ weight: 70, height: 155, age: 30, gender: 'female', activityLevel: 'sedentary' });
    assert.ok(f.targetCalories >= 1200);
    assert.strictEqual(C.calculateCaloricNeeds({ weight: 80, height: 170, age: 16 }).blocked, true);
    const preg = C.calculateCaloricNeeds({ weight: 84, height: 165, age: 30, gender: 'female', pregnantOrBreastfeeding: true });
    assert.strictEqual(preg.deficit, 0);
});

test('reduced eGFR caps protein at 0.8 g/kg', () => {
    const r = C.calculateCaloricNeeds({ weight: 90, height: 170, age: 50, gender: 'male', activityLevel: 'light', egfr: 45 });
    assert.ok(r.macros.protein <= 72);
});

test('weight-loss ladder only for BMI >= 25', () => {
    assert.strictEqual(C.weightGoal(C.calculateBMI(65, 175), 65).applicable, false);
    const g = C.weightGoal(C.calculateBMI(90, 170), 90);
    assert.deepStrictEqual(g.steps.map(s => s.pct), [5, 7, 10]);
    assert.strictEqual(g.steps[1].kg, 6.3);
});

test('alcohol categories (MASLD / MetALD / ALD ranges)', () => {
    assert.strictEqual(C.alcoholCategory('male', 0).key, 'masld_range');
    assert.strictEqual(C.alcoholCategory('male', 16).key, 'metald'); // 224 g/wk
    assert.strictEqual(C.alcoholCategory('female', 11).key, 'metald'); // 154 g/wk
    assert.strictEqual(C.alcoholCategory('female', 30).key, 'ald_range'); // 420 g/wk
});

test('activity calories scale with body weight', () => {
    const a = C.generateActivityRecommendation('light', 60, 28).caloriesBurnEstimate;
    const b = C.generateActivityRecommendation('light', 100, 28).caloriesBurnEstimate;
    assert.ok(b > a);
});

test('red-flag symptoms are detected in Arabic and English', () => {
    assert.ok(C.detectRedFlags('عندي اصفرار في العين'));
    assert.ok(C.detectRedFlags('I have black stool'));
    assert.ok(!C.detectRedFlags('ما هي الأطعمة الممنوعة؟'));
});
