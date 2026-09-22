// RAC planner: the words that explain the plan. One source for the Method
// tab, the PDF's method and glossary pages, and the workings export.
//
// Every figure quoted comes from assumptions.csv (and, where a plan is given,
// from that plan), so the text cannot drift from what the planner does.
// Writing rules: plain language, no em-dashes, data in the past tense, "we"
// means Enhance. tests/checks/80_exports.mjs scans the output.
//
//   RAC.text.method(A, role, plan?, backtest?)   [{ heading, paras: [..] }]
//   RAC.text.glossary(A, role, plan?)            [{ term, text }]
//   RAC.text.assumptionRows(A, role, plan?)      the values the plan used,
//                                                with source and tested figure
//   RAC.text.fmt                                 formatting helpers
(function (RAC) {
  'use strict';

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmt = {
    month: (mo) => (mo ? `${MONTHS[Number(mo.slice(5, 7)) - 1]} ${mo.slice(0, 4)}` : ''),
    monthShort: (mo) => (mo ? `${MONTHS[Number(mo.slice(5, 7)) - 1].slice(0, 3)} ${mo.slice(2, 4)}` : ''),
    gbp: (x, dp = 0) => (x === null || x === undefined || !isFinite(x) ? '-'
      : (x < 0 ? '-' : '') + '£' + Math.abs(x).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })),
    int: (x) => (x === null || x === undefined || !isFinite(x) ? '-' : Math.round(x).toLocaleString('en-GB')),
    num: (x, dp = 1) => (x === null || x === undefined || !isFinite(x) ? '-' : x.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })),
    pct: (x, dp = 0) => (x === null || x === undefined || !isFinite(x) ? '-' : (x * 100).toFixed(dp) + '%'),
    signedPct: (x, dp = 0) => (x === null || x === undefined || !isFinite(x) ? '-' : (x >= 0 ? '+' : '-') + Math.abs(x * 100).toFixed(dp) + '%'),
    list: (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]),
    // The spending cap multiple, one format everywhere: x1, x1.5, x2 (user, 22 September 2026).
    mult: (x) => (x === null || x === undefined || !isFinite(x) ? '-' : 'x' + String(+(+x).toFixed(2))),
  };

  // Where a value came from, in the words RAC sees (user, 22 September 2026).
  // The assumptions file keeps its own source column unchanged.
  const SOURCE_LABELS = {
    'agreed': 'Set by Enhance',
    'default': 'Set by Enhance',
    'agreed, informed by tests': 'Set by Enhance, informed by testing',
    'agreed, informed by data': "Set by Enhance, informed by RAC's data",   // fourth label (user, 22 September 2026)
    'tested': "Measured from RAC's data",
  };
  const sourceLabel = (s) => SOURCE_LABELS[s] || s;
  // An assumption's note, reworded for RAC: "Agreed 17 Sep 2026 (Stage 2
  // review): ..." becomes "Set by Enhance on 17 Sep 2026: ...".
  function clientNote(s) {
    return String(s || '')
      .replace(/^Agreed(?: (\d{1,2} \w{3} \d{4}))?(?: \([^)]*\))?( for this release)?(:|\.)?/,
        (m, date, rel, punct) => `Set by Enhance${date ? ' on ' + date : ''}${rel || ''}${punct || ''}`)
      .replace(/\bagreed\b/gi, 'set by Enhance');
  }

  // Months in words. Consecutive months become a run: "January to July 2026",
  // "October 2025 to June 2026"; gaps are listed as separate runs.
  const nextMonth = (mo) => { const y = Number(mo.slice(0, 4)), m = Number(mo.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
  function runs(ms) {
    const out = [];
    [...ms].sort().forEach(mo => {
      const last = out[out.length - 1];
      if (last && nextMonth(last[last.length - 1]) === mo) last.push(mo); else out.push([mo]);
    });
    return out;
  }
  function runText(r) {
    const a = r[0], b = r[r.length - 1];
    if (a === b) return fmt.month(a);
    return a.slice(0, 4) === b.slice(0, 4) ? `${MONTHS[Number(a.slice(5, 7)) - 1]} to ${fmt.month(b)}` : `${fmt.month(a)} to ${fmt.month(b)}`;
  }
  fmt.span = (ms) => (ms && ms.length ? fmt.list(runs(ms).map(runText)) : 'no months');
  const num = (x) => String(+(+x).toFixed(2));
  // The two limits on the spending caps (user decision, 18 September 2026),
  // in words, from their values in the assumptions file (0 turns one off).
  function capLimitsText(rowLimit, locLimit) {
    const row = rowLimit > 0
      ? `The month a cap is based on cannot be more than ${num(rowLimit)} x the location and platform’s average monthly spend over the same months (the months it spent in), so a single unusual month cannot set a cap.`
      : 'The month a cap is based on is not limited by average monthly spend.';
    const loc = locLimit > 0
      ? `Each location is also capped at ${locLimit === 1 ? 'the most it spent in one of those months' : `${num(locLimit)} x the most it spent in one of those months`}, all platforms together, times the spending cap multiple. Each platform’s cap is set separately, so without this a location could be allowed more in a month than it has ever run. There is no cap on the plan as a whole.`
      : 'Locations have no cap of their own beyond the sum of their platforms’ caps. There is no cap on the plan as a whole.';
    return row + ' ' + loc;
  }
  const TIMES = { 1: 'once', 2: 'twice', 3: 'three times' };
  // Months with their weights: "January to April 2026 counted once and May to
  // July 2026 counted twice". Months with weight 0 are left out.
  fmt.weighted = (weights) => {
    const byW = {};
    Object.keys(weights || {}).sort().forEach(mo => { const w = weights[mo]; if (w > 0) (byW[w] = byW[w] || []).push(mo); });
    const ws = Object.keys(byW).map(Number).sort((a, b) => a - b);
    if (!ws.length) return 'no months';
    if (ws.length === 1 && ws[0] === 1) return `${fmt.span(byW[1])}, each counted once`;
    return fmt.list(ws.map(w => `${fmt.span(byW[w])} counted ${TIMES[w] || w + ' times'}`));
  };
  fmt.windowName = (w) => {
    if (!w) return 'not recorded';
    if (typeof w === 'string') w = { mode: w };
    const names = { all: 'every month held', ytd: 'year to date', last3: 'the last three months', last3up: `year to date, with the last three months counted x${w.mult || 3}`, custom: 'a chosen period' };
    return names[w.mode] || 'not recorded';
  };

  // Agreed wording (addendum 2.2).
  const ATTRIBUTION = 'Quality and hire rates by platform came from RAC’s applicant tracking data, which credited each application to the last source a candidate used before applying. ' +
    'Earlier interactions, particularly with Meta and Google, likely had more influence than this shows, so their contribution to quality applications and hires may have been undervalued. ' +
    'For this reason, Meta and Google rates were moved towards the role average. We will assess this separately.';
  // Agreed wording for the quality measure (user, 17 September 2026; the clause on
  // repeat applications that had already passed screening added 18 September 2026).
  const QUALITY_DEFINITION = 'A quality application is one that progressed past screening, or was closed at screening for a reason other than the candidate’s suitability, ' +
    'such as location, salary, the role being filled, withdrawal, or being banked for future roles. Repeat applications from the same candidate are not counted unless they had already passed screening.';
  const RANGE_LINE = 'The range shows how far our model has missed in testing, and it is wider wherever there is less evidence behind the figure.';
  const ROW_RANGE_LINE = 'Row ranges are wider than the total and do not add up to it, because single locations swing more than the plan as a whole.';

  const OFF = 100000;

  function values(A, role, plan) {
    const g = (k) => RAC.assumptions.get(A, k, role);
    const e = (k) => RAC.assumptions.entry(A, k, role) || {};
    const fees = plan && plan.fees;
    return {
      premiumRate: g('indeed_premium_rate'),
      benchmark: g('role_cpa_benchmark'),
      cpaPrior: g('cpa_prior_apps'),
      settleDays: g('data_settle_days'),
      typicalMin: g('typical_month_min_spend'),
      eployFirst: g('eploy_first_month'),
      hireMaturity: g('hire_maturity_months'),
      screenMaturity: g('screening_maturity_months'),
      screenBlend: g('screen_blend_n'), screenBlendTested: e('screen_blend_n').testedValue,
      pull: g('meta_google_pull'),
      locBlend: g('location_screen_blend_n'), locBlendTested: e('location_screen_blend_n').testedValue,
      regionBlend: g('region_hire_blend_n'), regionBlendTested: e('region_hire_blend_n').testedValue,
      paidFactor: g('paid_hire_reconciliation_factor'),
      creditFactor: g('other_hires_credit_factor'),
      otherMonthly: plan ? plan.otherHiresMonthly : g('other_hires_monthly'),
      otherMonthlyDefault: g('other_hires_monthly'),
      share: plan ? plan.otherHiresShare : g('other_hires_credited_share'),
      recentFrom: g('other_hires_recent_from'),
      d1Rate: g('d1_role_rate'), d1RateTested: e('d1_role_rate').testedValue,
      d1Strength: g('d1_prior_strength'),
      bias: plan ? plan.remainingError : g('remaining_error_factor'),
      biasDefault: g('remaining_error_factor'), biasTested: e('remaining_error_factor').testedValue,
      rangeLow: g('range_apps_low'), rangeHigh: g('range_apps_high'),
      widen: g('row_widen_apps'), widenTested: e('row_widen_apps').testedValue,
      lowRateSd: g('low_confidence_rate_sd'), lowApps: g('low_confidence_min_apps'),
      draws: g('hire_range_draws'),
      testFirst: g('backtest_first_month'), minHistory: g('test_min_history_months'),
      minGain: g('own_figure_min_gain'), switchMonths: g('switch_min_test_months'),
      pLow: g('range_low_percentile'), pHigh: g('range_high_percentile'), hitRateMonths: g('range_hit_rate_min_months'),
      capFirst: g('ceiling_first_month'), capMinSpend: g('ceiling_min_spend'), capMinApps: g('ceiling_min_apps'),
      rollingFrom: g('ceiling_rolling_from'), rollingMonths: g('ceiling_rolling_months'),
      qualityDrop: g('quality_test_drop'), qualityMin: g('quality_test_min_expected'),
      capRowLimit: g('cap_row_usual_limit'), capLocLimit: g('cap_location_month_limit'),
      capMultiple: plan ? plan.capMultiple : g('cap_multiple_default'), capDefault: g('cap_multiple_default'),
      feeIndeed: g('fee_rate_indeed'), feeMeta: g('fee_rate_meta'), feeGoogle: g('fee_rate_google'), feesFrom: g('fees_first_month'),
      feesOn: fees ? fees.on : null,
      includesDisplay: g('combined_activity_includes_display') === 1,
    };
  }

  // The months each part of the model used, and whether they follow the
  // plan's data window or a fixed rule. One list for the Method text, the PDF
  // summary and the workings Summary sheet.
  //   [{ key, part, months, basis, short }]
  function monthsUsed(A, role, plan, backtest) {
    if (!plan) return [];
    const f = fmt;
    const g = (k) => RAC.assumptions.get(A, k, role);
    const rates = plan.rates || {};
    const quality = rates.screenMonths || [];
    const hires = rates.hireMonths || [];
    const settled = Object.keys(plan.months || {}).filter(mo => plan.months[mo] && (plan.months[mo].settled || (plan.settlingUsed || []).some(x => x.month === mo))).sort();
    const capFirst = g('ceiling_first_month');
    const caps = plan.capMonths || settled.filter(mo => mo >= capFirst);
    const capBench = plan.capBenchmarkMonths || caps;
    const other = ((plan.otherSources && plan.otherSources.months) || []).map(m => m.month);
    const matching = hires.filter(mo => plan.months && plan.months[mo] && plan.months[mo].settled);
    const windowName = f.windowName(plan.window);
    const rows = [
      { key: 'cost', part: 'Cost per application and average monthly spend', months: f.weighted(plan.weights),
        basis: `the data window set for this plan (${windowName}); a row with no spend of its own used the platform’s typical month over the same months, each counted once`,
        short: `cost per application ${f.weighted(plan.weights)}` },
      { key: 'caps', part: 'Spending caps (successful months)', months: `${f.span(caps)}, each counted once; the cost benchmark ${capBench.join() === caps.join() ? 'used the same months' : `${f.span(capBench)}, each counted once`}`,
        basis: `a fixed rule, whatever the data window: settled months from ${f.month(plan.capFirst || capFirst)}${plan.capsRolling ? ` (the last ${g('ceiling_rolling_months')} settled months)` : ''} with at least ${f.gbp(g('ceiling_min_spend'))} of spend and ${g('ceiling_min_apps')} applications, each judged against the location and platform’s own average cost per application over those months, adjusted for that month’s spend, and against that month’s quality rate across all locations. Months before ${f.month(capFirst)} were left out because that data was put together differently and did not compare like for like. A location and platform with no successful month is capped at its average monthly spend over the same months. ${capLimitsText(g('cap_row_usual_limit'), g('cap_location_month_limit'))}`,
        short: `spending caps ${f.span(caps)} (cost benchmark ${f.span(capBench)})` },
      { key: 'quality', part: 'Quality rates', months: `applications made ${f.span(quality)}, each month counted once`,
        basis: `a fixed rule, whatever the data window: applications from ${f.month(g('eploy_first_month'))}, once ${g('screening_maturity_months')} further months had started`,
        short: `quality rates ${f.span(quality)}` },
      { key: 'hires', part: 'Hire rate after quality, and the match to platform hires', months: `applications made ${f.span(hires)}, each month counted once${matching.length && matching.join() !== hires.join() ? ` (the match used ${f.span(matching)}, where the platform data had settled)` : ''}`,
        basis: `a fixed rule, whatever the data window: hires counted once ${g('hire_maturity_months')} further months had started, and only for months whose quality outcomes counted`,
        short: `hire rates ${f.span(hires)}` },
      { key: 'other', part: 'Expected hires from other sources', months: `${f.span(other)}, each counted once (${other.length} months)`,
        basis: `a fixed rule, whatever the data window: the monthly average over the same months as the hire rates${plan.settings && plan.settings.some(s => s.key === 'otherHiresMonthly' && s.changed) ? '; this plan set its own figure instead' : ''}`,
        short: `other-source hires ${f.span(other)}` },
    ];
    const bt = backtest && backtest.roles && backtest.roles[role];
    if (bt) {
      const costMonths = (bt.costMissesNoAdjustment || []).map(m => (typeof m === 'string' ? m : m.month));
      const appMonths = (bt.applications || []).map(m => m.month);
      const btWindow = f.windowName(backtest.window);
      rows.push({ key: 'testing', part: 'Testing: real-world CPA outcome adjustment and the diminishing returns factor',
        months: `${f.span(costMonths)} (${costMonths.length} test months), each predicted from the months before it`,
        basis: `a fixed rule, whatever this plan’s data window: each test month needed ${g('test_min_history_months')} earlier months, and the months before it were weighted ${btWindow}${btWindow !== windowName ? '. This plan’s data window differs, so these figures were not tested on it' : ''}`,
        short: `testing ${f.span(costMonths)}` });
      rows.push({ key: 'ranges', part: 'Testing: ranges and row widening', months: `${f.span(appMonths)} (${appMonths.length} test months), each predicted from the months before it`,
        basis: `a fixed rule: test months from ${f.month(g('backtest_first_month'))}, weighted as above`,
        short: `ranges ${f.span(appMonths)}` });
    }
    if (RAC.testing && quality.length) {
      const blend = RAC.testing.testMonths(quality, g('test_min_history_months')).map(s => s.test[0]);
      if (blend.length) rows.push({ key: 'blends', part: 'Testing: quality and hire rate settings', months: `${f.span(blend)} (${blend.length} test months)`,
        basis: 'a fixed rule: each test month predicted from the applicant tracking months before it; the settings in use were set by Enhance, with the tested figures recorded beside them',
        short: `rate testing ${f.span(blend)}` });
    }
    return rows;
  }

  // Plain words for the real-world CPA outcome adjustment's tested figure:
  // predicted over actual applications, so above 1 means costs came out
  // higher than predicted.
  function outcomeText(tested) {
    if (tested === null || tested === undefined || !isFinite(tested)) return 'testing gave no figure';
    const d = Math.abs(tested - 1);
    return `actual costs per application came out about ${fmt.pct(d, 1)} ${tested >= 1 ? 'higher' : 'lower'} than predicted (${tested.toFixed(3)})`;
  }

  // Expected hires from other sources: counted towards the target, not
  // modelled on the budget (user decision, 22 September 2026, option A).
  const OTHER_SOURCES_LINE = 'Expected hires from other sources count towards the hire target. They are not modelled on the budget: the plan does not predict how spend changes them, and the same figure is used at every budget. We aim to model this in future.';

  // The sentence for a target the spending caps put out of reach (point 12;
  // user wording, 22 September 2026), with the plan's own figure.
  function reachSentence(plan) {
    const r = plan && plan.reach;
    if (!r) return '';
    return `Spend above ${fmt.gbp(r.saturationBudget)} has not successfully driven results: every location and platform would be above the largest month that worked for it, so the plan does not place it.`;
  }

  // The budget for the hire target in steps (point 30), or what is reachable
  // (user decision, 22 September 2026: shown as a total budget).
  //   { value: short figure, lines: [explanations] }
  function targetText(plan) {
    const f = fmt;
    const t = plan.hireTarget;
    if (!(t > 0)) return { value: 'no hire target set', lines: [] };
    const other = plan.otherHires || 0;
    if (plan.otherSourcesMeetTarget) {
      return { value: 'met by other sources alone', lines: [`${f.num(other)} hires are expected from other sources, which reaches the target of ${t} without paid media, so the budget needed is the hold-backs alone (${f.gbp(plan.budgetForTarget)}).`] };
    }
    if (plan.unreachable) {
      const s = plan.atSaturation || {};
      return {
        value: `most ${f.num(plan.maxAchievable)} hires, needing a total budget of ${f.gbp(plan.saturationBudget)} (${f.gbp(s.placed)} placed plus ${f.gbp(s.holdbacks)} held back)`,
        lines: [
          `Target ${t} hires, less ${f.num(other)} expected from other sources: ${f.num(Math.max(0, t - other))} paid-media hires needed. Within the spending caps paid media can deliver at most ${f.num(s.paidHires)}.`,
          reachSentence(plan),
        ],
      };
    }
    const a = plan.atTarget || {};
    const lines = [`Target ${t} hires, less ${f.num(other)} expected from other sources: ${f.num(plan.paidGoal)} paid-media hires needed. ` +
      `Hold-backs ${f.gbp(a.holdbacks)} plus ${f.gbp(a.placed)} placed for those hires: ${f.gbp(plan.budgetForTarget)}, in steps of £50.`];
    if (plan.pinned || plan.minimumsSetBudget) lines.push(`The location minimums set for this plan need this budget on their own; at it, paid media is predicted to deliver ${f.num(a.paidHires)} hires.`);
    return { value: f.gbp(plan.budgetForTarget), lines };
  }

  // The method, as numbered steps in the order the plan works and the order
  // the table columns run (user decision, 22 September 2026, written from
  // Biraag's own description of the model). One step per point, one or two
  // sentences each: what it does and the figure it uses. How each setting was
  // tested, and the figure testing gave, are left to the workings.
  function method(A, role, plan, backtest) {
    const v = values(A, role, plan);
    const f = fmt;
    const btRole = backtest && backtest.roles && backtest.roles[role];
    const testMonths = btRole ? btRole.applications.map(o => o.month) : [];
    const rates = (plan && plan.rates) || null;
    const qualityMonths = rates ? f.span(rates.screenMonths) : `${f.month(v.eployFirst)} onwards`;
    const hireMonths = rates ? f.span(rates.hireMonths) : qualityMonths;
    const otherMonths = plan && plan.otherSources && plan.otherSources.months && plan.otherSources.months.length
      ? f.span(plan.otherSources.months.map(m => m.month)) : hireMonths;
    const sections = [];
    const add = (heading, ...paras) => sections.push({ heading, paras: paras.filter(Boolean) });
    // Numbered across the whole document, so a point can be referred to.
    let n = 0;
    const p = (s) => `${++n}. ${s}`;

    add('How the plan is worked out',
      p(`Hold-backs come off first. Indeed Premium (${f.gbp(v.premiumRate)} a day for each campaign${v.feesOn === false ? '' : ', plus the Indeed fee'}), the Combined Activity reserve and any OneRAC hold-back are taken off the budget. What is left is the deployable budget.`),
      p(`Platform fees are paid from inside the budget. Indeed charge ${f.pct(v.feeIndeed, 2)}, Meta ${f.pct(v.feeMeta, 2)} and Google ${f.pct(v.feeGoogle, 2)} of media spend, and Appcast none; on plans from ${f.month(v.feesFrom)} every table shows the total spend, the fee and the media it left.${v.feesOn === false ? ' This plan is for an earlier month, so it includes no fees.' : ''} Past costs were recorded without fees, so the forecasts, cost per application and cost per hire are all based on media spend excluding fees.`),
      p(`Hires from other sources: ${f.num(v.otherMonthly)} a month${plan && v.otherMonthly !== v.otherMonthlyDefault ? ` (set for this plan; the monthly average was ${f.num(v.otherMonthlyDefault)})` : ''}, from applications made ${otherMonths} that RAC recorded outside Indeed, Meta, Google and Appcast. ${OTHER_SOURCES_LINE} We can set a figure manually, and can credit a share of them to paid media (${f.pct(v.share)} in this plan), which makes that share grow with paid spend.`),
      p(`The budget is shared between locations by VAFs (open roles). The efficiency setting (${f.pct(plan && plan.efficiency ? plan.efficiency.weight : 0)} in this plan, up to 100%) moves that share towards the locations where a hire is predicted to cost least; every location minimum and maximum, spending cap and cost limit still applies.`),
      p('A location’s predicted paid-media hires may not exceed its VAFs, and spend there stops when they reach them. Money a location cannot take moves to the locations with room, again by VAFs, and anything no location can take is reported as budget the plan could not place.'),
      p('Within a location, money goes where the next hire costs least, until the platforms cost the same for the next hire or one reaches its spending cap. Minimums and floors set for the plan are applied afterwards, never above a cap, and the plan says by how much a cap left a minimum short.'),
      p(`Spending caps. Each location and platform is capped at its largest successful month${plan && plan.capsRolling ? ` in the last ${v.rollingMonths} settled months` : ` since ${f.month(v.capFirst)}`}, times the spending cap multiple (${f.mult(v.capMultiple)} in this ${plan ? 'plan' : 'release by default'}, from 1 to 3), with the fee added where fees apply${v.capRowLimit > 0 ? `; the month a cap is based on cannot be more than ${num(v.capRowLimit)} x the location and platform’s average monthly spend` : ''}${v.capLocLimit > 0 ? ', and each location is capped at the most it spent in one of those months across all platforms' : ', and locations have no cap of their own beyond the sum of their platforms’ caps'}.${plan && plan.capsRolling ? '' : ` From ${f.month(v.rollingFrom)} onwards, these caps will be based on the last ${v.rollingMonths} settled months instead of everything since ${f.month(v.capFirst)}.`}`),
      p(`A month counted as successful when it had at least ${f.gbp(v.capMinSpend)} of spend and ${v.capMinApps} applications, its cost per application was at or below the benchmark for that month’s level of spend, and the location’s quality rate was no more than ${f.pct(v.qualityDrop)} below what was expected of it that month. The benchmark is the location and platform’s own average cost per application over the same months, adjusted for that month’s spend, so the caps do not move when the plan’s data window changes; months before ${f.month(v.capFirst)} were left out because that data was put together differently and did not compare like for like.`),
      p(`The quality test applied only where at least ${v.qualityMin} quality applications were expected and the month’s outcomes had settled. The rate expected of a location moved with how quality ran across all locations that month, so a month that was weak everywhere did not count against one location.`),
      p('Where a location and platform had no successful month, it is capped at its average monthly spend over those months instead, or at the platform’s typical month where it never spent, times the multiple, and the row is flagged.'),
      p('Cost limits are blank unless set for a plan. A cost per application limit for a location and platform replaces that row’s spending cap, so spend continues until the predicted cost reaches the limit and the location’s own cap is raised to allow it; a cost per hire limit stops spend in a location at its limit. Both are judged on media cost, the VAF rule and any location maximum still apply, and a limit never changes which past months counted as successful.'));

    add('How each figure in the tables is worked out',
      p(`Which months count. A month counted once it was complete and its data was at least ${v.settleDays} days old, so applications recorded late were in; a plan can include months still settling, and each one used is flagged. The data window set for the plan (${f.windowName(plan ? plan.window : null)}) weights those months for the base cost per application and average monthly spend only; the caps, the rates, the hires from other sources and the ranges follow fixed rules, set out under Months used.`),
      p('Base cost per application is the location and platform’s weighted spend over its weighted applications in those months, or the platform’s figure for the role where it had no applications of its own.'),
      p(`Thin-data adjustment. A location and platform with few applications is pulled towards the platform’s figure for the role, and that figure towards the role’s average cost per application over the months the caps use (${f.gbp(v.benchmark, 2)}); a row with ${v.cpaPrior} applications behind it is pulled halfway.`),
      p(`Diminishing returns adjustment. The plan compares the media spend it is placing with the row’s average monthly spend and raises cost per application accordingly, at a factor of ${v.d1Rate}${v.d1Strength >= OFF ? ' shared across platforms' : ''}: doubling spend raised cost per application by ${f.pct(Math.pow(2, 1 - v.d1Rate) - 1)} and delivered ${f.pct(Math.pow(2, v.d1Rate) - 1)} more applications, not double. Spending below the average lowers the cost the same way.`),
      p(`Real-world CPA outcome adjustment: ${v.bias.toFixed(3)}. When we predicted each past month from the months before it, ${outcomeText(v.biasTested)}${v.bias === 1 ? ', but not in the same direction with every test month left out, so no adjustment is applied' : ', consistently enough to plan for it, so planned costs per application are raised by that much'}. It is set for every plan, not plan by plan.`),
      p('Plan cost per application and predicted applications. Plan cost per application is the base cost with those three adjustments applied, shown together in the tables as CPA adjustments; predicted applications are the media spend divided by that cost.'),
      p(`Quality rate. ${QUALITY_DEFINITION} Rates are by platform and role, from applications made ${qualityMonths}, counted once ${v.screenMaturity} further months had started, with Indeed and Appcast blended towards the role average across all sources${rates ? ` (${f.pct(rates.roleScreen, 1)})` : ''} ${v.screenBlend >= OFF ? 'in full' : `at a strength of ${v.screenBlend} applications`}, and Meta and Google moved ${f.pct(v.pull)} of the way to it. ${v.locBlend >= OFF ? 'Differences between locations are not applied.' : `Each location’s rate is then adjusted towards its own, blended by ${v.locBlend} applications.`}`),
      p(`Attribution. ${ATTRIBUTION}`),
      p(`Hire rate from quality applies${rates ? `: ${f.pct(rates.roleHire, 1)}` : ''}, which is hires over quality applications from the same months. ${v.regionBlend >= OFF ? 'It is used for every location and platform, because regional and platform differences did not carry forward from one period to the next.' : `Each region’s own figure is blended with the role figure by ${v.regionBlend} quality applications.`}`),
      p(`Hire adjustment: x${v.paidFactor.toFixed(3)}. Using the applications the platforms actually recorded from ${hireMonths}, the quality and hire rates predicted ${v.paidFactor < 1 ? 'more' : 'fewer'} hires than RAC’s data credited to those four platforms, so predicted hires are scaled ${v.paidFactor < 1 ? 'down' : 'up'} to match.`),
      p('Predicted hires and cost per hire. Predicted hires are the predicted applications carried through the quality rate, the hire rate from quality applies and the hire adjustment; cost per hire is the media spend divided by the predicted hires, and is not shown for a row predicting fewer than 0.1 hires.'));

    const used = monthsUsed(A, role, plan, backtest);
    if (used.length) add('Months used', ...used.map(r => `${r.part}: ${r.months}. This follows ${r.basis.replace(/\s*\.\s*$/, '')}.`));

    add('Ranges',
      p(`The plan total’s application range is the middle ${f.pct(v.pHigh - v.pLow)} of how far our predictions missed in testing (${f.signedPct(v.rangeLow, 1)} to ${f.signedPct(v.rangeHigh, 1)}${testMonths.length ? `, over ${testMonths.length} test months from ${f.month(testMonths[0])} to ${f.month(testMonths[testMonths.length - 1])}` : ''}). Rows start from the same figure and widen where fewer applications sat behind the cost per application (at a strength of ${v.widen}) and where planned spend sits further from past spend, so row ranges are wider than the total and do not add up to it.`),
      p(`Hire ranges combine the application range with the uncertainty in the quality rate, the hire rate, the hire adjustment and the figure for hires from other sources, and with chance variation in the number of hires itself, over ${f.int(v.draws)} simulated months. A row is marked low confidence where its hire rate was uncertain by more than about ${f.pct(Math.exp(v.lowRateSd) - 1)}, or fewer than ${v.lowApps} applications sat behind its cost per application. We make no claim about how often an actual result falls inside a range until there are at least ${v.hitRateMonths} test months.`));

    add('Budget for the hire target',
      p('The plan is run at trial budgets in steps of £50 and the lowest that reaches the target is taken, with expected hires from other sources counting towards it, and no budget accepted that its own hold-backs and location minimums would overspend. Where the spending caps put the target out of reach, the plan shows the most hires it can deliver, the budget at which extra spend stops adding hires, and the same figures at cap multiples of x1, x2 and x3.'));

    if (plan && plan.oneRac) {
      const o = plan.oneRac;
      const ca = costAdjustment(plan);
      add('The OneRAC plan',
        `OneRAC runs one set of campaigns for both roles in ${f.list(o.regions)}, so it is planned on its own and those locations are left out of the SMR and Patrol plans. VAFs are the two roles' VAFs there added together: ${RAC.ROLES.map(r => `${r} ${o.mix.vacancies[r]}`).join(', ')}, ${o.mix.total} in total.`,
        `Past performance is the two roles' spend and applications in those locations added together. Cost per application is then blended to the mix of VAFs${o.adjustment.openBlend ? ` (${f.gbp(o.adjustment.openBlend, 2)} against ${f.gbp(o.adjustment.combined, 2)} blended by past spend, a multiplier of ${o.adjustment.factor.toFixed(3)})` : ''}, because the plan recruits for the roles that are open, not for the roles past spend happened to be split between.`,
        `Quality and hire rates are the two roles' applicant tracking counts in those locations added together. ${ca.selfCompetition > 0 ? `A self-competition assumption of ${f.pct(ca.selfCompetition)} lowers cost per application, for the two roles no longer bidding against each other; it has not been measured yet.` : 'No self-competition improvement was assumed: the two roles no longer bid against each other, but we have no measurement of what that is worth, so nothing is claimed for it.'} Everything else follows the points above.`,
        o.second ? `A second scenario is shown beside the plan: at a self-competition improvement of ${f.pct(o.second.selfCompetition)}, the same budget would be expected to deliver ${f.num(o.second.hires)} hires against ${f.num(plan.totals.allHires)}. It is a comparison, not the plan.` : '',
        'After four to six weeks of OneRAC activity we will compare these locations with their own history and with similar locations that are not on OneRAC, and replace the assumption with the measured result.');
    }

    add('Settings, and what is not included',
      p('Every value above is kept in one file, with its source and the figure testing gave shown beside it in the workings, and we review them each month before the plan.'),
      p('Not included. Seasonality, market demand and competition are not modelled and sit inside the real-world CPA outcome adjustment and the ranges; how spend affects hires from other sources, the influence of Meta and Google before a candidate applied, and the effect of Combined Activity campaigns are not modelled either.'));
    return sections;
  }

  function glossary(A, role, plan) {
    const v = values(A, role, plan);
    const f = fmt;
    return [
      { term: 'Deployable budget', text: 'The monthly budget after Indeed Premium and the Combined Activity reserve (and any OneRAC hold-back).' },
      { term: 'Total spend, fee and media', text: `Media spend is what the platform charged for advertising. Indeed (${f.pct(v.feeIndeed, 2)}), Meta (${f.pct(v.feeMeta, 2)}) and Google (${f.pct(v.feeGoogle, 2)}) add a fee on top, from ${f.month(v.feesFrom)} plans. Total spend is media plus fee.` },
      { term: 'VAFs', text: 'Open roles in a location. Budget is shared between locations by VAFs, and a location’s predicted paid-media hires may not exceed them.' },
      { term: 'Base cost per application', text: 'Spend over applications for the location and platform in the months used, before any adjustment; the platform’s figure where the row had no applications of its own.' },
      { term: 'Thin-data adjustment', text: `How far a figure with few applications was pulled towards the platform’s figure for the role (half weight at ${v.cpaPrior} applications).` },
      { term: 'Diminishing returns adjustment', text: 'How much cost per application rose or fell because planned media spend differed from the row’s average monthly spend.' },
      { term: 'Real-world CPA outcome adjustment', text: 'A multiplier on cost per application for how far actual costs differed from predicted costs when we tested on past months, used only where the direction held with any one test month left out.' },
      { term: 'CPA adjustments', text: 'The thin-data, diminishing returns and real-world CPA outcome adjustments multiplied together.' },
      { term: 'Plan cost per application (media)', text: 'Base cost per application x CPA adjustments, on media spend.' },
      { term: 'Predicted applications', text: 'Media spend over plan cost per application.' },
      { term: 'Quality application', text: QUALITY_DEFINITION.replace('A quality application is one', 'One') },
      { term: 'Quality rate', text: 'The share of applications that counted as quality applications in RAC’s applicant tracking data.' },
      { term: 'Hire rate from quality applications', text: 'Hires over quality applications, before the hire adjustment.' },
      { term: 'Hire adjustment', text: 'Scales predicted hires so that on past months they matched the hires RAC’s applicant tracking data credited to Indeed, Meta, Google and Appcast.' },
      { term: 'Plan cost per hire (media)', text: 'Media spend over predicted paid-media hires. Not shown where a row predicts fewer than 0.1 hires.' },
      { term: 'Expected hires from other sources', text: 'Hires RAC recorded outside Indeed, Meta, Google and Appcast, as a monthly figure. Counted towards the hire target; not modelled on the budget.' },
      { term: 'Spending cap', text: `The most the plan will spend on a location and platform: its largest successful month${v.capRowLimit > 0 ? `, capped at ${num(v.capRowLimit)} x its average monthly spend,` : ''} times the spending cap multiple (plus the fee where fees apply). A cost per application limit set for the plan replaces it.` },
      ...(v.capLocLimit > 0 ? [{ term: 'Location spending cap', text: `The most the plan will spend on a location, all platforms together: ${v.capLocLimit === 1 ? 'the most it spent in one month' : `${num(v.capLocLimit)} x the most it spent in one month`} across all platforms, in the months the caps considered, times the spending cap multiple (plus fees where they apply).` }] : []),
      { term: 'Successful month', text: 'A past month whose cost per application was at or below the location and platform’s own average cost across the months the caps considered (adjusted for that month’s spend), and whose quality rate was not unusually weak against the other locations that month.' },
      { term: 'Budget not placed', text: 'Money no location could take within its maximum, spending caps, cost limits and VAFs.' },
      { term: 'Range', text: `${RANGE_LINE} ${ROW_RANGE_LINE}` },
      { term: 'Low confidence', text: 'A row with little evidence behind its hire rate or its cost per application.' },
      { term: 'Settled month', text: `A complete month whose data was taken at least ${v.settleDays} days after it ended.` },
    ];
  }

  // Every value a plan used, for the PDF assumptions box and the workings
  // Assumptions sheet: the file's rows, with the plan's own settings on top.
  // Settings kept for the team but left out of everything RAC sees (user,
  // 22 September 2026: the Display remarketing note).
  const INTERNAL_KEYS = ['combined_activity_includes_display'];
  // opts.client: for RAC-facing outputs, without the internal settings and
  // with the source and notes in RAC's words.
  function assumptionRows(A, role, plan, opts = {}) {
    const rows = assumptionRowsAll(A, role, plan);
    if (!opts.client) return rows;
    return rows.filter(r => !INTERNAL_KEYS.includes(r.key))
      .map(r => ({ ...r, source: sourceLabel(r.source), notes: clientNote(r.notes) }));
  }
  function assumptionRowsAll(A, role, plan) {
    const rows = A.entries.filter(e => e.role === 'all' || e.role === role).map(e => ({
      key: e.key, name: e.name, value: e.parsed, tested: e.testedValue, unit: e.unit, source: e.source, date: e.date, notes: e.notes, plan: null,
    }));
    if (plan) {
      const byKey = { capMultiple: 'cap_multiple_default', otherHiresShare: 'other_hires_credited_share', otherHiresMonthly: 'other_hires_monthly', remainingError: 'remaining_error_factor' };
      plan.settings.forEach(s => {
        const r = rows.find(x => x.key === byKey[s.key]);
        if (r) r.plan = s.value;
        else rows.push({ key: s.key, name: s.name, value: s.default, tested: null, unit: s.unit, source: s.source, date: '', notes: 'Set for each plan', plan: s.value });
      });
      const o = (plan.stamps && plan.stamps.assumptions && plan.stamps.assumptions.overrides) || {};
      Object.keys(o).forEach(k => {
        const r = rows.find(x => x.key === k);
        const val = typeof o[k] === 'object' ? o[k][role] : o[k];
        if (r && val !== undefined) r.plan = val;
      });
    }
    return rows;
  }

  // The multiplier on planned cost per application. For a role plan it is the
  // remaining-error adjustment alone; a OneRAC plan also blends cost to the
  // mix of open roles and applies the self-competition assumption.
  function costAdjustment(plan) {
    const a = (plan && plan.costAdjustment) || { used: 1, remainingError: 1, roleMix: 1, selfCompetition: 0 };
    const extra = a.roleMix !== 1 || a.selfCompetition > 0;
    const parts = [`real-world CPA outcome ${a.remainingError.toFixed(3)}`];
    if (a.roleMix !== 1) parts.push(`role mix ${a.roleMix.toFixed(3)}`);
    if (a.selfCompetition > 0) parts.push(`self-competition ${fmt.pct(a.selfCompetition)}`);
    return {
      ...a, extra,
      label: extra ? 'Cost adjustment' : 'Real-world CPA outcome adjustment',
      basis: extra ? parts.join(' x ') : '',
    };
  }

  // The spending caps as one point for the summary (the tables have no cap
  // column; user decision, 22 September 2026), and any rows whose spend was
  // set by a cost limit above past levels.
  function capsPoint(plan) {
    const f = fmt;
    const cells = plan.locations.flatMap(l => RAC.PLATFORMS.map(q => l.cells[q])).filter(c => c.spend > 0.005);
    const atCap = cells.filter(c => !c.capByLimit && c.spend >= c.cap - 1).length;
    const atLoc = plan.locations.filter(l => l.capReason === 'location spending cap (largest month x multiple)' && l.spend >= l.cap - 1).length;
    const first = plan.capsRolling ? `in the last ${RAC.assumptions.get(plan.A, 'ceiling_rolling_months')} settled months` : `since ${f.month(plan.capFirst || RAC.assumptions.get(plan.A, 'ceiling_first_month'))}`;
    const out = [`Spending caps: each location and platform was capped at its largest successful month ${first}, times the spending cap multiple (${f.mult(plan.capMultiple)}), and each location at the most it spent in one month. ${atCap} of ${cells.length} funded location and platform rows ${atCap === 1 ? 'was' : 'were'} at their cap${atLoc ? `, and ${atLoc} location${atLoc === 1 ? ' was at its' : 's were at their'} location cap` : ''}.`];
    const byLimit = cells.filter(c => c.capByLimit);
    if (byLimit.length) {
      const above = byLimit.filter(c => c.media > (c.largestMonth || 0) + 0.5);
      out.push(`Spend set by a cost limit for this plan, in place of the spending cap: ${byLimit.map(c => `${c.region} ${RAC.PLATFORM_LABELS[c.platform]} (limit ${f.gbp(c.cpaLimit, 2)}, ${f.gbp(c.spend)})`).join(', ')}. ` +
        (above.length ? `Above past spending levels (more than the row’s largest month since ${f.month(RAC.assumptions.get(plan.A, 'ceiling_first_month'))}): ${above.map(c => `${c.region} ${RAC.PLATFORM_LABELS[c.platform]}`).join(', ')}. Predictions there depend on how much cost per application rises with spend.` : 'None is above the row’s largest past month.'));
    }
    return out;
  }

  RAC.text = { fmt, sourceLabel, clientNote, SOURCE_LABELS, INTERNAL_KEYS, values, monthsUsed, capLimitsText, method, glossary, assumptionRows, costAdjustment,
    capsPoint, reachSentence, targetText, outcomeText, OTHER_SOURCES_LINE, ATTRIBUTION, QUALITY_DEFINITION, RANGE_LINE, ROW_RANGE_LINE };
})(window.RAC = window.RAC || {});
