// RAC planner: the workings export (B3). Built only from the plan object the
// screen used, so the spreadsheet, the screens and the PDF cannot disagree.
//
// Ten sheets:
//   Summary            budget, hold-backs, fees, results, ranges, what the
//                      plan could not place, the out-of-reach table
//   Workings           every location and platform, left to right from past
//                      performance to predicted hires, as live formulas
//   Assumptions        every value the plan used, with its source and date
//   Data sources       every monthly figure, where it came from, and its
//                      weight in this plan
//   Blend inputs       how the window figures and the platform figures are
//                      arrived at, as SUMPRODUCT over Data sources
//   Rate build-up      the Eploy counts behind the quality and hire rates
//   Back-test          each test month predicted from earlier months only
//   Successful months  each month's tests and the spending cap they set
//   Allocation steps   every move the split made, and why
//   Method             the shared text (exports/text.js) and the glossary
//
// Arithmetic is written as Excel formulas wherever the planner's own
// arithmetic can be written that way. No formula carries a saved answer, so
// the spreadsheet works every one of them out when it opens and nothing can go
// stale. `build` records each formula with the planner's own figure
// (`checks`), so a check can open the workbook, let it calculate, and compare.
// Figures that come from simulation (the ranges) or from a median are written
// as values and say so.
//
//   RAC.workings.build(docs, opts)          -> { sheets, checks, texts, rows, problems }
//   RAC.workings.write(ExcelJS, built, o)   -> a workbook
//   RAC.workings.save(ExcelJS, docs, opts)  builds, checks, saves; returns the file name
//     docs: [{ role, roleName, plan }]  (one role, as the PDF)
//     opts: { monthLabel, planName, code, backtest }
//
// Excel functions newer than the 2007 file format are written with the
// `_xlfn.` prefix the format requires (PERCENTILE.INC); without it
// LibreOffice reads them as #NAME?.
(function (RAC) {
  'use strict';
  const P = () => RAC.PLATFORMS;
  const L = () => RAC.PLATFORM_LABELS;

  const GBP = '£#,##0', GBP2 = '£#,##0.00', PCT1 = '0.0%', PCT2 = '0.00%';
  const N0 = '#,##0', N1 = '#,##0.0', N3 = '0.000', N4 = '0.0000';

  function colLetter(n) {
    let s = '';
    for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
    return s;
  }
  const q = (name) => (/[^A-Za-z0-9_]/.test(name) ? `'${name}'` : name);
  const at = (sheet, col, row) => `${q(sheet)}!$${colLetter(col)}$${row}`;
  const span = (sheet, col, from, to) => `${q(sheet)}!$${colLetter(col)}$${from}:$${colLetter(col)}$${to}`;
  // A formula cell: the formula, and the planner's value as its result.
  const F = (formula, value) => ({ formula, value: Number.isFinite(value) ? value : null });
  const isF = (v) => !!v && typeof v === 'object' && typeof v.formula === 'string';

  function makeSheet(name, opts = {}) {
    const s = { name, columns: opts.columns || [], rows: [], freeze: opts.freeze || 0 };
    s.add = (kind, cells, fmt) => { s.rows.push({ kind, cells: cells || [], fmt: fmt || null }); return s.rows.length; };
    s.title = (t, sub) => { s.add('title', [t]); if (sub) s.add('sub', [sub]); s.add('blank', []); };
    s.head = (labels) => s.add('head', labels);
    s.body = (cells, fmt) => s.add('body', cells, fmt);
    s.total = (cells, fmt) => s.add('total', cells, fmt);
    s.note = (t) => s.add('note', [t]);
    s.blank = () => s.add('blank', []);
    return s;
  }

  // ---- the sheets ---------------------------------------------------------

  // Every monthly figure the role's calculations read.
  function dataSources(plan, f) {
    const s = makeSheet('Data sources', { freeze: 1, columns: [
      { w: 12 }, { w: 20 }, { w: 11 }, { w: 13, f: GBP2 }, { w: 13, f: N0 }, { w: 11, f: N0 },
      { w: 14 }, { w: 30 }, { w: 14, f: N0 },
    ] });
    s.title('Every monthly figure this plan read', 'Spend and applications by location and platform, when each month’s data was taken, and what it counts for in this plan. Past spend is media spend, without platform fees.');
    const settle = RAC.assumptions.get(plan.A, 'data_settle_days');
    s.note(`A month counts once it is complete and its data was taken at least ${settle} days after it ended, so applications recorded late are in.${plan.includeSettling ? ' This plan also counts complete months still settling.' : ''}`);
    const headRow = s.head(['Platform', 'Location', 'Month', 'Spend', 'Applications', 'Clicks', 'Data taken on', 'Counts in this plan', 'Weight']);
    const first = headRow + 1;
    plan.raw.rows.forEach(r => {
      const st = plan.months[r.month] || {};
      s.body([L()[r.platform], r.region, r.month, r.spend, r.apps, r.clicks,
        st.takenOn || 'unknown',
        st.settled ? 'yes' : (plan.includeSettling && st.settling ? 'yes, still settling' : 'no: ' + (st.reason || 'not settled')),
        plan.raw.weights[r.month] || 0]);
    });
    const last = s.rows.length;
    s.blank();
    s.note(`${plan.raw.rows.length} monthly figures. The weight is what each month counts for in the data window (${windowText(plan, f)}); a month outside the window, or one that does not count, has a weight of 0.`);
    return { sheet: s, first, last, col: { platform: 1, region: 2, month: 3, spend: 4, apps: 5, clicks: 6, weight: 9 } };
  }

  function windowText(plan, f) {
    const w = plan.window || {};
    const names = { all: 'every month held', ytd: 'year to date', last3: 'the last three months', last3up: `year to date, last three months x${w.mult || 3}`, custom: 'a chosen period' };
    const base = names[w.mode] || w.mode;
    return plan.windowMonths.length ? `${base}: ${f.month(plan.windowMonths[0])} to ${f.month(plan.windowMonths[plan.windowMonths.length - 1])}` : base;
  }
  // The window the testing used, in words (the test results hold it as
  // { mode, mult }).
  function windowName(w) {
    return typeof w === 'string' ? w : RAC.text.fmt.windowName(w);
  }

  // Window figures per location and platform, and each platform's figure for
  // the role, as formulas over Data sources.
  function blendInputs(plan, ds, f) {
    const K = RAC.assumptions.get(plan.A, 'cpa_prior_apps');
    const benchmark = RAC.assumptions.get(plan.A, 'role_cpa_benchmark', plan.role);
    const s = makeSheet('Blend inputs', { freeze: 1, columns: [
      { w: 20 }, { w: 12 }, { w: 14, f: GBP2 }, { w: 14, f: N1 }, { w: 12, f: N1 }, { w: 12, f: N1 },
      { w: 10, f: N1 }, { w: 14, f: GBP2 }, { w: 14, f: N1 }, { w: 15, f: GBP2 }, { w: 15, f: GBP2 }, { w: 12, f: N1 }, { w: 15, f: GBP2 },
    ] });
    s.title('How the window figures are arrived at',
      'Each figure adds up the monthly rows on the Data sources sheet, weighted as the data window sets, then scales the total back to the number of months in the window so a weighted month does not look like extra evidence.');
    const headRow = s.head(['Location', 'Platform', 'Weighted spend', 'Weighted applications', 'Weighted clicks', 'Weight added up',
      'Months in window', 'Spend in the window', 'Applications in the window', 'Cost per application', 'Spend in months it ran', 'Weight of those months', 'Average monthly spend']);
    const C = { region: 1, platform: 2, wspend: 3, wapps: 4, wclicks: 5, wsum: 6, months: 7, spend: 8, apps: 9, cpa: 10, ranSpend: 11, ranWeight: 12, avg: 13 };
    const dsp = span(ds.sheet.name, ds.col.platform, ds.first, ds.last);
    const dsr = span(ds.sheet.name, ds.col.region, ds.first, ds.last);
    const dsw = span(ds.sheet.name, ds.col.weight, ds.first, ds.last);
    const dss = span(ds.sheet.name, ds.col.spend, ds.first, ds.last);
    const dsa = span(ds.sheet.name, ds.col.apps, ds.first, ds.last);
    const dsc = span(ds.sheet.name, ds.col.clicks, ds.first, ds.last);
    const rowOf = {};
    plan.allRegions.forEach(region => P().forEach(plat => {
      const st = plan.blend.window[plat][region];
      const r = s.rows.length + 1;
      const match = (v) => `SUMPRODUCT((${dsp}=$${colLetter(C.platform)}$${r})*(${dsr}=$${colLetter(C.region)}$${r})${v})`;
      const cell = (col) => `$${colLetter(col)}$${r}`;
      s.body([
        region, L()[plat],
        F(match(`*${dsw}*${dss}`), st.wspend),
        F(match(`*${dsw}*${dsa}`), st.wapps),
        F(match(`*${dsw}*${dsc}`), st.wclicks),
        F(match(`*${dsw}`), st.wsum),
        plan.raw.monthCount,
        F(`IF(${cell(C.wsum)}>0,${cell(C.wspend)}*${cell(C.months)}/${cell(C.wsum)},0)`, st.spend),
        F(`IF(${cell(C.wsum)}>0,${cell(C.wapps)}*${cell(C.months)}/${cell(C.wsum)},0)`, st.apps),
        F(`IF(${cell(C.apps)}>0,${cell(C.spend)}/${cell(C.apps)},"")`, st.rawCpa),
        F(match(`*(${dss}>0)*${dsw}*${dss}`), st.ranSpend),
        F(match(`*(${dss}>0)*${dsw}`), st.ranWeight),
        F(`IF(${cell(C.ranWeight)}>0,${cell(C.ranSpend)}/${cell(C.ranWeight)},0)`, st.avgSpend),
      ]);
      rowOf[region + '|' + plat] = r;
    }));
    const lastCell = s.rows.length;
    s.blank();
    s.add('title', ['Each platform’s figure for the role']);
    s.note(`Every location’s window figures for the platform added together, then pulled towards the role’s average cost per application over the months the spending caps use (${f.gbp(benchmark, 2)}): a figure with ${K} applications behind it carries half the weight. A location with no applications of its own takes this figure as it is.`);
    s.head(['Platform', '', 'Applications in the window', 'Spend in the window', 'Own cost per application', 'Applications for half weight', 'Role average cost per application', 'Platform figure for the role']);
    const pc = { platform: 1, apps: 3, spend: 4, raw: 5, prior: 6, benchmark: 7, figure: 8 };
    const platRow = {};
    P().forEach(plat => {
      const x = plan.blend.platform[plat];
      const r = s.rows.length + 1;
      const cell = (col) => `$${colLetter(col)}$${r}`;
      const apps = span(s.name, C.apps, headRow + 1, lastCell);
      const spend = span(s.name, C.spend, headRow + 1, lastCell);
      const plats = span(s.name, C.platform, headRow + 1, lastCell);
      s.body([
        L()[plat], '',
        F(`SUMIFS(${apps},${plats},$${colLetter(pc.platform)}$${r},${apps},">0")`, x.apps),
        F(`SUMIFS(${spend},${plats},$${colLetter(pc.platform)}$${r},${apps},">0")`, x.spend || 0),
        F(`IF(${cell(pc.apps)}>0,${cell(pc.spend)}/${cell(pc.apps)},"")`, x.rawCpa),
        K, benchmark,
        F(`IF(${cell(pc.apps)}>0,(${cell(pc.apps)}*${cell(pc.raw)}+${cell(pc.prior)}*${cell(pc.benchmark)})/(${cell(pc.apps)}+${cell(pc.prior)}),${cell(pc.benchmark)})`, x.cpa),
      ], [null, null, N1, GBP2, GBP2, N0, GBP2, GBP2]);
      platRow[plat] = r;
    });
    s.blank();
    s.add('title', ['Each platform’s typical month']);
    s.note(`The middle monthly spend above ${f.gbp(RAC.assumptions.get(plan.A, 'typical_month_min_spend'))} across every location’s window months. A middle value cannot be written as a formula over the rows above, so it is the planner’s figure. It is used as the spend level for a location and platform that did not run in the window.`);
    s.head(['Platform', '', 'Typical month']);
    const typicalRow = {};
    P().forEach(plat => {
      typicalRow[plat] = s.body([L()[plat], '', plan.blend.typical[plat]], [null, null, GBP2]);
    });
    return { sheet: s, C, pc, rowOf, platRow, typicalRow, typicalCol: 3 };
  }

  // The Eploy counts behind the quality and hire rates.
  function rateBuildUp(plan, f) {
    const r = plan.rates;
    const A = plan.A;
    const N = RAC.assumptions.get(A, 'screen_blend_n', plan.role);
    const pull = RAC.assumptions.get(A, 'meta_google_pull');
    const M = RAC.assumptions.get(A, 'location_screen_blend_n', plan.role);
    const Rn = RAC.assumptions.get(A, 'region_hire_blend_n', plan.role);
    const OFF = RAC.rates.OFF;
    const s = makeSheet('Rate build-up', { freeze: 1, columns: [
      { w: 20 }, { w: 16, f: N0 }, { w: 16, f: N0 }, { w: 13, f: PCT1 }, { w: 22 }, { w: 13, f: PCT1 }, { w: 16, f: N0 }, { w: 11, f: N0 }, { w: 13, f: PCT1 }, { w: 15, f: PCT1 },
    ] });
    s.title('Quality and hire rates, from RAC’s applicant tracking data',
      `${r.dataset.file} (${r.dataset.file_date}). Quality outcomes counted for application months ${r.screenMonths[0]} to ${r.screenMonths[r.screenMonths.length - 1]}; hires for ${r.hireMonths[0]} to ${r.hireMonths[r.hireMonths.length - 1]}.`);
    s.note(RAC.text.QUALITY_DEFINITION);
    s.blank();
    s.add('title', ['The role, all sources']);
    const roleHead = s.head(['', 'Applications', 'Quality applications', 'Quality rate', '', 'Hires', 'Quality applications (hire months)', '', 'Hire rate from quality applications', '']);
    const roleRow = s.rows.length + 1;
    const cAll = r.counts.all, cHire = r.counts.hireAll;
    s.body(['Role average', cAll.apps, cAll.passed,
      F(`IF($B$${roleRow}>0,$C$${roleRow}/$B$${roleRow},0)`, r.roleScreen), '',
      cHire.hires, cHire.passed, '',
      F(`IF($G$${roleRow}>0,$F$${roleRow}/$G$${roleRow},0)`, r.roleHire), '']);
    s.blank();
    s.add('title', ['By platform']);
    s.note(N >= OFF
      ? `Indeed and Appcast take the role average. Meta and Google move ${f.pct(pull)} of the way to the role average, because RAC’s tracking credited each application to the last source used before applying.`
      : `Indeed and Appcast blend their own rate with the role average as if ${N} further applications at the average had been added. Meta and Google move ${f.pct(pull)} of the way to the role average, because RAC’s tracking credited each application to the last source used before applying.`);
    s.head(['Platform', 'Applications', 'Quality applications', 'Own quality rate', 'How the rate used is arrived at', 'Quality rate used', '', '', '', '']);
    const platRow = {};
    P().forEach(p => {
      const t = r.platform[p];
      const row = s.rows.length + 1;
      const own = `IF($B$${row}>0,$C$${row}/$B$${row},"")`;
      const used = ['meta', 'google'].includes(p)
        ? F(`IF($B$${row}>0,$D$${row}+${pull}*($D$${roleRow}-$D$${row}),$D$${roleRow})`, t.used)
        : N >= OFF ? F(`$D$${roleRow}`, t.used)
          : F(`($C$${row}+${N}*$D$${roleRow})/($B$${row}+${N})`, t.used);
      platRow[p] = row;
      s.body([L()[p], t.apps, t.passed, F(own, t.own), t.basis, used, '', '', '', '']);
    });
    s.blank();
    s.add('title', ['By location']);
    s.note(`${M >= OFF ? 'Location differences in quality were not applied for this release, so every location’s adjustment is 1.' : `Each location’s quality rate is blended towards the role average by ${M} applications.`} ` +
      `${Rn >= OFF ? 'The hire rate from quality applications is the role average for every location, because regional differences had not carried forward from one period to the next in testing.' : `The hire rate from quality applications is each region’s own, blended with the role average by ${Rn}.`}`);
    s.head(['Location', 'Applications', 'Quality applications', 'Own quality rate', 'Quality adjustment used', 'Hires', 'Quality applications (hire months)', '', 'Own hire rate', 'Hire rate from quality applications used']);
    const locRow = {};
    plan.allRegions.forEach(l => {
      const t = r.location[l];
      if (!t) return;
      const row = s.rows.length + 1;
      locRow[l] = row;
      s.body([l, t.apps, t.passed,
        F(`IF($B$${row}>0,$C$${row}/$B$${row},"")`, t.ownScreen),
        M >= OFF ? F('1', 1) : F(`IF($B$${row}>0,($C$${row}/$D$${roleRow}+${M})/($B$${row}+${M}),1)`, t.screenAdjustment),
        t.hires, t.hirePassed, '',
        F(`IF($G$${row}>0,$F$${row}/$G$${row},"")`, t.ownHire),
        Rn >= OFF ? F(`$I$${roleRow}`, t.hireAfterScreening) : F(`($F$${row}+${Rn}*$I$${roleRow})/($G$${row}+${Rn})`, t.hireAfterScreening),
      ], [null, N0, N0, PCT1, N3, N0, N0, null, PCT1, PCT1]);
    });
    s.blank();
    s.add('title', ['The hire adjustment']);
    s.note('Predicted hires are scaled so that, applied to the applications the platforms actually recorded in the past months above, the quality and hire rates give the hires RAC’s tracking credited to Indeed, Meta, Google and Appcast. Where a share of other-source hires is credited to paid media, that share is added on the same basis.');
    s.head(['', 'Value', 'What it is', '', '', '', '', '', '', '']);
    const F1 = plan.factors;
    const paidRow = s.body(['Hire adjustment to platform hires', F1.paid, 'Hires Eploy credited to the four platforms over the model’s hires on those months'], [null, N4]);
    const creditRow = s.body(['Other-source hires per model hire', F1.credit, 'Hires Eploy recorded outside the four platforms over the model’s hires on those months'], [null, N4]);
    const shareRow = s.body(['Share credited to paid media', F1.share, 'Set for this plan'], [null, PCT1]);
    const reconRow = s.body(['Hire adjustment used on every row', F(`$B$${paidRow}+$B$${shareRow}*$B$${creditRow}`, F1.recon), 'The adjustment plus the credited share'], [null, N4]);
    return { sheet: s, roleRow, platRow, locRow, reconRow, col: { used: 6, adjustment: 5, hireUsed: 10, factor: 2 } };
  }

  // Every location and platform, left to right.
  function workings(plan, bi, rb, sm, f) {
    const cols = [
      { h: 'Location', w: 20 }, { h: 'Platform', w: 11 },
      { h: 'Total spend', w: 14, f: GBP2 }, { h: 'Fee rate', w: 10, f: PCT2 },
      { h: 'Media', w: 14, f: GBP2 }, { h: 'Fee', w: 13, f: GBP2 },
      { h: 'Spend in the window', w: 15, f: GBP2 }, { h: 'Applications in the window', w: 15, f: N1 },
      { h: 'Base cost per application', w: 16, f: GBP2 },
      { h: 'Platform figure for the role', w: 16, f: GBP2 },
      { h: 'Cost per application after the thin-data pull', w: 18, f: GBP2 }, { h: 'Thin-data adjustment', w: 13, f: N3 },
      { h: 'Average monthly spend', w: 15, f: GBP2 }, { h: 'Cost rises with spend (rate)', w: 13, f: N3 },
      { h: 'Diminishing returns adjustment', w: 14, f: N3 }, { h: RAC.text.costAdjustment(plan).label, w: 15, f: N3 },
      { h: 'CPA adjustments', w: 13, f: N3 },
      { h: 'Plan CPA (media)', w: 14, f: GBP2 },
      { h: 'Predicted applies', w: 13, f: N1 }, { h: 'Quality rate', w: 11, f: PCT1 }, { h: 'Quality applications', w: 14, f: N1 },
      { h: 'Hire rate from quality applications', w: 15, f: PCT1 }, { h: 'Hire adjustment', w: 12, f: N4 },
      { h: 'Predicted hires', w: 11, f: N1 }, { h: 'Plan CPH (media)', w: 13, f: GBP },
      { h: 'Spending cap (media)', w: 14, f: GBP }, { h: 'Cap basis', w: 34 },
      { h: 'Applications low', w: 13, f: N0 }, { h: 'Applications high', w: 13, f: N0 },
      { h: 'Hires low', w: 11, f: N1 }, { h: 'Hires high', w: 11, f: N1 },
      { h: 'Notes', w: 40 },
    ];
    const C = {};
    ['region', 'platform', 'spend', 'feeRate', 'media', 'fee', 'wSpend', 'wApps', 'histCpa', 'platCpa', 'usualCpa', 'thin',
      'usualSpend', 'rate', 'levelAdj', 'errorAdj', 'adjustments', 'plannedMedia', 'apps', 'quality', 'qualityApps',
      'hireRate', 'matching', 'hires', 'cph', 'cap', 'capBasis', 'appsLow', 'appsHigh', 'hiresLow', 'hiresHigh', 'notes']
      .forEach((k, i) => { C[k] = i + 1; });
    const s = makeSheet('Workings', { freeze: 1, columns: cols });
    s.title(`Every location and platform: ${plan.role}`,
      'Read left to right: past performance, the adjustments, the plan cost per application, then applications, quality applications and hires. Costs are on media spend; fees are their own column.');
    s.note('Written as values, not formulas: total spend (what the split between locations and platforms produced), the settings (fee rate, the rate cost rises with spend, the real-world CPA outcome adjustment), and the ranges (from simulated draws). Everything else is a formula, and the spending cap reads the Successful months sheet.');
    const headRow = s.head(cols.map(c => c.h));
    const checkRows = [];
    const totalRows = [];
    const cellRows = [];
    const MIN_H = RAC.tables.MIN_HIRES_FOR_CPH;
    plan.locations.forEach(loc => {
      const from = s.rows.length + 1;
      P().forEach(plat => {
        const c = loc.cells[plat];
        const r = s.rows.length + 1;
        const me = (k) => `$${colLetter(C[k])}$${r}`;
        const funded = c.spend > 0.005;
        const b = bi.rowOf[loc.region + '|' + plat];
        const wSpend = at(bi.sheet.name, bi.C.spend, b);
        const wApps = at(bi.sheet.name, bi.C.apps, b);
        const avg = at(bi.sheet.name, bi.C.avg, b);
        const typical = at(bi.sheet.name, bi.typicalCol, bi.typicalRow[plat]);
        const platFigure = at(bi.sheet.name, bi.pc.figure, bi.platRow[plat]);
        const K = RAC.assumptions.get(plan.A, 'cpa_prior_apps');
        const notes = [];
        if (!c.on) notes.push('platform set to no spend here');
        if (c.ceilingFlagged) notes.push('no successful month: cap from the average month');
        if (c.capByLimit) notes.push(`spend set by the cost per application limit of ${f.gbp(c.cpaLimit, 2)}`);
        if (c.aboveLargestSuccessful > 0.5) notes.push(`${f.gbp(c.aboveLargestSuccessful)} above the month the cap was based on`);
        if (c.range && c.range.hires && c.range.hires.lowConfidence) notes.push('low confidence: ' + c.range.hires.reasons.join(', '));
        const thin = c.thinAdjustment === null || c.thinAdjustment === undefined ? 1 : c.thinAdjustment;
        s.body([
          loc.region, L()[plat],
          c.spend, c.feeRate,
          funded ? F(`${me('spend')}/(1+${me('feeRate')})`, c.media) : 0,
          funded ? F(`${me('spend')}-${me('media')}`, c.fee) : 0,
          F(wSpend, c.historicSpend), F(wApps, c.historicApps),
          F(`IF(${me('wApps')}>0,${me('wSpend')}/${me('wApps')},${me('platCpa')})`, c.baseCpa),
          F(platFigure, c.platformCpa),
          F(`IF(${me('wApps')}>0,(${me('wApps')}*${me('histCpa')}+${K}*${me('platCpa')})/(${me('wApps')}+${K}),${me('platCpa')})`, c.usualCpa),
          F(`${me('usualCpa')}/${me('histCpa')}`, thin),
          F(`IF(${avg}>0,${avg},${typical})`, c.spendUsual),
          c.diminishingRate,
          funded ? F(`IF(AND(${me('media')}>0,${me('usualSpend')}>0),(${me('media')}/${me('usualSpend')})^(1-${me('rate')}),1)`, c.spendAdjustment) : '',
          c.remainingError,
          funded ? F(`${me('thin')}*${me('levelAdj')}*${me('errorAdj')}`, c.cpaAdjustments) : '',
          funded ? F(`${me('histCpa')}*${me('adjustments')}`, c.plannedCpaMedia) : '',
          funded ? F(`${me('media')}/${me('plannedMedia')}`, c.apps) : 0,
          rb.locRow[loc.region]
            ? F(`${at(rb.sheet.name, rb.col.used, rb.platRow[plat])}*${at(rb.sheet.name, rb.col.adjustment, rb.locRow[loc.region])}`, c.screenRate)
            : c.screenRate,
          funded ? F(`${me('apps')}*${me('quality')}`, c.passed) : 0,
          rb.locRow[loc.region] ? F(at(rb.sheet.name, rb.col.hireUsed, rb.locRow[loc.region]), c.hireAfterScreening) : c.hireAfterScreening,
          F(at(rb.sheet.name, rb.col.factor, rb.reconRow), c.reconciliation),
          funded ? F(`${me('apps')}*${me('quality')}*${me('hireRate')}*${me('matching')}`, c.hires) : 0,
          funded && c.hires >= MIN_H ? F(`${me('media')}/${me('hires')}`, c.media / c.hires) : '',
          sm.capRow[loc.region + '|' + plat] ? F(at(sm.sheet.name, sm.capCol, sm.capRow[loc.region + '|' + plat]), c.capByLimit ? c.cap / (1 + c.feeRate) : c.ceiling) : '',
          c.capByLimit ? `cost per application limit of ${f.gbp(c.cpaLimit, 2)}, in place of the cap` : capBasis(plan, c, f),
          funded && c.range ? c.range.apps.low : '', funded && c.range ? c.range.apps.high : '',
          funded && c.range && c.range.hires ? c.range.hires.low : '', funded && c.range && c.range.hires ? c.range.hires.high : '',
          notes.join('; '),
        ]);
        cellRows.push(r);
        checkRows.push({ label: `${loc.region} ${L()[plat]}`, spend: c.spend, cph: funded && c.hires > 0 ? c.media / c.hires : null });
      });
      const to = s.rows.length;
      totalRows.push(groupTotal(s, C, `${loc.region} total`, from, to, loc, f));
      checkRows.push({ label: `${loc.region} total`, spend: loc.spend, cph: loc.spend > 0 && loc.hires > 0 ? loc.media / loc.hires : null });
    });
    const totalRow = groupTotal(s, C, 'Plan total', null, null, plan.totals, f, totalRows);
    checkRows.push({ label: 'Plan total', spend: plan.totals.spend, cph: plan.totals.cph });
    s.blank();
    const ca = RAC.text.costAdjustment(plan);
    s.note(`Plan CPA (media) = base cost per application x CPA adjustments, where the CPA adjustments = thin-data adjustment x diminishing returns adjustment x ${ca.label.charAt(0).toLowerCase() + ca.label.slice(1)}${ca.extra ? ` (${ca.basis})` : ''}. Predicted applies = media / plan CPA. Predicted hires = predicted applies x quality rate x hire rate from quality applications x hire adjustment. Plan CPH (media) = media / predicted hires, left blank under ${MIN_H} hires.`);
    const idle = plan.allRegions.filter(r => !plan.locations.some(l => l.region === r));
    if (idle.length) s.note('Locations not in this plan (no VAFs, or set to no spend): ' + idle.join(', ') + '.');
    s.note('Ranges are the 10th and 90th percentiles of simulated draws, so they cannot be written as formulas. The Back-test sheet shows the misses they start from.');
    return { sheet: s, C, totalRow, cellRows, checkRows, headRow };
  }

  // A total row: the sums of a group of rows, and the ratios from those sums
  // (costs on media).
  function groupTotal(s, C, label, from, to, roll, f, rows) {
    const r = s.rows.length + 1;
    const me = (k) => `$${colLetter(C[k])}$${r}`;
    const sumOf = (k) => (rows ? `SUM(${rows.map(x => `$${colLetter(C[k])}$${x}`).join(',')})` : `SUM($${colLetter(C[k])}$${from}:$${colLetter(C[k])}$${to})`);
    const cells = new Array(C.notes).fill('');
    cells[C.region - 1] = label;
    [['spend', 'spend'], ['media', 'media'], ['fee', 'fee'], ['apps', 'apps'], ['qualityApps', 'passed'], ['hires', 'hires']]
      .forEach(([col, key]) => { cells[C[col] - 1] = F(sumOf(col), roll[key]); });
    cells[C.plannedMedia - 1] = F(`IF(${me('apps')}>0,${me('media')}/${me('apps')},"")`, roll.apps > 0 ? roll.media / roll.apps : null);
    cells[C.cph - 1] = roll.hires > 0 ? F(`IF(${me('hires')}>0,${me('media')}/${me('hires')},"")`, roll.media / roll.hires) : '';
    cells[C.quality - 1] = F(`IF(${me('apps')}>0,${me('qualityApps')}/${me('apps')},"")`, roll.apps > 0 ? roll.passed / roll.apps : null);
    if (roll.range) {
      cells[C.appsLow - 1] = roll.range.apps.low;
      cells[C.appsHigh - 1] = roll.range.apps.high;
      if (roll.range.hires) { cells[C.hiresLow - 1] = roll.range.hires.low; cells[C.hiresHigh - 1] = roll.range.hires.high; }
    }
    s.total(cells);
    return r;
  }

  function capBasis(plan, c, f) {
    return `${c.ceilingBasis} ${f.gbp(c.ceilingBase)} ${f.mult(plan.capMultiple)}${c.feeRate > 0 ? '; planned spend is capped at it plus the fee' : ''}`;
  }

  // The front page: what went in, what came out.
  function summary(plan, doc, w, opts, f) {
    const s = makeSheet('Summary', { columns: [{ w: 46 }, { w: 18, f: GBP2 }, { w: 60 }, { w: 16 }, { w: 16 }, { w: 16 }] });
    s.title(`RAC ${opts.monthLabel || ''} ${doc.roleName} plan: workings`.replace(/\s+/g, ' ').trim(),
      `Prepared by Enhance Media${opts.planName ? ' · ' + opts.planName : ''}`);
    s.note(RAC.stamp.line(plan, opts.code));
    s.blank();
    const W = (k, row) => at(w.sheet.name, w.C[k], row || w.totalRow);
    s.add('title', ['The budget']);
    s.head(['', 'Amount', 'What it is', '', '', '']);
    const bRow = s.body(['Monthly budget', plan.budget, plan.fees.on ? 'Set for this plan. It includes platform fees.' : 'Set for this plan.']);
    const pmRow = s.body(['Indeed Premium, media', plan.holdbacks.premiumMedia,
      `${plan.inputs.premiumCampaigns || 0} campaigns x ${plan.daysInMonth} days x ${f.gbp(RAC.assumptions.get(plan.A, 'indeed_premium_rate'))} a day`]);
    const pfRow = s.body(['Indeed Premium, platform fee', plan.holdbacks.premiumFee,
      plan.fees.on ? `${f.pct(plan.fees.rates.indeed, 2)} of the media above` : 'No fees on this plan']);
    const pRow = s.body(['Indeed Premium hold-back', F(`$B$${pmRow}+$B$${pfRow}`, plan.holdbacks.premium), 'Media and fee together']);
    const cRow = s.body(['Combined Activity reserve', plan.holdbacks.combined, 'Set for this plan.']);
    const oRow = s.body(['OneRAC hold-back', plan.holdbacks.oneRac, 'Set for this plan']);
    const dRow = s.body(['Deployable budget', F(`$B$${bRow}-$B$${pRow}-$B$${cRow}-$B$${oRow}`, plan.deployable), 'What is left for the locations']);
    const placedRow = s.body(['Placed in the plan', F(W('spend'), plan.placed), 'Workings sheet, plan total: media plus fees']);
    s.body(['  of which media', F(W('media'), plan.totals.media), 'What reaches the platforms']);
    // Fees on placed spend only; the Indeed Premium fee is in its own row above (X1).
    s.body(['  of which platform fees', F(W('fee'), plan.fees.placed),
      plan.fees.on
        ? `Indeed ${f.pct(plan.fees.rates.indeed, 2)}, Meta ${f.pct(plan.fees.rates.meta, 2)} and Google ${f.pct(plan.fees.rates.google, 2)} of media spend. The Indeed Premium fee is in its own row.`
        : `This plan is for ${f.month(plan.fees.planMonth || '') || 'a month before fees applied'}; fees apply from ${f.month(plan.fees.firstMonth)} plans.`]);
    s.body(['Budget the plan could not place efficiently', F(`$B$${dRow}-$B$${placedRow}`, plan.unplaced.total),
      plan.unplaced.reasons.length ? 'Held back by: ' + plan.unplaced.reasons.join('; ') : 'None']);
    s.blank();
    s.add('title', ['What the plan predicts']);
    s.head(['', 'Figure', 'What it is', 'Range low', 'Range high', '']);
    const r = plan.totals.range || {};
    s.body(['Predicted applications', F(W('apps'), plan.totals.apps), 'Workings sheet, plan total',
      r.apps ? r.apps.low : '', r.apps ? r.apps.high : '', ''], [null, N0, null, N0, N0]);
    s.body(['Quality applications', F(W('qualityApps'), plan.totals.passed), 'Applications x quality rate', '', '', ''], [null, N0]);
    s.body(['Predicted hires from paid media', F(W('hires'), plan.totals.hires), 'Workings sheet, plan total',
      r.hires ? r.hires.low : '', r.hires ? r.hires.high : '', ''], [null, N1, null, N1, N1]);
    const otherRow = s.body(['Expected hires from other sources', plan.totals.otherHires,
      `${f.num(plan.otherHiresMonthly)} a month, ${plan.otherSources.basis}${plan.otherHiresShare > 0 ? `, less the ${f.pct(plan.otherHiresShare)} credited to paid media` : ''}. Counted towards the hire target; not modelled on the budget. We aim to model this in future.`,
      r.otherHires ? r.otherHires.low : '', r.otherHires ? r.otherHires.high : '', ''], [null, N1, null, N1, N1]);
    s.body(['All predicted hires', F(`$B$${otherRow - 1}+$B$${otherRow}`, plan.totals.allHires), 'Paid media and other sources',
      r.allHires ? r.allHires.low : '', r.allHires ? r.allHires.high : '', ''], [null, N1, null, N1, N1]);
    s.body(['Cost per application (media)', F(W('plannedMedia'), plan.totals.cpa), 'Media spend over applications', '', '', ''], [null, GBP2]);
    s.body(['Cost per hire, paid media (media)', F(W('cph'), plan.totals.cph), 'Media spend over predicted hires from paid media', '', '', ''], [null, GBP]);
    // Spend above past levels, in three parts that do not overlap (point 29).
    const capFirst = f.month(RAC.assumptions.get(plan.A, 'ceiling_first_month'));
    const placedCells = plan.locations.flatMap(l => P().map(q => l.cells[q])).filter(c => c.spend > 0.005);
    const unrun = placedCells.filter(c => !(c.largestMonth > 0));
    const unrunTotal = unrun.reduce((a, c) => a + c.aboveLargestMonth, 0);
    const aboveRun = Math.max(0, plan.aboveLargestMonth.total - unrunTotal);
    s.body(['Spend above the month each cap was based on', plan.aboveLargestSuccessful.total,
      `${f.pct(plan.aboveLargestSuccessful.share)} of the money placed, on media`, '', '', ''], [null, GBP]);
    s.body([`Spend above the largest month the row ran since ${capFirst}`, aboveRun,
      `${f.pct(plan.placed > 0 ? aboveRun / plan.placed : 0)} of the money placed, on media`, '', '', ''], [null, GBP]);
    s.body([`Spend in rows with no spend of their own since ${capFirst}`, unrunTotal,
      unrun.length ? unrun.map(c => `${c.region} ${L()[c.platform]}`).join(', ') : 'None', '', '', ''], [null, GBP]);
    RAC.text.capsPoint(plan).forEach(x => s.note(x));
    s.blank();
    const tt = RAC.text.targetText(plan);
    s.add('title', [plan.hireTarget > 0 ? `The budget for ${plan.hireTarget} hires` : 'The budget for the target']);
    if (plan.hireTarget > 0) {
      s.body(['Hire target', plan.hireTarget, 'Set for this plan'], [null, N1]);
      s.body(['less expected hires from other sources', plan.otherHires, 'Counted towards the target; not modelled on the budget'], [null, N1]);
      s.body(['Paid-media hires needed', plan.paidGoal, 'The rest has to come from the budget'], [null, N1]);
    }
    if (plan.otherSourcesMeetTarget) {
      s.body(['Budget for the target', plan.budgetForTarget, 'Hold-backs only: hires expected from other sources alone reach the target']);
    } else if (!plan.unreachable && plan.atTarget) {
      s.body(['Hold-backs', plan.atTarget.holdbacks, 'Indeed Premium, Combined Activity and any OneRAC hold-back']);
      s.body(['Placed for those hires', plan.atTarget.placed, `Buys ${f.num(plan.atTarget.paidHires)} paid-media hires`]);
      s.body(['Budget for the target', plan.budgetForTarget, `The lowest budget, in £50 steps, that reaches the target (hold-backs plus placed, ${f.gbp(plan.atTarget.holdbacks + plan.atTarget.placed)}, rounded up)`]);
    } else if (plan.unreachable) {
      const a = plan.atSaturation || {};
      s.body(['Most hires within the spending caps', plan.maxAchievable, `${f.num(a.paidHires)} from paid media plus ${f.num(plan.otherHires)} from other sources`], [null, N1]);
      s.body(['Placed at that point', a.placed, 'Every location and platform at its cap']);
      s.body(['Hold-backs', a.holdbacks, 'Indeed Premium, Combined Activity and any OneRAC hold-back']);
      s.body(['Total budget where hires stop rising', plan.saturationBudget, 'Placed plus hold-backs, rounded up to £50']);
      s.note(RAC.text.reachSentence(plan));
      s.head(['Spending cap multiple', 'Hires at this budget', 'Budget not placed', 'Budget for the target', 'Most hires', 'Total budget where hires stop rising']);
      (plan.reach ? plan.reach.byMultiple : []).forEach(x => {
        s.body([`${f.mult(x.multiple)}${x.current ? ' (this plan)' : ''}`, x.hiresAtBudget, x.unplacedAtBudget,
          x.budgetForTarget === null ? 'out of reach' : x.budgetForTarget,
          x.mostHires === null ? '' : x.mostHires, x.saturationBudget === null ? '' : x.saturationBudget],
        [null, N1, GBP, GBP, N1, GBP]);
      });
    }
    tt.lines.filter(l => /minimums/.test(l)).forEach(l => s.note(l));
    const lim = (plan.inputs && plan.inputs.limits) || {};
    const limitRows = [];
    Object.keys(lim.cph || {}).forEach(r => { if (lim.cph[r] > 0) limitRows.push([`Most a hire may cost (media): ${r}`, lim.cph[r], 'Set for this plan']); });
    Object.keys(lim.cpa || {}).forEach(r => P().forEach(q => {
      if ((lim.cpa[r] || {})[q] > 0) limitRows.push([`Most an application may cost (media): ${r} ${L()[q]}`, lim.cpa[r][q], 'Set for this plan; replaces that row’s spending cap']);
    }));
    s.blank();
    s.add('title', ['Cost limits']);
    if (!limitRows.length) s.note('None set for this plan.');
    else {
      s.head(['', 'Limit', 'Where it came from', '', '', '']);
      limitRows.forEach(row => s.body(row, [null, GBP2]));
    }
    if (plan.minimumShortfalls.length) {
      s.blank();
      s.add('title', ['Minimums the spending caps did not allow']);
      plan.minimumShortfalls.forEach(x => s.note(x.text));
    }
    // The months each part of the model used, and whether each follows the
    // data window or a fixed rule (the same list as the Method text).
    s.blank();
    s.add('title', ['Months used']);
    s.head(['Part of the model', '', 'Months and weights', '', '', '']);
    RAC.text.monthsUsed(plan.A, doc.role, plan, opts.backtest).forEach(r => s.body([r.part, '', `${r.months}. This follows ${r.basis}.`]));
    if (plan.settlingUsed.length) {
      s.blank();
      s.add('title', ['Months still settling']);
      plan.settlingUsed.forEach(x => s.note(`${f.month(x.month)}: ${x.note} (${x.reason})`));
    }
    s.blank();
    s.note('The budget and prediction figures are settings or formulas reading the Workings sheet, so the workbook and the plan cannot disagree. Spend above past levels and the budget for the target are the planner’s own figures.');
    return s;
  }

  function assumptionsSheet(plan, doc, f) {
    const s = makeSheet('Assumptions', { freeze: 1, columns: [
      { w: 30 }, { w: 52 }, { w: 14 }, { w: 14 }, { w: 14 }, { w: 12 }, { w: 22 }, { w: 12 }, { w: 90 },
    ] });
    s.title('Every value this plan used', 'Every value comes from one list of assumptions set by Enhance, held apart from the calculations. A plan can set the fields marked as a plan value; the rest are the same for every plan until the list is changed.');
    s.head(['Key', 'What it is', 'Value used', 'This plan', 'Testing gave', 'Unit', 'Source', 'Date', 'Notes']);
    // The data behind the plan: the months it actually used (user, 22 September 2026).
    const used = Object.fromEntries(RAC.text.monthsUsed(plan.A, doc.role, plan).map(r => [r.key, r]));
    const roleName = doc.role === 'OneRAC' ? 'SMR and Patrol' : doc.role;
    s.body(['data_ad_platforms', 'Monthly spend and applications by location and platform', '', '', '', 'months', "RAC's data", '',
      `RAC's monthly ${roleName} spend and application data, as used for cost per application: ${used.cost ? used.cost.months : 'none'}. Spending caps: ${used.caps ? used.caps.months : 'none'}.`]);
    s.body(['data_applicant_tracking', 'Quality and hire rates', '', '', '', 'months', "RAC's data", '',
      `RAC's applicant tracking data: quality rates from ${used.quality ? used.quality.months : 'none'}; hire rates from ${used.hires ? used.hires.months : 'none'}.`]);
    RAC.text.assumptionRows(plan.A, doc.role, plan, { client: true }).forEach(row => {
      s.body([row.key, row.name,
        row.value === null || row.value === undefined ? '' : row.value,
        row.plan === null || row.plan === undefined ? '' : row.plan,
        row.tested === null || row.tested === undefined ? '' : row.tested,
        row.unit, row.source, row.date, row.notes]);
    });
    return s;
  }

  // Each test month predicted from earlier months only, and the plan range
  // those misses set.
  function backtestSheet(plan, doc, backtest, f) {
    const s = makeSheet('Back-test', { freeze: 1, columns: [
      { w: 14 }, { w: 24 }, { w: 14, f: GBP }, { w: 16, f: N1 }, { w: 16, f: N1 }, { w: 12, f: PCT1 }, { w: 14 }, { w: 14 }, { w: 40 },
    ] });
    s.title('How far the model missed on past months',
      'Each month was predicted from the months before it only, at that month’s actual spend and mix. The miss is actual over predicted, less one.');
    const bt = backtest && backtest.roles && backtest.roles[doc.role];
    if (!bt) {
      s.note('The test results were not available when this plan was built, so this sheet is empty.');
      return s;
    }
    s.note(`${bt.data}; ${bt.eploy}. Window: ${windowName(backtest.window)}. Rate in use ${bt.used.roleRate}, real-world CPA outcome adjustment ${bt.used.adjustment}.`);
    s.blank();
    s.add('title', ['Applications']);
    const head = s.head(['Test month', 'Learned from', 'Spend', 'Predicted applications', 'Actual applications', 'Miss', '', '', '']);
    const first = head + 1;
    // The miss worked out again from the figures printed here, so the sheet
    // adds up on its own. The test results file holds them rounded.
    const missOf = (m) => (m.predicted > 0 ? m.actual / m.predicted - 1 : null);
    bt.applications.forEach(m => {
      s.body([m.month, m.learnedFrom, m.spend, m.predicted, m.actual, F(`IF($D$${s.rows.length + 1}>0,$E$${s.rows.length + 1}/$D$${s.rows.length + 1}-1,"")`, missOf(m))]);
    });
    const last = s.rows.length;
    const misses = span(s.name, 6, first, last);
    const ms = bt.applications.map(missOf).filter(x => x !== null);
    const mean = ms.reduce((a, x) => a + Math.log(1 + x), 0) / (ms.length || 1);
    const sigma = Math.sqrt(ms.reduce((a, x) => a + (Math.log(1 + x) - mean) ** 2, 0) / Math.max(1, ms.length - 1));
    s.blank();
    s.add('title', ['The plan range']);
    const pLow = RAC.assumptions.get(plan.A, 'range_low_percentile');
    const pHigh = RAC.assumptions.get(plan.A, 'range_high_percentile');
    s.head(['', 'From the rows above', 'How it is worked out', 'Value used in this plan', '', '', '', '', '']);
    s.body([`Lower end (${f.pct(pLow)} of misses)`, F(`_xlfn.PERCENTILE.INC(${misses},${pLow})`, RAC.util.percentileInc(ms, pLow)),
      'Excel PERCENTILE.INC over the misses above', plan.ranges.apps.low], [null, PCT1, null, PCT1]);
    s.body([`Upper end (${f.pct(pHigh)} of misses)`, F(`_xlfn.PERCENTILE.INC(${misses},${pHigh})`, RAC.util.percentileInc(ms, pHigh)),
      'Excel PERCENTILE.INC over the misses above', plan.ranges.apps.high], [null, PCT1, null, PCT1]);
    const n = ms.length;
    s.body(['Spread of the misses (log)',
      F(`SQRT((SUMPRODUCT(LN(1+${misses})^2)-SUMPRODUCT(LN(1+${misses}))^2/${n})/${n - 1})`, sigma),
      'Standard deviation of log(1 + miss), written with SUMPRODUCT so it works without being entered as an array formula', plan.ranges.apps.sigma], [null, N4, null, N4]);
    s.body(['Row widening strength', plan.ranges.widen, 'Applications of evidence at which a row’s range is half as wide again as the plan’s'], [null, N0]);
    s.note('The values used were recorded to four decimal places. The figures worked out here start from the rounded predictions above, so they can differ in the fourth decimal place.');
    s.blank();
    s.add('title', ['Cost misses before the real-world CPA outcome adjustment']);
    s.note(`The adjustment applies only where the misses sit on the same side of 1 with any one test month left out. For ${doc.role} they ${bt.sameDirection ? 'did, so the tested figure of ' + bt.tested.adjustment + ' is used' : 'did not, so the adjustment is 1.00'}.`);
    s.head(['Month', 'Predicted applications', 'Actual applications', 'Cost miss', '', '', '', '', '']);
    bt.costMissesNoAdjustment.forEach(m => s.body([m.month, m.predicted, m.actual, m.costMiss], [null, N1, N1, PCT1]));
    s.blank();
    s.add('title', ['Hire check (not used for the ranges)']);
    s.note(bt.hiresCheck.note);
    s.head(['Month', 'Predicted hires', 'Hires Eploy credited to the platforms', 'Miss', '', '', '', '', '']);
    bt.hiresCheck.months.forEach(m => s.body([m.month, m.predicted, m.actual, m.miss], [null, N1, N1, PCT1]));
    return s;
  }

  // Every month tested for the spending caps, and the cap it set. The tests,
  // "Counted" and each month's cap are formulas over the cells beside them,
  // so the sheet shows the tests being applied (points 35 and 36). Caps are
  // on media spend; planned spend is capped at the cap plus any fee.
  function successfulMonths(plan, f) {
    const A = plan.A;
    const drop = RAC.assumptions.get(A, 'quality_test_drop');
    const s = makeSheet('Successful months', { freeze: 1, columns: [
      { w: 20 }, { w: 11 }, { w: 11 }, { w: 13, f: GBP2 }, { w: 13, f: N1 }, { w: 15, f: GBP2 }, { w: 17, f: GBP2 },
      { w: 11 }, { w: 13, f: PCT1 }, { w: 13, f: PCT1 }, { w: 26 }, { w: 11 }, { w: 16, f: GBP2 },
    ] });
    const capMonths = plan.capBenchmarkMonths || [];
    s.title('Which past months counted towards the spending caps',
      `Months ${f.span(capMonths)} with at least ${f.gbp(RAC.assumptions.get(A, 'ceiling_min_spend'))} of spend and ${RAC.assumptions.get(A, 'ceiling_min_apps')} applications. A month counted when its actual cost per application was at or below the success-test benchmark at that month’s spend, and the location’s quality rate was no more than ${f.pct(drop)} below the rate expected for it that month. ${RAC.text.capLimitsText(RAC.assumptions.get(A, 'cap_row_usual_limit'), RAC.assumptions.get(A, 'cap_location_month_limit'))}`);
    s.note('Success-test benchmark: the location and platform’s own average cost per application over the same months, each counted once, adjusted for that month’s spend, with no real-world CPA outcome adjustment, so the caps do not change with a plan’s data window. The planning cost per application (on each cap row) is different: it uses the plan’s data window (recent months can count twice), the pull towards the platform figure where evidence is thin, the real-world CPA outcome adjustment, and the planned spend. So the two figures differ.');
    s.note('Expected quality rate: the location’s average quality rate x that month’s quality rate across all locations over their average. The test applies where at least ' +
      `${RAC.assumptions.get(A, 'quality_test_min_expected')} quality applications were expected, in months whose quality outcomes had settled. A cost per application limit set for a plan does not change which months count; it replaces the row’s cap for the month planned.`);
    s.head(['Location', 'Platform', 'Month', 'Spend', 'Applications', 'Actual cost that month', 'Success-test benchmark at that spend',
      'Cost test', 'Quality rate that month', 'Expected quality rate', 'Quality test', 'Counted', 'Cap this month sets (media)']);
    const C = { spend: 4, apps: 5, cpa: 6, bench: 7, cost: 8, qRate: 9, qExp: 10, qTest: 11, counted: 12, cap: 13 };
    const L_ = (k, r) => `$${colLetter(C[k])}$${r}`;
    const capRow = {};
    plan.locations.forEach(loc => P().forEach(plat => {
      const c = loc.cells[plat];
      const from = s.rows.length + 1;
      const limit = c.ceilingRowLimit;
      c.ceilingMonths.forEach(m => {
        const r = s.rows.length + 1;
        const q = m.quality;
        const counted = m.successful;
        s.body([loc.region, L()[plat], m.month, m.spend, m.apps,
          F(`IF(${L_('apps', r)}>0,${L_('spend', r)}/${L_('apps', r)},"")`, m.cpa),
          m.expected,
          F(`IF(${L_('cpa', r)}<=${L_('bench', r)}+0.000001,"yes","no")`, null),
          q.applied ? q.rate : '', q.applied ? q.expectedRate : '',
          q.applied ? F(`IF(${L_('qRate', r)}>=${L_('qExp', r)}*(1-${drop})-0.000000001,"passed","set aside")`, null) : `not applied: ${q.reason}`,
          F(`IF(AND(${L_('cost', r)}="yes",${L_('qTest', r)}<>"set aside"),"yes","no")`, null),
          F(`IF(${L_('counted', r)}="yes",${limit !== null ? `MIN(${L_('spend', r)},${limit})` : L_('spend', r)}*${plan.capMultiple},"")`,
            counted ? Math.min(m.spend, limit !== null ? limit : Infinity) * plan.capMultiple : null),
        ]);
      });
      const to = s.rows.length;
      const r = s.rows.length + 1;
      const media = c.capByLimit ? (Number.isFinite(c.cap) ? c.cap / (1 + c.feeRate) : null) : c.ceiling;
      const capCell = c.capByLimit ? media
        : c.ceilingMonths.length ? F(`IF(COUNT($M$${from}:$M$${to})>0,MAX($M$${from}:$M$${to}),${c.ceilingBase}*${plan.capMultiple})`, c.ceiling)
          : F(`${c.ceilingBase}*${plan.capMultiple}`, c.ceiling);
      s.total([`${loc.region} ${L()[plat]} cap`, '', '', '', '', 'Planning cost per application (media)',
        c.spend > 0.005 ? c.plannedCpaMedia : '', '', '', '',
        c.capByLimit ? `replaced by the cost per application limit of ${f.gbp(c.cpaLimit, 2)} set for this plan` : capBasis(plan, c, f), '', capCell]);
      capRow[loc.region + '|' + plat] = r;
    }));
    // Location spending caps: the most each location spent in one month, all
    // platforms together, x the multiple.
    s.blank();
    s.add('title', ['Location spending caps']);
    s.head(['Location', 'Month', 'Indeed', 'Meta', 'Google', 'Appcast', 'Most in one month', 'Location cap (media)', 'Platform caps added up (media)', 'Which held', '', '', '']);
    plan.locations.forEach(loc => {
      const lc = loc.locationCap || { on: false };
      const rowSum = P().reduce((a, q) => { const c = loc.cells[q]; const m = c.capByLimit ? c.cap / (1 + c.feeRate) : c.ceiling; return a + (c.on && Number.isFinite(m) ? m : 0); }, 0);
      if (!lc.on) { s.body([loc.region, lc.month || '', '', '', '', '', lc.media || 0, 'none', rowSum, 'platform caps']); return; }
      const extra = loc.limitExtra > 0 ? ` (raised by ${f.gbp(loc.limitExtra)} for cost limits)` : '';
      s.body([loc.region, lc.month, lc.byPlat.indeed, lc.byPlat.meta, lc.byPlat.google, lc.byPlat.appcast, lc.media, lc.capMedia, rowSum,
        (lc.capMedia < rowSum - 0.005 ? 'location cap' : 'platform caps') + extra], [null, null, GBP2, GBP2, GBP2, GBP2, GBP2, GBP2, GBP2, null]);
    });
    s.note(`The location cap is ${RAC.assumptions.get(A, 'cap_location_month_limit')} x the most in one month x the spending cap multiple (${f.mult(plan.capMultiple)}), on media spend; planned spend is capped at it with each platform’s fee added where fees apply.`);
    return { sheet: s, capRow, capCol: C.cap };
  }

  function allocationSteps(plan, f) {
    const s = makeSheet('Allocation steps', { freeze: 1, columns: [{ w: 22 }, { w: 20 }, { w: 12 }, { w: 15, f: GBP2 }, { w: 80 }] });
    s.title('Every move the split made', 'The deployable budget starts split by open roles. These are the moves the minimums, maximums, spending caps and cost limits then made.');
    s.head(['Step', 'Location', 'Platform', 'Amount moved', 'Why']);
    if (!plan.steps.length) s.body(['', '', '', '', 'No money had to move: every location and platform took its share.']);
    plan.steps.forEach(x => s.body([x.step, x.region || '', x.platform ? L()[x.platform] : '', x.amount, x.reason]));
    s.blank();
    s.add('title', ['What could not be placed']);
    s.body(['Budget the plan could not place efficiently', '', '', plan.unplaced.total, plan.unplaced.reasons.join('; ') || 'nothing left over']);
    plan.minimumShortfalls.forEach(x => s.body(['Minimum not met', x.region || '', x.platform ? L()[x.platform] : '', x.short, x.text]));
    return s;
  }

  function methodSheet(plan, doc, backtest) {
    const s = makeSheet('Method', { columns: [{ w: 34 }, { w: 120 }] });
    s.title('How the plan was worked out', 'The same words as the method pages of the PDF.');
    RAC.text.method(plan.A, doc.role, plan, backtest).forEach(sec => {
      s.add('title', [sec.heading]);
      sec.paras.forEach(p => s.body(['', p]));
      s.blank();
    });
    s.add('title', ['Glossary']);
    s.head(['Term', 'What it means']);
    RAC.text.glossary(plan.A, doc.role, plan).forEach(g => s.body([g.term, g.text]));
    return s;
  }

  // ---- building, checking, writing ---------------------------------------

  function build(docs, opts = {}) {
    const doc = docs[0];
    const plan = doc.plan;
    const f = RAC.text.fmt;
    if (!plan.raw) throw new Error('This plan was built before the workings export needed the monthly figures. Reload the app and build it again.');
    const ds = dataSources(plan, f);
    const bi = blendInputs(plan, ds, f);
    const rb = rateBuildUp(plan, f);
    const sm = successfulMonths(plan, f);
    const w = workings(plan, bi, rb, sm, f);
    const sheets = [
      summary(plan, doc, w, opts, f),
      w.sheet,
      assumptionsSheet(plan, doc, f),
      ds.sheet,
      bi.sheet,
      rb.sheet,
      backtestSheet(plan, doc, opts.backtest, f),
      sm.sheet,
      allocationSteps(plan, f),
      methodSheet(plan, doc, opts.backtest),
    ];
    const checks = [];
    const texts = [];
    sheets.forEach(sheet => sheet.rows.forEach((row, i) => row.cells.forEach((v, j) => {
      if (isF(v)) {
        if (v.value !== null) checks.push({ sheet: sheet.name, ref: `${colLetter(j + 1)}${i + 1}`, formula: v.formula, value: v.value });
      } else if (typeof v === 'string' && v) texts.push(v);
    })));
    const problems = [
      ...RAC.outputChecks.text(texts.join('\n')),
      ...RAC.outputChecks.pdfRows(w.checkRows),
    ];
    return { sheets, checks, texts, rows: w.checkRows, problems, totalRow: w.totalRow };
  }

  const NAVY = 'FF14213D', HEAD = 'FFE8ECF2', LINE = 'FFD6DBE2', MUTED = 'FF6E757D', ZEBRA = 'FFFAFBFD';

  function write(ExcelJS, built, opts = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Enhance Media';
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };   // so a reader recalculates every formula
    built.sheets.forEach(sheet => {
      const ws = wb.addWorksheet(sheet.name);
      sheet.rows.forEach((row) => {
        // Formulas are written without a saved answer, so the spreadsheet
        // works every one of them out when it opens. A saved answer could go
        // stale, and a reader would show it without noticing.
        // Blank cells are left empty (not an empty string), so long text in the
        // cell before them can run across instead of being cut off.
        // Header rows keep empty strings, so their fill runs the full width.
        const blank = row.kind === 'head' ? '' : null;
        const r = ws.addRow(row.cells.map(v => (isF(v) ? { formula: v.formula } : (v === null || v === undefined || v === '' ? blank : v))));
        style(r, row, sheet);
      });
      (sheet.columns || []).forEach((c, i) => { ws.getColumn(i + 1).width = c.w || 16; });
      if (sheet.freeze) {
        const headIndex = sheet.rows.findIndex(x => x.kind === 'head');
        if (headIndex >= 0) ws.views = [{ state: 'frozen', ySplit: headIndex + 1 }];
      }
    });
    void opts;
    return wb;
  }

  // A header row tall enough for its longest label once wrapped to the column
  // width (10pt bold: about one character per width unit, 13.5 points a line).
  function headHeight(row, sheet) {
    const lines = row.cells.map((v, i) => {
      if (typeof v !== 'string' || !v) return 1;
      const w = Math.max(4, (((sheet.columns || [])[i] || {}).w || 16) - 1);
      let n = 1, len = 0;
      v.split(' ').forEach(word => {
        const add = (len ? 1 : 0) + word.length;
        if (len && len + add > w) { n += 1; len = word.length; } else len += add;
      });
      return n;
    });
    return Math.max(20, 6 + 13.5 * Math.max(...lines));
  }

  function style(r, row, sheet) {
    if (row.kind === 'title') {
      r.font = { bold: true, size: 13, color: { argb: NAVY } };
      r.height = 24;
      return;
    }
    if (row.kind === 'sub' || row.kind === 'note') {
      r.font = { size: 10, color: { argb: MUTED } };
      r.alignment = { wrapText: false };
      return;
    }
    if (row.kind === 'blank') return;
    if (row.kind === 'head') {
      r.height = headHeight(row, sheet);
      r.eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        cell.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left' };
      });
      return;
    }
    const fmts = row.fmt || (sheet.columns || []).map(c => c.f);
    r.eachCell({ includeEmpty: true }, (cell, n) => {
      const col = (sheet.columns || [])[n - 1] || {};
      cell.font = { size: 10, bold: row.kind === 'total' };
      cell.alignment = { vertical: 'middle', horizontal: col.a || 'left' };
      const nf = (fmts && fmts[n - 1]) || col.f;
      if (nf && typeof cell.value !== 'string') cell.numFmt = nf;
      cell.border = { bottom: { style: 'hair', color: { argb: LINE } } };
      if (row.kind === 'total') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } };
        cell.border = { top: { style: 'thin', color: { argb: NAVY } }, bottom: { style: 'thin', color: { argb: NAVY } } };
      } else if (row.zebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    });
  }

  function fileName(docs, opts) {
    const month = (opts.monthLabel || '').replace(/\s+/g, '_');
    return `RAC_${month}_${docs.map(d => d.role).join('_')}_Workings.xlsx`;
  }

  async function save(ExcelJS, docs, opts = {}) {
    const built = build(docs, opts);
    if (built.problems.length) throw new Error('The workings export failed its checks, so it was not saved:\n' + built.problems.join('\n'));
    const wb = write(ExcelJS, built, opts);
    const buf = await wb.xlsx.writeBuffer();
    const name = fileName(docs, opts);
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    return name;
  }

  RAC.workings = { build, write, save, fileName, colLetter };
})(window.RAC = window.RAC || {});
