// Checks for the second feedback batch (user decisions, 22 September 2026;
// BUILD_PLAN 0l and 0m): the budget search and location minimums (X6), the
// VAF rule, cost per application limits replacing a row's spending cap,
// rolling caps from January 2027, the shared tables and their totals, and the
// wording RAC sees.
import { loadPlanner, loadAssumptions, readRoot } from '../lib/planner.mjs';
import { calibrationData } from '../lib/calibration_data.mjs';
import { septSmrSettings, septPatrolSettings } from '../lib/fixtures.mjs';
import { FakePDF } from '../lib/fake_pdf.mjs';

export default function (check, { assert, near }) {
  const RAC = loadPlanner();
  const A = loadAssumptions(RAC);
  const eploy = JSON.parse(readRoot('data/eploy_rates.json'));
  const bt = JSON.parse(readRoot('data/backtest_results.json'));
  const D = calibrationData(RAC);
  const P = RAC.PLATFORMS;
  const FPAT = JSON.parse(readRoot('tests/fixtures/patrol_sept_live_2026-09.json'));
  const pvac = {};
  Object.keys(FPAT.cells).forEach(k => { pvac[k.split('|')[0]] = FPAT.cells[k].openRoles; });
  const SMR = { ...septSmrSettings(RAC.plan.NO_SPEND), planMonth: '2026-10', daysInMonth: 31, capMultiple: 1 };
  const PAT = { ...septPatrolSettings(pvac), planMonth: '2026-10', daysInMonth: 31, capMultiple: 1 };
  const env = (role) => ({ ds: D[role].ds, A, eploy });
  const build = (role, inputs, e = env(role)) => RAC.plan.build(role, inputs, e);
  const cells = (p) => p.locations.flatMap(l => P.map(q => l.cells[q]));

  check('X6: the budget for the target never rests on minimums the budget cannot pay for', () => {
    const p = build('Patrol', PAT);
    assert(!p.unreachable && p.budgetForTarget > 5000, `Patrol budget for 16 hires £${p.budgetForTarget}`);
    // At the answer the minimums fit; £50 less, they would place more than the budget has.
    const at = RAC.plan.allocate(RAC.plan.prepare('Patrol', PAT, env('Patrol')), { ...PAT, budget: p.budgetForTarget }, false);
    assert(at.placed <= at.deployable + 0.5, `at £${p.budgetForTarget} the plan places £${at.placed.toFixed(0)} of £${at.deployable.toFixed(0)}`);
    const less = RAC.plan.allocate(RAC.plan.prepare('Patrol', PAT, env('Patrol')), { ...PAT, budget: p.budgetForTarget - 50 }, false);
    assert(less.placed > less.deployable + 0.5 || less.totals.hires < p.paidGoal, '£50 less should not reach the target');
    // Its parts add up (point 30).
    assert(p.budgetForTarget >= p.atTarget.holdbacks + p.atTarget.placed - 0.5 && p.budgetForTarget - (p.atTarget.holdbacks + p.atTarget.placed) < 50.5, 'budget = hold-backs + placed, rounded up to £50');
    near(p.paidGoal, 16 - p.totals.otherHires, 1e-9, 'paid-media hires needed');
    return `Patrol, September settings: £${p.budgetForTarget.toLocaleString('en-GB')} for 16 hires (was £5,000 before the fix): hold-backs £${p.atTarget.holdbacks.toLocaleString('en-GB')} plus £${Math.round(p.atTarget.placed).toLocaleString('en-GB')} placed, which buys ${p.atTarget.paidHires.toFixed(1)} paid-media hires against ${p.paidGoal.toFixed(1)} needed; £50 less cannot pay for the minimums`;
  });

  check('Out of reach: the most hires and the total budget they need, with its parts', () => {
    const p = build('SMR', SMR);
    assert(p.unreachable && p.reach, 'SMR 30 hires should be out of reach at x1');
    const s = p.atSaturation;
    assert(p.saturationBudget >= s.placed + s.holdbacks - 0.5 && p.saturationBudget - (s.placed + s.holdbacks) < 50.5, 'total budget = placed + held back, rounded up');
    near(p.maxAchievable, s.paidHires + p.totals.otherHires, 1e-9, 'most hires = paid + other sources');
    const t = RAC.text.targetText(p);
    assert(t.value === `most ${RAC.text.fmt.num(p.maxAchievable)} hires, needing a total budget of ${RAC.text.fmt.gbp(p.saturationBudget)} (${RAC.text.fmt.gbp(s.placed)} placed plus ${RAC.text.fmt.gbp(s.holdbacks)} held back)`, t.value);
    assert(RAC.text.reachSentence(p) === `Spend above ${RAC.text.fmt.gbp(p.saturationBudget)} has not successfully driven results: every location and platform would be above the largest month that worked for it, so the plan does not place it.`, 'point 12 wording');
    return t.value;
  });

  check('VAF rule: a location’s paid-media hires never exceed its VAFs, and the money moves', () => {
    // A small location given a large share: Scotland with 2 VAFs, and every
    // cap multiplied so only the VAF rule can hold it.
    const inputs = { ...SMR, capMultiple: 3, regionMax: { London: RAC.plan.NO_SPEND }, efficiency: 1, budget: 400000 };
    const p = build('SMR', inputs);
    const over = p.locations.filter(l => l.hires > l.vacancies + 1e-6);
    assert(!over.length, 'over their VAFs: ' + over.map(l => `${l.region} ${l.hires.toFixed(2)} of ${l.vacancies}`).join(', '));
    const held = p.locations.filter(l => l.capReason === 'hires held to its VAFs' && l.spend >= l.cap - 1);
    assert(held.length > 0, 'expected a location held by the VAF rule');
    held.forEach(l => { near(l.hires, l.vacancies, 0.01, `${l.region} held at its VAFs`); assert(l.notes.includes('Hires held to its VAFs'), `${l.region} note`); });
    near(p.holdbacks.total + p.placed + p.unplaced.total, inputs.budget, 0.01, 'budget conserved');
    return `at £400,000, x3 and full efficiency: ${held.map(l => `${l.region} held at ${l.hires.toFixed(2)} hires for ${l.vacancies} VAFs`).join(', ')}; no location above its VAFs; budget conserved`;
  });

  check('A cost per application limit replaces the row’s spending cap, and never changes the successful months', () => {
    const plain = build('SMR', SMR);
    const c0 = plain.locations.find(l => l.region === 'South East').cells.indeed;
    const above = Math.round(c0.plannedCpaMedia * 1.25);
    const lim = build('SMR', { ...SMR, limits: { cpa: { 'South East': { indeed: above } } } });
    const l1 = lim.locations.find(l => l.region === 'South East'), c1 = l1.cells.indeed;
    // Spend continues until the planned cost per application on media reaches
    // the limit, above the normal cap (unless the location maximum holds it).
    assert(c1.capByLimit && c1.cap > c1.capNormal, 'limit above cost should allow more than the normal cap');
    near(c1.cap / (1 + c1.feeRate), RAC.ceilings.spendAtCpaLimit(RAC.plan.prepare('SMR', { ...SMR, limits: { cpa: { 'South East': { indeed: above } } } }, env('SMR')).cells['South East'].indeed.pc, above) / (1 + c1.feeRate), 1e-6, 'cap from the limit');
    const forecastAtCap = RAC.forecast.at(RAC.plan.prepare('SMR', SMR, env('SMR')).cells['South East'].indeed.pc, c1.cap);
    near(forecastAtCap.cpaMedia, above, 1e-6, 'media cost per application at the new cap equals the limit');
    near(l1.limitExtra, c1.cap - c1.capNormal, 1e-6, 'location cap raised by the extra the row is allowed');
    assert(l1.notes.includes('Spend set by the cost limit for this plan'), 'location note: ' + l1.notes.join('; '));
    // The successful months are identical with and without the limit.
    assert(JSON.stringify(c1.ceilingMonths) === JSON.stringify(c0.ceilingMonths) && c1.ceiling === c0.ceiling, 'a limit changed the successful months');
    // A limit below today's cost still lowers spend.
    const below = Math.round(c0.plannedCpaMedia * 0.8);
    const c2 = build('SMR', { ...SMR, limits: { cpa: { 'South East': { indeed: below } } } }).locations.find(l => l.region === 'South East').cells.indeed;
    assert(c2.spend < c0.spend - 1 && Math.abs(c2.plannedCpaMedia - below) < 1e-6, `limit £${below}: spend £${c2.spend.toFixed(0)}, media cost £${c2.plannedCpaMedia.toFixed(2)}`);
    // The summary names the row, and says whether it is above past levels.
    const pts = RAC.text.capsPoint(lim).join(' ');
    assert(/Spend set by a cost limit for this plan, in place of the spending cap: South East Indeed/.test(pts), pts);
    return `South East Indeed: limit £${above} (125% of £${c0.plannedCpaMedia.toFixed(2)}) lets the row reach £${c1.cap.toFixed(0)} against a normal cap of £${c1.capNormal.toFixed(0)}; spend £${c0.spend.toFixed(0)} to £${c1.spend.toFixed(0)}; limit £${below} cuts it to £${c2.spend.toFixed(0)}; successful months unchanged`;
  });

  check('Rolling caps: from January 2027 plans use the last 12 settled months, never before January 2026', () => {
    const oct = build('SMR', SMR);
    assert(oct.capFirst === '2026-01' && !oct.capsRolling, 'October 2026 caps from ' + oct.capFirst);
    // Plan months from January 2027 switch; with data to July 2026 the last 12
    // settled months reach back before January 2026, so the first month holds.
    const jan = build('SMR', { ...SMR, planMonth: '2027-01' });
    assert(jan.capFirst === '2026-01', 'January 2027 caps from ' + jan.capFirst);
    // With the switch month and length moved, the rule takes the last months.
    const A2 = RAC.assumptions.withValues(A, { ceiling_rolling_from: '2026-10', ceiling_rolling_months: 4 });
    const r = build('SMR', SMR, { ...env('SMR'), A: A2 });
    assert(r.capsRolling && r.capMonths.join() === '2026-04,2026-05,2026-06,2026-07', 'rolling months ' + r.capMonths.join());
    const c = r.locations.find(l => l.region === 'South East').cells.indeed;
    assert(c.ceilingMonths.every(m => m.month >= '2026-04'), 'a cap looked at an earlier month');
    const text = RAC.text.method(A, 'SMR', oct, bt).flatMap(s => s.paras).join(' ');
    assert(/From plans for January 2027, the caps use the last 12 settled months/.test(text), 'method text does not record the switch');
    return `October 2026 and January 2027 caps from January 2026 (data to July 2026); with the rule set to 4 months from October 2026: ${r.capMonths.join(', ')}; the method text records the January 2027 switch`;
  });

  check('Tables: one column set in the agreed order, totals are the sums of the rows, and the Plan tab uses the same tables', () => {
    const p = build('SMR', SMR);
    const T = RAC.tables.all(p);
    const common = ['Total spend', 'Fee', 'Media', 'Plan CPA (media)', 'Predicted applies', 'Quality rate', 'Hire rate from quality applies', 'Hire adjustment', 'Plan CPH (media)', 'Predicted hires'];
    const labels = (t) => t.columns.map(c => c.label);
    assert(labels(T[0]).join('|') === ['Location', ...common, 'Notes', 'VAFs'].join('|'), 'location columns ' + labels(T[0]).join(', '));
    assert(labels(T[1]).join('|') === ['Platform', ...common].join('|'), 'platform columns ' + labels(T[1]).join(', '));
    T.slice(2).forEach(t => assert(labels(t).join('|') === ['Location', 'Total spend', 'Fee', 'Media', 'Base CPA', 'CPA adjustments', ...common.slice(3)].join('|'), `${t.title} columns ` + labels(t).join(', ')));
    // Plan level: location and platform totals are the sums of the cells.
    const all = cells(p);
    const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
    ['spend', 'fee', 'media', 'apps', 'passed', 'hires'].forEach(k => {
      near(sum(p.locations, k), sum(all, k), 1e-6, `locations ${k}`);
      near(sum(P.map(q => p.platforms[q]), k), sum(all, k), 1e-6, `platforms ${k}`);
      near(p.totals[k], sum(all, k), 1e-6, `total ${k}`);
      p.locations.forEach(l => near(l[k], sum(P.map(q => l.cells[q]), k), 1e-6, `${l.region} ${k}`));
    });
    near(p.totals.cpa, p.totals.media / p.totals.apps, 1e-9, 'total cost per application = media / applications');
    near(p.totals.cph, p.totals.media / p.totals.hires, 1e-9, 'total cost per hire = media / hires');
    near(p.totals.hireRate * p.totals.hireAdjustment * p.totals.passed, p.totals.hires, 1e-6, 'hire rate from quality applications, totals over totals');
    // Printed money columns add up to the printed totals in every table.
    const num = (s) => Number(String(s).replace(/[£,]/g, ''));
    T.forEach(t => [1, 2, 3].forEach(ci => {
      const body = t.rows.filter(r => !r.total).map(r => r.cells[ci]).filter(v => typeof v === 'string' && v !== '-');
      const total = t.rows.find(r => r.total).cells[ci];
      if (total === '-' || !body.length) return;
      near(body.reduce((a, v) => a + num(v), 0), num(total), 0.011, `${t.title} ${t.columns[ci].label} rows add to the total`);
    }));
    // Every funded row: base CPA x CPA adjustments = plan CPA, and no cost per
    // hire under 0.1 hires.
    let n = 0;
    all.filter(c => c.spend > 0.005).forEach(c => {
      near(c.baseCpa * c.cpaAdjustments, c.plannedCpaMedia, 1e-9, `${c.region} ${c.platform} base x adjustments`);
      n++;
    });
    T.forEach(t => t.rows.forEach(r => { if (r.hires !== undefined && r.hires < RAC.tables.MIN_HIRES_FOR_CPH) assert(r.cph === '-', `${r.label} shows a cost per hire on ${r.hires.toFixed(2)} hires`); }));
    // The Plan tab renders these same tables (ui/plan_panels.jsx).
    const ui = readRoot('ui/plan_panels.jsx');
    assert(/RAC\.tables\.all\(/.test(ui), 'the Plan tab does not render RAC.tables');
    return `${T.length} tables; totals equal the row sums in the plan and in print; base x adjustments = plan CPA on ${n} funded rows; no cost per hire under ${RAC.tables.MIN_HIRES_FOR_CPH} hires`;
  });

  check('RAC sees the new terms and wording, and never the old ones', () => {
    const p = build('SMR', SMR);
    const doc = { role: 'SMR', roleName: 'SMR (test)', plan: p, commentary: { legacy: [], plan: [] } };
    const pdf = RAC.pdf.build(FakePDF, [doc], { monthLabel: 'October 2026', backtest: bt, code: { commit: 'abc1234' } });
    const w = RAC.workings.build([doc], { monthLabel: 'October 2026', backtest: bt, code: { commit: 'abc1234' } });
    const text = pdf.texts.join('\n') + '\n' + w.texts.join('\n');
    for (const need of ['Real-world CPA outcome adjustment', 'Diminishing returns adjustment', 'CPA adjustments', 'Plan CPA (media)', 'Plan CPH (media)', 'Hire adjustment',
      'not modelled on the budget', 'We aim to model this in future', 'Success-test benchmark at that spend', 'Planning cost per application (media)', 'Data taken on',
      'Every platform at its spending cap', 'VAFs']) {
      assert(text.includes(need), 'missing: ' + need);
    }
    for (const gone of [/remaining[- ]error/i, /spend-level/i, /\busual (cost|monthly)/i, /Where it came from/, /Matching factor/]) assert(!gone.test(text), 'still says ' + gone);
    // The output checks refuse the old terms (broken on purpose).
    assert(RAC.outputChecks.text('A remaining-error adjustment of 1.096.').length === 1, 'old term not caught');
    assert(build('Patrol', PAT).locations.some(l => l.notes.join() === 'Full share of budget placed'), 'Patrol: no location with the full-share note');
    // Source labels: four, in RAC's words.
    assert(RAC.text.sourceLabel('agreed, informed by data') === "Set by Enhance, informed by RAC's data", 'fourth source label');
    return 'new terms present in the PDF and workings; remaining-error, spend-level, usual, "Where it came from" and "Matching factor" gone; the output checks refuse the old terms';
  });
}
