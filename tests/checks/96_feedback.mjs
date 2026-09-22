// Checks for the fixes from the test link feedback (22 September 2026). The
// numbers in the check names are the feedback points in FEEDBACK_TRIAGE.md.
import { loadPlanner, loadAssumptions, readRoot } from '../lib/planner.mjs';
import { calibrationData } from '../lib/calibration_data.mjs';
import { septSmrSettings } from '../lib/fixtures.mjs';
import { FakePDF } from '../lib/fake_pdf.mjs';

export default function (check, { assert }) {
  const RAC = loadPlanner();
  const A = loadAssumptions(RAC);
  const eploy = JSON.parse(readRoot('data/eploy_rates.json'));
  const bt = JSON.parse(readRoot('data/backtest_results.json'));
  const D = calibrationData(RAC);
  const F = RAC.text.fmt;
  const OCT = { ...septSmrSettings(RAC.plan.NO_SPEND), planMonth: '2026-10', daysInMonth: 31 };
  // The plan behind the PDF checked on the test link: £57,023, 60 hires, x1.
  const vac = { 'South East': 16, London: 18, 'South West': 11, 'East of England': 9, 'West Midlands': 8, 'East Midlands': 8, 'North West': 3, 'Yorkshire & Humber': 1, Scotland: 1 };
  const USER = { budget: 57023, appTarget: 0, hireTarget: 60, liveRegions: Object.keys(vac), vacancies: vac, coveragePct: 0, premiumCampaigns: 3, acReserve: 5000,
    platMin: {}, platMax: {}, coverage: {}, comboMin: {}, regionMin: {}, regionMax: { London: RAC.plan.NO_SPEND }, daysInMonth: 31, capMultiple: 1,
    bench: { mode: 'last3up', mult: 2 }, planMonth: '2026-10' };
  const build = (role, inputs) => RAC.plan.build(role, inputs, { ds: D[role].ds, A, eploy });
  const doc = (role, plan, commentary = { legacy: [], plan: [] }) => ({ role, roleName: `${role} (test)`, plan, commentary });
  const opts = { monthLabel: 'October 2026', planName: 'Working plan', backtest: bt, code: { commit: 'feedface00' } };
  const pdfOf = (plan, commentary) => RAC.pdf.build(FakePDF, [doc('SMR', plan, commentary)], opts);

  check('6: rounded rows add up to the rounded total', () => {
    const R = RAC.util.roundToTotal;
    const rng = RAC.util.rng(7);
    for (let k = 0; k < 500; k++) {
      const xs = Array.from({ length: 1 + Math.floor(rng() * 12) }, () => rng() * 20000);
      const r = R(xs);
      const total = xs.reduce((a, b) => a + b, 0);
      assert(r.reduce((a, b) => a + b, 0) === Math.round(total), `case ${k}: ${r.join('+')} against ${Math.round(total)}`);
      r.forEach((v, i) => assert(Math.abs(v - xs[i]) < 1, `case ${k}: row ${i} moved by ${v - xs[i]}`));
    }
    const plan = build('SMR', USER);
    const rows = R(plan.locations.map(l => l.spend));
    const naive = plan.locations.reduce((a, l) => a + Math.round(l.spend), 0);
    return `500 random columns add up after rounding, each row within £1; the test link plan's locations add to £${rows.reduce((a, b) => a + b, 0).toLocaleString('en-GB')} ` +
      `(rounding each row alone gave £${naive.toLocaleString('en-GB')} against a total of £${Math.round(plan.totals.spend).toLocaleString('en-GB')})`;
  });

  check('26: text carried onto a new page keeps its own style (no faded text)', () => {
    const HEADER = [220, 226, 236];
    const long = Array.from({ length: 40 }, (_, i) => `Note ${i + 1}: a long note written to run the commentary over more than one page, so the text after the page break can be checked for its colour and size.`);
    const out = pdfOf(build('SMR', USER), { legacy: [], plan: long });
    const pages = out.pdf.pages;
    const continued = pages.filter(pg => pg.some(t => / \(continued\)$/.test(t.s)));
    assert(continued.length > 0, 'expected at least one continued page');
    const pale = pages.flatMap((pg, i) => pg.filter(t => t.y > 22 && t.y < 200 && t.color.join() === HEADER.join()).map(t => `page ${i + 1}: "${t.s.slice(0, 40)}"`));
    assert(!pale.length, 'text in the pale header colour: ' + pale.slice(0, 3).join('; '));
    return `${continued.length} continued pages; no body text in the header colour`;
  });

  check('12 to 16, X1: the summary wording and the fee lines', () => {
    const plan = build('SMR', USER);
    const out = pdfOf(plan);
    const all = out.texts.join('\n');
    const bullets = out.texts.filter(t => t.length > 0);
    assert(all.includes('Spending cap multiple: x1.'), 'cap multiple bullet');
    assert(!/Spending cap multiple: x1\. \S/.test(all), 'text after the cap multiple');
    // X1: the fee line is fees on placed spend only; the Indeed Premium fee is
    // in its own line. Fees are kept separate (22 September 2026): placed =
    // media + platform fees, each on its own line.
    assert(all.includes('platform fees (Indeed 1.75%'), 'fee line label');
    assert(Math.abs(plan.fees.placed + plan.fees.premium - plan.fees.total) < 0.005, 'fees do not add up');
    const at = bullets.findIndex(t => t.startsWith('platform fees (Indeed'));
    assert(bullets[at + 1] === F.gbp(plan.fees.placed, 2), `fee line shows ${bullets[at + 1]}, not the fees on placed spend ${F.gbp(plan.fees.placed, 2)}`);
    const media = bullets.findIndex(t => t === 'media');
    assert(media >= 0 && bullets[media + 1] === F.gbp(plan.totals.media), 'media line');
    assert(all.includes(`of which ${F.gbp(plan.fees.premium, 2)} on Indeed Premium`), 'fees bullet names the Premium fee');
    // 13: spend above past levels, in parts that add up; the row with no spend of its own is named.
    const cells = plan.locations.flatMap(l => RAC.PLATFORMS.map(q => l.cells[q])).filter(c => c.spend > 0.005);
    const unrun = cells.filter(c => !(c.largestMonth > 0));
    assert(unrun.length > 0, 'expected a row with no spend of its own in this plan');
    const flat = all.replace(/\n/g, ' ');
    unrun.forEach(c => assert(flat.includes(`${c.region} ${RAC.PLATFORM_LABELS[c.platform]}`), `${c.region} ${c.platform} not named`));
    assert(/had no spend of (its|their) own since January 2026/.test(flat), 'no-spend wording');
    assert(!/largest month of any kind/.test(flat), 'old wording');
    // Source labels in RAC's words.
    assert(/Set by Enhance/.test(all) && !/\((agreed|tested|default)[;)]/.test(all), 'source labels');
    assert(!RAC.outputChecks.text(all).length, RAC.outputChecks.text(all).join('; '));
    return `cap multiple "x1." alone; fees on placed spend ${F.gbp(plan.fees.placed, 2)} + Premium ${F.gbp(plan.fees.premium, 2)} = ${F.gbp(plan.fees.total, 2)}; ` +
      `named with no spend of its own: ${unrun.map(c => `${c.region} ${c.platform}`).join(', ')}`;
  });

  check('14 and 18: the cap multiple reads x1, x2, x3 everywhere RAC sees it', () => {
    assert(F.mult(1) === 'x1' && F.mult(1.5) === 'x1.5' && F.mult(2) === 'x2' && F.mult(3) === 'x3', 'format');
    const plan = build('SMR', USER);
    const texts = [...pdfOf(plan).texts, ...RAC.workings.build([doc('SMR', plan)], opts).texts,
      ...RAC.text.method(plan.A, 'SMR', plan, bt).flatMap(s => s.paras)];
    const all = texts.join('\n');
    ['x1 (this plan)', 'x2', 'x3', 'cap multiples of x1, x2 and x3', 'spending cap multiple (x1 in this plan)'].forEach(t => assert(all.includes(t), 'missing: ' + t));
    const pctMultiple = texts.filter(t => /(cap multiple|multiple of)[^.]{0,20}\d{3}%|\d{3}% cap multiple/i.test(t));
    assert(!pctMultiple.length, 'a multiple shown as a percentage: ' + pctMultiple[0]);
    return 'x1, x2, x3 in the PDF, workings and method text; no multiple shown as a percentage';
  });

  check('17: section headings, and the short stamp on the last page only', () => {
    const plan = build('SMR', OCT);
    const out = pdfOf(plan, { legacy: ['A legacy note.'], plan: ['A plan note.'] });
    const pages = out.pdf.pages;
    const sections = pages.map(pg => pg[1].s);
    ['Summary', 'By location', 'By platform', 'Indeed by location', 'Appcast by location', 'Method and glossary'].forEach(s => assert(sections.includes(s), 'no page headed ' + s));
    pages.forEach((pg, i) => assert(pg[1].size > pg[0].size, `page ${i + 1}: the section is not the larger heading`));
    const stamp = RAC.stamp.short(plan, opts.code);
    assert(!/\.xlsx|Eploy/.test(stamp) && /^Reference: code feedfac/.test(stamp), stamp);
    const withStamp = pages.map((pg, i) => (pg.some(t => t.s === stamp) ? i + 1 : null)).filter(Boolean);
    assert(withStamp.length === 1 && withStamp[0] === pages.length, 'stamp on pages ' + withStamp.join());
    const w = RAC.workings.build([doc('SMR', plan)], opts);
    assert(w.sheets[0].rows.some(r => String(r.cells[0]).startsWith('Code feedfac · Eploy ')), 'the workings keep the full stamp');
    return `sections: ${[...new Set(sections)].join(', ')}; stamp on page ${withStamp[0]} of ${pages.length}: "${stamp}"; full stamp in the workings`;
  });

  check('20: location notes are short and allowed a second line', () => {
    const plan = build('SMR', USER);
    const out = pdfOf(plan);
    const page = out.pdf.pages.find(pg => pg[1] && pg[1].s === 'By location');
    const words = page.map(t => t.s);
    // Wording from 22 September 2026 (walk-through Q11, with the user's changes).
    const flat = words.join(' ');
    ['Every platform at its spending', 'At the most this location has', 'No spend in this plan'].forEach(n => assert(flat.includes(n), 'note missing: ' + n));
    assert(!words.some(w => /\(largest (successful )?month x multiple\)/.test(w)), 'long cap reason in the notes');
    assert(words.some(w => w.startsWith('Paid media only; plus 10.1')) && words.includes('expected from other sources'), 'the total row note is not carried to a second line');
    return 'notes: Every platform at its spending cap, At the most this location has spent in a month, No spend in this plan; the total row note runs onto a second line';
  });

  check('28 and 38: the workings Assumptions sheet in RAC\'s words, with the months the plan used', () => {
    const plan = build('SMR', USER);
    const w = RAC.workings.build([doc('SMR', plan)], opts);
    const sheet = w.sheets.find(s => s.name === 'Assumptions');
    const body = sheet.rows.filter(r => r.kind !== 'head' && r.kind !== 'title' && r.kind !== 'sub' && r.kind !== 'note' && r.kind !== 'blank');
    assert(!body.some(r => r.cells[0] === 'combined_activity_includes_display'), 'the Display setting is listed');
    const allowed = new Set(['Set by Enhance', 'Set by Enhance, informed by testing', "Set by Enhance, informed by RAC's data", "Measured from RAC's data", "RAC's data", 'set for this plan', 'blended by open roles']);
    const bad = body.filter(r => !allowed.has(r.cells[6]));
    assert(!bad.length, 'unexpected source: ' + bad.slice(0, 3).map(r => `${r.cells[0]} "${r.cells[6]}"`).join('; '));
    const used = Object.fromEntries(RAC.text.monthsUsed(plan.A, 'SMR', plan).map(r => [r.key, r]));
    const data = body.find(r => r.cells[0] === 'data_ad_platforms');
    assert(data && data.cells[8].includes(used.cost.months) && data.cells[8].includes(used.caps.months), 'data source row does not state the months used');
    assert(body.some(r => r.cells[0] === 'data_applicant_tracking'), 'applicant tracking data row');
    const text = w.texts.join('\n');
    assert(!/agreed|display remarketing/i.test(text), 'the workings say "agreed" or mention Display remarketing');
    const intern = RAC.text.assumptionRows(plan.A, 'SMR', plan);
    assert(intern.some(r => r.key === 'combined_activity_includes_display' && /Dynamic Remarketing/.test(r.notes)), 'the internal list lost the Display note');
    return `${body.length} rows, sources all in RAC's words; data row: "${data.cells[8].slice(0, 110)}..."; the Display setting stays on the internal list only`;
  });

  check('X3 and X4: the screens read placed spend', () => {
    const plan = build('SMR', USER);
    const legacy = RAC.legacyShape.toLegacy(plan);
    assert(Math.abs(legacy.placed - plan.placed) < 0.005, 'placed');
    const sumPlat = RAC.PLATFORMS.reduce((a, p) => a + legacy.platformTotals[p], 0);
    assert(Math.abs(sumPlat - legacy.placed) < 0.01, `platform totals ${sumPlat} against placed ${legacy.placed}`);
    const unplacedPlan = build('SMR', { ...OCT, capMultiple: 1 });
    const lp = RAC.legacyShape.toLegacy(unplacedPlan);
    assert(lp.unplacedBudget > 1 && Math.abs((lp.budget - lp.unplacedBudget) - (lp.placed + lp.premiumHoldback + lp.acHoldback + lp.oneRacHoldback)) < 0.01,
      'budget less not placed should equal placed plus hold-backs');
    return `placed £${Math.round(legacy.placed)} = the platform totals; on the September settings at x1, budget less not placed £${Math.round(lp.budget - lp.unplacedBudget)} = placed plus hold-backs`;
  });
}
