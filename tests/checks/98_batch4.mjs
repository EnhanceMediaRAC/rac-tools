// Checks for the fourth feedback batch (user decisions, 23 September 2026):
// the table columns that must add to their totals, the CPA adjustments at four
// decimals, the note that says what the rounding does, the cost per hire
// limit's cap and the reason a limit did not bind, the shorter cost per hire
// label, the method numbering around Months used and the OneRAC section, and
// the OneRAC plan's own notes.
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
  const build = (role, inputs) => RAC.plan.build(role, inputs, env(role));

  const main = (c) => (Array.isArray(c) ? c[0] : c);
  const num = (s) => (s === '-' || s === '' || s === undefined ? null : Number(String(s).replace(/[£,]/g, '')));
  const colIndex = (t) => { const i = {}; t.columns.forEach((c, k) => { i[c.key] = k; }); return i; };

  check('Every column that has a total adds up to it in print', () => {
    let tables = 0, rows = 0;
    for (const [role, inputs] of [['SMR', SMR], ['Patrol', PAT]]) {
      for (const t of RAC.tables.all(build(role, inputs))) {
        const i = colIndex(t);
        const body = t.rows.filter(r => !r.total), total = t.rows.find(r => r.total);
        assert(total, `${role} ${t.title}: no total row`);
        tables++; rows += body.length;
        for (const key of ['spend', 'media', 'fee', 'apps', 'hires']) {
          const sum = body.reduce((a, r) => a + (num(main(r.cells[i[key]])) || 0), 0);
          const shown = num(main(total.cells[i[key]]));
          if (shown === null) continue;   // fee column off for Appcast
          const unit = key === 'fee' ? 0.01 : key === 'apps' ? 0.1 : key === 'hires' ? 0.01 : 1;
          near(sum, shown, unit / 2 + 1e-9, `${role} ${t.title}: the ${key} rows do not add to the printed total`);
        }
      }
    }
    return `${tables} tables, ${rows} rows: spend, fee, media, predicted applies and predicted hires each add to their printed total`;
  });

  check('CPA adjustments print to four decimals and their three parts multiply to them', () => {
    let n = 0, worst = 0, worstRow = '';
    for (const [role, inputs] of [['SMR', SMR], ['Patrol', PAT]]) {
      const plan = build(role, inputs);
      for (const q of P) {
        const t = RAC.tables.cells(plan, q);
        const i = colIndex(t);
        for (const r of t.rows) {
          const cell = r.cells[i.adj];
          if (r.total || !Array.isArray(cell)) continue;
          const combined = main(cell);
          assert(/^x\d\.\d{4}$/.test(combined), `${role} ${r.label}: CPA adjustments "${combined}" is not four decimals`);
          const parts = String(cell[1]).split(' x ');
          assert(parts.length === 3 && parts.every(x => /^\d\.\d{4}$/.test(x)), `${role} ${r.label}: the three parts are not four decimals ("${cell[1]}")`);
          const d = Math.abs(parts.reduce((a, b) => a * Number(b), 1) - Number(combined.slice(1)));
          if (d > worst) { worst = d; worstRow = `${role} ${r.label}`; }
          // At three decimals this reached 0.0016, which showed in the third
          // place. At four it stays inside one in the last place printed,
          // which is as close as rounded parts can get.
          assert(d <= 0.0002, `${role} ${r.label}: the parts multiply to ${parts.reduce((a, b) => a * Number(b), 1).toFixed(6)}, not ${combined}`);
          // And base x adjustments reproduces the plan cost per application.
          const base = num(main(r.cells[i.base])), cpa = num(main(r.cells[i.cpa]));
          if (base !== null && cpa !== null) near(base * Number(combined.slice(1)), cpa, 0.05, `${role} ${r.label}: base x adjustments against plan CPA`);
          n++;
        }
      }
    }
    return `${n} funded rows; worst gap between the three parts and the combined figure ${worst.toExponential(1)} (${worstRow})`;
  });

  check('Every table says what the rounding does', () => {
    const plan = build('SMR', SMR);
    const tables = RAC.tables.all(plan);
    tables.forEach(t => assert((t.notes || []).includes(RAC.tables.ROUNDING_NOTE), `${t.title}: no rounding note`));
    assert(/up to £1/.test(RAC.tables.ROUNDING_NOTE), 'the note does not say how far a row can be out');
    assert(RAC.outputChecks.text(RAC.tables.ROUNDING_NOTE).length === 0, 'the rounding note fails the output checks');
    const doc = { role: 'SMR', roleName: 'SMR (test)', plan, commentary: { legacy: [], plan: [] } };
    const pdf = RAC.pdf.build(FakePDF, [doc], { monthLabel: 'October 2026', backtest: bt, code: { commit: 'abc1234' } });
    assert(pdf.texts.some(s => s.includes('adds to its total')), 'the rounding note does not reach the PDF');
    return `${tables.length} tables carry the note, and it is drawn in the PDF`;
  });

  check('A cost per hire limit shows the cap it replaced, and a limit says what held it below', () => {
    // Every reason the panel can print is a reason the planner can give.
    const reasons = Object.keys(RAC.plan.NOTE_TEXT);
    reasons.forEach(r => assert(RAC.plan.HELD_BY_TEXT[r], `no wording for the reason "${r}"`));
    const plan = build('SMR', { ...SMR, limits: { cph: { 'South East': 3000 } } });
    const se = plan.locations.find(l => l.region === 'South East');
    assert(se.capWithoutCph > se.cap, `the cost per hire limit should be tighter than the cap without it (${se.cap} against ${se.capWithoutCph})`);
    assert(se.capReason === 'cost per hire limit', `South East held by "${se.capReason}"`);
    assert(se.media / se.hires <= 3000 + 1, `South East cost per hire £${(se.media / se.hires).toFixed(0)} above its £3,000 limit`);
    // A cost per application limit above today's cost, on a location its
    // maximum holds: the row settles below the limit and the reason is there.
    const now = build('SMR', SMR).locations.find(l => l.region === 'East of England').cells.indeed;
    const lim = (now.media / now.apps) * 1.25;
    const p2 = build('SMR', { ...SMR, limits: { cpa: { 'East of England': { indeed: lim } } } });
    const l2 = p2.locations.find(l => l.region === 'East of England');
    const c2 = l2.cells.indeed;
    assert(c2.cap > c2.capNormal, 'the limit did not raise the row above its spending cap');
    assert(c2.spend < c2.cap - 1, 'this row should settle below its limit');
    assert(l2.spend >= l2.cap - 1 && l2.capReason === 'location maximum', `expected the location maximum to hold it, not "${l2.capReason}"`);
    const ui = readRoot('ui/cost_limits.jsx');
    assert(/cap without it/.test(ui) && /held below the limit by/.test(ui), 'the panel does not print the cap and the reason');
    assert(/HELD_BY_TEXT/.test(ui), 'the panel does not use the planner’s wording');
    return `South East at its £3,000 cost per hire limit: cap £${se.cap.toFixed(0)} against £${se.capWithoutCph.toFixed(0)} without it; East of England Indeed at £${c2.spend.toFixed(0)} under a cap of £${c2.cap.toFixed(0)}, held by its ${RAC.plan.HELD_BY_TEXT[l2.capReason]}`;
  });

  check('Cost per hire is labelled once, and says it counts paid-media hires only', () => {
    const plan = build('SMR', SMR);
    const doc = { role: 'SMR', roleName: 'SMR (test)', plan, commentary: { legacy: [], plan: [] } };
    const pdf = RAC.pdf.build(FakePDF, [doc], { monthLabel: 'October 2026', backtest: bt, code: { commit: 'abc1234' } });
    const w = RAC.workings.build([doc], { monthLabel: 'October 2026', backtest: bt, code: { commit: 'abc1234' } });
    const text = pdf.texts.join('\n');
    assert(text.includes('Cost per hire (media)'), 'the PDF does not carry the shorter label');
    assert(!/Cost per hire, paid media/.test(text + w.texts.join('\n')), 'the old label is still there');
    assert(text.includes('paid media hires only'), 'nothing beside it says the hires are paid media only');
    assert(w.texts.join('\n').includes('Cost per hire (media)'), 'the workings do not carry the shorter label');
    return 'PDF summary: "Cost per hire (media)" with "paid media hires only" beside it; the workings match';
  });

  check('The method points run in one sequence, with Months used and OneRAC as single points', () => {
    const plan = build('SMR', SMR);
    const secs = RAC.text.method(A, 'SMR', plan, bt);
    const numbered = [];
    const unnumbered = {};
    secs.forEach(s => s.paras.forEach(t => {
      const m = /^(\d+)\. /.exec(t);
      if (m) numbered.push(Number(m[1]));
      else unnumbered[s.heading] = (unnumbered[s.heading] || 0) + 1;
    }));
    numbered.forEach((v, i) => assert(v === i + 1, `the numbering jumps at point ${v} (expected ${i + 1})`));
    const months = secs.find(s => s.heading === 'Months used');
    assert(months && /^\d+\. /.test(months.paras[0]), 'Months used does not open with a numbered point');
    assert(months.paras.slice(1).every(t => !/^\d+\. /.test(t)), 'the Months used lines are numbered one by one');
    assert(months.paras.length > 4, 'Months used lost its lines');
    // The numbering carries on after it, rather than restarting.
    const ranges = secs.find(s => s.heading === 'Ranges');
    assert(Number(/^(\d+)\./.exec(ranges.paras[0])[1]) === Number(/^(\d+)\./.exec(months.paras[0])[1]) + 1, 'the point after Months used does not follow it');
    return `${numbered.length} points, 1 to ${numbered.length}, with Months used as point ${/^(\d+)\./.exec(months.paras[0])[1]} and ${months.paras.length - 1} lines under it`;
  });

  check('OneRAC has its own notes, and a PDF with and without them', () => {
    const one = RAC.onerac.build({
      ...SMR, regions: ['London'], vacancies: { SMR: { London: 18 }, Patrol: { London: 12 } },
      budget: 20000, hireTarget: 6, premiumCampaigns: 0, acReserve: 0,
      platMin: {}, platMax: {}, coverage: {}, comboMin: {}, regionMin: {}, regionMax: {}, limits: {},
    }, env('SMR'));
    assert(one, 'no OneRAC plan built');
    const secs = RAC.text.method(one.A, 'OneRAC', one, bt);
    const oneSec = secs.find(s => s.heading === 'The OneRAC plan');
    assert(oneSec && /^\d+\. /.test(oneSec.paras[0]), 'the OneRAC section does not open with a numbered point');
    assert(oneSec.paras.slice(1).every(t => !/^\d+\. /.test(t)), 'the OneRAC lines are numbered one by one');
    const notes = ['The first OneRAC month runs from the 6th.', 'London only until a second region is added.'];
    const doc = { role: 'OneRAC', roleName: 'OneRAC (SMR and Patrol together)', plan: one, commentary: { legacy: [], plan: notes } };
    const opts = { monthLabel: 'October 2026', backtest: bt, code: { commit: 'abc1234' } };
    const withNotes = RAC.pdf.build(FakePDF, [doc], opts);
    const without = RAC.pdf.build(FakePDF, [doc], { ...opts, notes: false });
    notes.forEach(t => assert(withNotes.texts.some(s => s.includes(t.slice(0, 30))), 'the OneRAC PDF left out a note: ' + t));
    notes.forEach(t => assert(!without.texts.some(s => s.includes(t.slice(0, 30))), 'PDF, no notes still carries a note'));
    assert(withNotes.texts.includes('Notes on this plan'), 'no notes section in the OneRAC PDF');
    assert(!without.texts.includes('Notes on this plan'), 'the no-notes version still has the section');
    assert(withNotes.problems.length === 0, 'the OneRAC PDF failed the output checks: ' + withNotes.problems.join('; '));
    // The tab offers both, the state holds the notes and the export passes them on.
    const tab = readRoot('ui/onerac_tab.jsx');
    assert(/onerac-pdf-no-notes/.test(tab) && /onExportPdf\(\{ notes: true \}\)/.test(tab), 'the OneRAC tab does not offer both exports');
    assert(/data-panel="onerac-notes"/.test(tab), 'the OneRAC tab has no notes box');
    const html = readRoot('index.html');
    assert(/commentary: \{ SMR: '', Patrol: '', OneRAC: '' \}/.test(html), 'OneRAC notes are not in the saved plan');
    assert(/\(opts && opts\.notes\) !== false, monthLabel/.test(html), 'the OneRAC export still forces notes off');
    return `${notes.length} notes printed in the OneRAC PDF and left out of the no-notes version; the OneRAC method section is point ${/^(\d+)\./.exec(oneSec.paras[0])[1]}`;
  });
}
