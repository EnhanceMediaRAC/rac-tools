// Checks for the trace guide (B6). It follows one location and platform from
// the monthly figures to the hires, so every figure it quotes has to be the
// one the planner gives. If the data file or an assumption changes, this fails
// and the guide is updated with it, rather than quietly going out of date.
import { loadPlanner, loadAssumptions, readRoot } from '../lib/planner.mjs';
import { calibrationData } from '../lib/calibration_data.mjs';
import { septSmrSettings } from '../lib/fixtures.mjs';

export default function (check, { assert, near }) {
  const RAC = loadPlanner();
  const A = loadAssumptions(RAC);
  const eploy = JSON.parse(readRoot('data/eploy_rates.json'));
  const D = calibrationData(RAC);
  // The check list, the release steps and the trace guide are for the team,
  // never RAC, so they may name GitHub, Vercel and Supabase, the app's screens
  // and its files, and the retired terms the check list asks to search for.
  // Every other output rule still applies to them.
  const internalText = (t) => RAC.outputChecks.text(t)
    .filter(p => !p.startsWith('names the repository') && !p.startsWith('refers to the app') && !p.startsWith('uses a renamed term'));

  check('Trace guide: every figure it quotes is the one the planner gives', () => {
    const guide = readRoot('docs/trace_guide.md');
    const plan = RAC.plan.build('SMR', { ...septSmrSettings(RAC.plan.NO_SPEND), planMonth: '2026-10', daysInMonth: 31 },
      { ds: D.SMR.ds, A, eploy });
    const region = 'South East', plat = 'indeed';
    const c = plan.locations.find(l => l.region === region).cells[plat];
    const b = plan.blend.window[plat][region];
    const pf = plan.blend.platform[plat];
    const r = plan.rates;
    const gbp = (x, dp = 2) => '£' + x.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    const pct = (x, dp = 1) => (x * 100).toFixed(dp) + '%';
    const want = [
      ['spend in the window', gbp(b.spend)],
      ['applications in the window', b.apps.toFixed(1)],
      ['base cost per application', gbp(c.baseCpa)],
      ['average monthly spend', gbp(b.avgSpend)],
      ['the platform figure', gbp(pf.cpa)],
      ['the role average cost per application', gbp(RAC.assumptions.get(A, 'role_cpa_benchmark', 'SMR'))],
      ['the cost per application after the thin-data pull', gbp(c.usualCpa)],
      ['the thin-data adjustment', c.thinAdjustment.toFixed(4)],
      ['the diminishing returns adjustment', c.spendAdjustment.toFixed(4)],
      ['the real-world CPA outcome adjustment', c.remainingError.toFixed(4)],
      ['the CPA adjustments', c.cpaAdjustments.toFixed(4)],
      ['plan cost per application on media', gbp(c.plannedCpaMedia)],
      ['media spend', gbp(c.media)],
      ['total spend', gbp(c.spend)],
      ['the fee', gbp(c.fee)],
      ['applications', c.apps.toFixed(1)],
      ['quality applications', c.passed.toFixed(2)],
      ['hires', c.hires.toFixed(2)],
      ['plan cost per hire on media', '£' + Math.round(c.media / c.hires).toLocaleString('en-GB')],
      ['the quality rate used', pct(c.screenRate)],
      ['the hire rate from quality applications', pct(c.hireAfterScreening)],
      ['the hire adjustment', c.reconciliation.toFixed(3)],
      ['the role quality rate', pct(r.roleScreen)],
      ['the spending cap on media', gbp(c.ceiling)],
      ['the largest successful month', gbp(c.ceilingBase)],
    ];
    const missing = want.filter(([, v]) => !guide.includes(v));
    assert(!missing.length, 'the trace guide is out of date. These figures are no longer what the planner gives: '
      + missing.map(([what, v]) => `${what} is now ${v}`).join('; ')
      + '. Re-run the trace and update docs/trace_guide.md.');
    // It has to name the sheets, in the order the workbook holds them.
    ['Data sources', 'Blend inputs', 'Workings', 'Rate build-up', 'Successful months', 'Back-test']
      .forEach(sheet => assert(guide.includes('**' + sheet + '**') || guide.includes(sheet + '**'), 'the guide does not name the ' + sheet + ' sheet'));
    assert(!internalText(guide).length, 'the guide fails the output checks: ' + internalText(guide).join('; '));
    return `${want.length} figures in docs/trace_guide.md match the planner, from the monthly rows to ${c.hires.toFixed(2)} hires`;
  });

  check('Market data is a guide on Setup only, and never reaches anything RAC sees', () => {
    const market = JSON.parse(readRoot('data/market.json'));
    // Cost in pounds (user, 18 September 2026), monthly averages only: no
    // spend, no campaign names.
    const text = JSON.stringify(market);
    assert(!/"spend"|"campaign"\s*:\s*"/.test(text), 'the market file holds spend or campaign names');
    const mean = (p, w) => { const xs = market.months.map(m => m[p] && m[p][w]).filter(v => v); return xs.reduce((a, v) => a + v, 0) / xs.length; };
    ['google', 'meta'].forEach(p => ['cpc', 'cpm'].forEach(w => {
      market.months.forEach(m => { if (m[p]) assert(m[p][w] === null || (m[p][w] > 0 && m[p][w] < 500), `${m.month} ${p} ${w} £${m[p][w]}`); });
      // The stored average is the average of the unrounded months, so allow a penny or two.
      near(market.averages[p][w], mean(p, w), 0.02, `${p} ${w} average`);
    }));
    // The Hiring Lab series is not in the file at all. Its absence is explained
    // in the file's own note, which is the only place the name may appear.
    assert(!/hiring\s*lab/i.test(JSON.stringify(market.months)), 'the market file holds Hiring Lab figures');
    assert(/hiring lab/i.test(market.note), 'the market file does not say why the Hiring Lab series is absent');
    // Nothing that RAC sees can read it: only the Setup panel does.
    ['exports/text.js', 'exports/pdf.js', 'exports/workings.js', 'planner/plan.js', 'planner/cost.js', 'planner/forecast.js']
      .forEach(f => assert(!/market\.json|RACUI\.MarketTable/.test(readRoot(f)),
        `${f} reads the market data; it must stay a guide on Setup`));
    const ui = readRoot('ui/market_table.jsx');
    assert(ui.includes("fetch('data/market.json'"), 'the Setup panel does not read the market file');
    // The guide is on Setup, for either role, closed until opened (feedback 2).
    assert(readRoot('index.html').includes('<RACUI.MarketGuide />') && /RACUI\.MarketGuide = MarketGuide/.test(ui), 'the market guide is not on Setup');
    // Indeed Hiring Insights figures (user decisions, 22 September 2026): in
    // the repository, read only by the Setup guide, never in anything RAC
    // sees. Every row passes the two arithmetic checks the transcription used.
    const csv = RAC.util.parseCsv(readRoot('data/indeed_hiring_insights.csv'));
    const head = csv[0], rows = csv.slice(1).map(c => Object.fromEntries(head.map((h, i) => [h, c[i]])));
    assert(rows.length === 39 && new Set(rows.map(r => r.series)).size === 3, `${rows.length} Indeed rows`);
    const bad = [];
    rows.forEach(r => { if (Math.abs(Number(r.jobseekers) / Number(r.jobs) - Number(r.jobseekers_per_job)) > 0.5) bad.push(`${r.series} ${r.month} per job`); });
    [...new Set(rows.map(r => r.series))].forEach(sr => {
      const ms = rows.filter(r => r.series === sr).sort((x, y) => (x.month < y.month ? -1 : 1));
      ms.slice(1).forEach((r, i) => [['jobs', 'jobs_change'], ['jobseekers', 'jobseekers_change'], ['jobseekers_per_job', 'per_job_change']].forEach(([v, c]) => {
        if (Number(r[v]) - Number(ms[i][v]) !== Number(r[c])) bad.push(`${sr} ${r.month} ${c}`);
      }));
    });
    assert(!bad.length, 'Indeed figures fail the arithmetic: ' + bad.slice(0, 4).join(', '));
    assert(ui.includes("fetch('data/indeed_hiring_insights.csv'"), 'the Setup guide does not read the Indeed figures');
    ['exports/text.js', 'exports/pdf.js', 'exports/workings.js', 'exports/tables.js', 'planner/plan.js', 'planner/app.js', 'index.html']
      .forEach(f => assert(!/indeed_hiring_insights/.test(readRoot(f)), `${f} reads the Indeed figures; they must stay a guide on Setup`));
    assert(RAC.outputChecks.text('Indeed Hiring Insights showed 34 jobseekers per job.').length > 0, 'the output checks do not refuse Hiring Insights');
    return `${market.months.length} months of cost per click and per thousand in pounds and search interest, and ${rows.length} months of Indeed Hiring Insights (3 job titles, every row passing its arithmetic), read only by the Setup guide; ` +
      'nothing RAC sees reads either';
  });

  check('The check list covers every screen and export the release changed', () => {
    const doc = readRoot('docs/check_list.md');
    ['Plan tab', 'PDF', 'Workings', 'Assumptions tab', 'OneRAC tab', 'cost limits', 'market guide',
      'Changelog screen', 'Mark as issued', '/archive/', 'docs/trace_guide.md', 'Not saved',
      'Months used', 'Last 3 months count', 'OneRAC PDF', 'Nothing that tells RAC the tool exists', '[object',
      // The second and third feedback batches (22 September 2026).
      'Plan CPA (media)', 'CPA adjustments', 'Hire adjustment', 'VAFs', 'Use £X', 'Current budget', 'Location limits',
      'real-world CPA outcome adjustment', 'diminishing returns adjustment', 'not modelled on the budget', 'Data taken on',
      'Success-test benchmark', 'Counted', 'Spend set by the cost limit for this plan', '£18,350', 'follows the same switch',
      'Indeed', 'After the release, on the live address',
      // The fourth feedback batch (23 September 2026).
      'Cost per hire (media)', 'paid media hires only', 'held below the limit by', 'cap it replaced',
      'closed until you open', 'Commentary for the OneRAC plan document', 'PDF, no notes',
      'point 23', '£99.71 x 1.1379', '63.4 applies', 'to within £1']
      .forEach(t => assert(doc.includes(t), 'docs/check_list.md does not cover ' + t));
    assert(!internalText(doc).length, 'the check list fails the output checks: ' + internalText(doc).join('; '));
    return 'every screen and export the release changed is in docs/check_list.md, in the order to check them';
  });

  check('Release steps: the release document covers the archive copy and the checks to run', () => {
    const doc = readRoot('docs/release.md');
    ['node tests/run.mjs', 'tests/browser/save_guard.py', 'tests/browser/app_checks.py', 'tests/browser/export_checks.py',
      'tests/browser/issued_checks.py', 'tests/browser/archive_checks.py', 'RAC_EPLOY_WORKBOOK', 'RAC_PACING_DIR',
      'archive:workspace', 'Back up', 'python tools/build_archive.py', 'https://rac-tools-kappa.vercel.app/archive/', 'https://rac-tools-kappa.vercel.app/**',
      'SAVE_HOSTS', 'Retire the old address', 'Tell the team the link has changed', 'Check the version stamp', 'api/windsor-spend?version=1',
      // After the release (23 September 2026): the live-address checks, with cost limits and the data window
      // in the record of changes (X5), and August re-uploaded so it counts in the October plans.
      '## After the release, with dates', 'The record of changes (8.4)', 'Patrol in the archive (9.4)',
      'a cost limit on Setup, and the data window on Benchmarks', 'Re-upload August on or after 1 October 2026',
      'Raw Data Export', '31 August 2026']
      .forEach(t => assert(doc.includes(t), 'docs/release.md does not mention ' + t));
    assert(!doc.includes('https://rac-tools.vercel.app/archive'), 'docs/release.md still sends people to the archive on the old address');
    assert(!internalText(doc).length, 'the release document fails the output checks: ' + internalText(doc).join('; '));
    return 'every check to run, the back-up, the archive copy and the match against the live exports are all in docs/release.md';
  });
  check('Release steps: the monthly review names who does each step', () => {
    const doc = readRoot('docs/release.md');
    const i = doc.indexOf('## Each month, before the plan');
    assert(i > 0, 'docs/release.md has no monthly review section');
    const sec = doc.slice(i, doc.indexOf('\n## ', i + 5));
    ['The app author carries out this review', 'Biraag decides what changes',
      'edits `assumptions.csv` on a branch', "checks the branch's test link and merges",
      'App author, not Biraag']
      .forEach(t => assert(sec.includes(t), 'the monthly review section does not say: ' + t));
    // Every numbered step says whose it is.
    const steps = sec.split(/\n(?=\d+\. )/).slice(1);
    assert(steps.length >= 7, 'the monthly review has fewer steps than expected: ' + steps.length);
    steps.forEach((t, n) => assert(/\*\*(Biraag|App author)/.test(t),
      'monthly review step ' + (n + 1) + ' does not name who does it'));
    return "the monthly review is the app author's, Biraag decides, and every step names its owner";
  });

}
