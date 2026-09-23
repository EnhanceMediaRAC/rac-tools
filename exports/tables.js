// RAC planner: the plan's tables, built once for the PDF and the Plan tab so
// both show the same columns, in the same order, with the same figures (user
// decision, 22 September 2026).
//
// Every table uses one column set, in this order:
//   Total spend, Fee, Media, Plan CPA (media), Predicted applies, Quality
//   rate, Hire rate from quality applies, Hire adjustment, Plan CPH (media),
//   Predicted hires
// The location table adds Notes and VAFs after them. The platform x location
// tables add Base CPA and CPA adjustments before Plan CPA. Ranges sit as a
// second line under Plan CPA, Predicted applies, Plan CPH and Predicted hires.
// There is no spending cap column; the caps are a point in the summary.
//
// Totals (user decision, 22 September 2026): spend, fee, media, applications
// and hires in the location and platform tables are the sums of the platform
// x location rows; rates and costs are totals divided by totals.
// Money columns, predicted applies and predicted hires are all rounded by
// largest remainder, so the printed rows add to the printed total (user
// decision, 23 September 2026). A row's total spend can then differ from its
// printed media plus its printed fee by up to £1, which the table note says.
//
//   RAC.tables.locations(plan)   { key, title, columns, rows, notes }
//   RAC.tables.platforms(plan)
//   RAC.tables.cells(plan, platform)
//   RAC.tables.all(plan)         [locations, platforms, ...cells]
//     columns: [{ key, label, align, w }]   w: PDF width in mm
//     rows:    [{ label, cells: [string | [main, second line]], total, warn,
//                 spend, media, hires }]
(function (RAC) {
  'use strict';
  const P = () => RAC.PLATFORMS;
  const L = () => RAC.PLATFORM_LABELS;
  const F = () => RAC.text.fmt;
  const U = () => RAC.util;

  // Rows predicting fewer hires than this show no cost per hire (point 24).
  const MIN_HIRES_FOR_CPH = 0.1;

  // What the rounding does, said once under every table (user, 23 September
  // 2026), because a checker adding a row up by hand will not otherwise see it.
  const ROUNDING_NOTE = 'Money columns, predicted applies and predicted hires are rounded so each column adds to its total, so a row’s total spend can differ from its media plus its fee by up to £1.';

  const COMMON = [
    { key: 'spend', label: 'Total spend', align: 'right', w: 20 },
    { key: 'fee', label: 'Fee', align: 'right', w: 16 },
    { key: 'media', label: 'Media', align: 'right', w: 19 },
    { key: 'cpa', label: 'Plan CPA (media)', align: 'right', w: 21 },
    { key: 'apps', label: 'Predicted applies', align: 'right', w: 21 },
    { key: 'quality', label: 'Quality rate', align: 'right', w: 14 },
    { key: 'hireRate', label: 'Hire rate from quality applies', align: 'right', w: 17 },
    { key: 'hireAdj', label: 'Hire adjustment', align: 'right', w: 15 },
    { key: 'cph', label: 'Plan CPH (media)', align: 'right', w: 21 },
    { key: 'hires', label: 'Predicted hires', align: 'right', w: 19 },
  ];

  const range = (lo, hi, dp) => `${F().num(lo, dp)} to ${F().num(hi, dp)}`;
  const gbpRange = (lo, hi) => (hi === Infinity || !isFinite(hi) ? `${F().gbp(lo)} or more` : `${F().gbp(lo)} to ${F().gbp(hi)}`);

  // The ten common cells for one row: x holds spend, fee, media, apps,
  // passed, hires, hireAdjustment and range; money holds this row's printed
  // spend, fee, media, applies and hires, already rounded for its column.
  function common(x, money, o = {}) {
    const f = F();
    const funded = x.spend > 0.005;
    if (!funded) return [money.spend, '-', money.media, '-', '-', '-', '-', '-', '-', '-'];
    const r = x.range || null;
    const cpa = x.apps > 0 ? x.media / x.apps : null;
    const cph = x.hires >= MIN_HIRES_FOR_CPH ? x.media / x.hires : null;
    const hireRate = x.passed > 0 && x.hireAdjustment > 0 ? x.hires / (x.passed * x.hireAdjustment) : null;
    const appsR = r && r.apps ? r.apps : null;
    const hiresR = r && r.hires ? r.hires : null;
    return [
      money.spend,
      o.feeOn ? money.fee : '-',
      money.media,
      [cpa === null ? '-' : f.gbp(cpa, 2), appsR && appsR.low > 0 ? gbpRange(x.media / appsR.high, x.media / appsR.low) : ''],
      [money.apps, appsR ? range(appsR.low, appsR.high, 0) : ''],
      x.apps > 0 ? f.pct(x.passed / x.apps, 1) : '-',
      hireRate === null ? '-' : f.pct(hireRate, 1),
      'x' + x.hireAdjustment.toFixed(3),
      [cph === null ? '-' : f.gbp(cph), cph !== null && hiresR && hiresR.high > 0 ? gbpRange(x.media / hiresR.high, hiresR.low > 0 ? x.media / hiresR.low : Infinity) : ''],
      [money.hires, hiresR ? range(hiresR.low, hiresR.high, 0) : ''],
    ];
  }

  // Every column whose rows must add to its printed total, rounded by largest
  // remainder: whole pounds for spend and media, pence for fees, one decimal
  // for predicted applies and two for predicted hires (user, 22 and 23
  // September 2026).
  function moneyColumns(rows, total, feeOn) {
    const f = F();
    const spendR = U().roundToTotal(rows.map(r => r.spend));
    const mediaR = U().roundToTotal(rows.map(r => r.media));
    const feeR = U().roundToTotal(rows.map(r => r.fee), 0.01);
    const appsR = U().roundToTotal(rows.map(r => r.apps || 0), 0.1);
    const hiresR = U().roundToTotal(rows.map(r => r.hires || 0), 0.01);
    const out = rows.map((r, i) => ({
      spend: r.spend > 0.005 ? f.gbp(spendR[i]) : '-', media: r.spend > 0.005 ? f.gbp(mediaR[i]) : '-',
      fee: feeOn && r.fee > 0.005 ? f.gbp(feeR[i], 2) : '-',
      apps: f.num(appsR[i], 1), hires: f.num(hiresR[i], 2),
    }));
    const t = { spend: f.gbp(total.spend), media: f.gbp(total.media), fee: feeOn ? f.gbp(total.fee, 2) : '-',
      apps: f.num(total.apps, 1), hires: f.num(total.hires, 2) };
    return { rows: out, total: t };
  }

  function withAdj(x, plan) { return { ...x, hireAdjustment: x.hireAdjustment !== undefined ? x.hireAdjustment : plan.factors.recon }; }

  function locations(plan) {
    const f = F();
    const feeOn = !!(plan.fees && plan.fees.on);
    const locs = plan.locations.slice();
    const t = plan.totals;
    const money = moneyColumns(locs, t, feeOn);
    const rows = locs.map((l, i) => {
      const notes = (l.notes || []).join('; ');
      return {
        label: l.region, spend: l.spend, media: l.media, hires: l.hires,
        warn: !(l.notes || []).every(n => n === 'Full share of budget placed'),
        cph: l.hires >= MIN_HIRES_FOR_CPH && l.spend > 0 ? f.gbp(l.media / l.hires) : '-',
        cells: [l.region, ...common(withAdj(l, plan), money.rows[i], { feeOn }), notes, f.int(l.vacancies)],
      };
    });
    rows.push({ total: true, label: 'Total', spend: t.spend, media: t.media, hires: t.hires,
      cph: t.hires >= MIN_HIRES_FOR_CPH ? f.gbp(t.media / t.hires) : '-',
      cells: ['Total', ...common(withAdj({ ...t, range: t.range ? { apps: t.range.apps, hires: t.range.hires } : null }, plan), money.total, { feeOn }),
        `Paid media only; plus ${f.num(t.otherHires)} expected from other sources`, f.int(plan.totalVac)] });
    return {
      key: 'locations', title: 'By location', warnCol: 11,
      columns: [{ key: 'label', label: 'Location', w: 27 }, ...COMMON, { key: 'notes', label: 'Notes', w: 40, wrap: true }, { key: 'vafs', label: 'VAFs', align: 'right', w: 11 }],
      rows,
      notes: [
        'Budget is shared between locations by VAFs (open roles), within location maximums, spending caps, cost limits and the VAF rule: a location’s predicted paid-media hires may not exceed its VAFs. Every platform at its spending cap: each platform in the location is at its largest successful month x the cap multiple. At the most this location has spent in a month: the location is at its own cap, all platforms together.',
        `${RAC.text.ROW_RANGE_LINE} Hires here are paid media only. ${RAC.text.OTHER_SOURCES_LINE}`,
        ROUNDING_NOTE,
      ],
    };
  }

  function platforms(plan) {
    const f = F();
    const feeOn = !!(plan.fees && plan.fees.on);
    const xs = P().map(q => plan.platforms[q]);
    const t = plan.totals;
    const money = moneyColumns(xs, t, feeOn);
    const rows = P().map((q, i) => {
      const x = plan.platforms[q];
      return {
        label: L()[q], spend: x.spend, media: x.media, hires: x.hires,
        cph: x.hires >= MIN_HIRES_FOR_CPH && x.spend > 0 ? f.gbp(x.media / x.hires) : '-',
        cells: [L()[q], ...common(withAdj(x, plan), money.rows[i], { feeOn: feeOn && plan.fees.rates[q] > 0 })],
      };
    });
    rows.push({ total: true, label: 'Total', spend: t.spend, media: t.media, hires: t.hires,
      cph: t.hires >= MIN_HIRES_FOR_CPH ? f.gbp(t.media / t.hires) : '-',
      cells: ['Total', ...common(withAdj({ ...t, range: t.range ? { apps: t.range.apps, hires: t.range.hires } : null }, plan), money.total, { feeOn })] });
    const basis = P().map(q => `${L()[q]} ${plan.rates.platform[q].basis}`).join('; ');
    return {
      key: 'platforms', title: 'By platform',
      columns: [{ key: 'label', label: 'Platform', w: 27 }, ...COMMON.map(c => ({ ...c, w: Math.round(c.w * 1.2) }))],
      rows,
      notes: [
        `Within each location, money goes where the next hire costs least, up to each platform’s spending cap. Quality rates: ${basis}. Hire rate from quality applies: ${f.pct(plan.rates.roleHire, 1)}, the role average for every location.`,
        RAC.text.ATTRIBUTION,
        ROUNDING_NOTE,
      ],
    };
  }

  function cells(plan, q) {
    const f = F();
    const feeRate = plan.fees && plan.fees.on ? plan.fees.rates[q] : 0;
    const cs = plan.locations.map(l => l.cells[q]);
    const x = plan.platforms[q];
    const money = moneyColumns(cs, x, feeRate > 0);
    const low = [];
    const rows = plan.locations.map((l, i) => {
      const c = l.cells[q];
      const funded = c.spend > 0.005;
      const lowConf = funded && c.range && c.range.hires && c.range.hires.lowConfidence;
      if (lowConf) low.push(l.region);
      const thin = c.thinAdjustment !== null && c.thinAdjustment !== undefined ? c.thinAdjustment : 1;
      const cm = common({ ...c, hireAdjustment: c.reconciliation }, money.rows[i], { feeOn: feeRate > 0 });
      return {
        label: `${l.region} ${L()[q]}`, spend: c.spend, media: c.media, hires: c.hires, warn: lowConf,
        cph: funded && c.hires >= MIN_HIRES_FOR_CPH ? f.gbp(c.media / c.hires) : '-',
        cells: [
          c.on ? l.region : `${l.region} (off)`,
          ...cm.slice(0, 3),
          funded || c.baseCpa ? [c.baseCpa ? f.gbp(c.baseCpa, 2) : '-', c.baseCpaSource === 'own' ? `${f.int(c.historicApps)} applications` : 'platform figure'] : '-',
          // Four decimals (user, 23 September 2026): at three, the three parts
          // multiplied could differ from the combined figure in the last place.
          funded ? ['x' + c.cpaAdjustments.toFixed(4), `${thin.toFixed(4)} x ${c.spendAdjustment.toFixed(4)} x ${c.remainingError.toFixed(4)}`] : '-',
          ...cm.slice(3),
        ],
      };
    });
    const tc = common(withAdj(x, plan), money.total, { feeOn: feeRate > 0 });
    rows.push({ total: true, label: `Total ${L()[q]}`, spend: x.spend, media: x.media, hires: x.hires,
      cph: x.hires >= MIN_HIRES_FOR_CPH ? f.gbp(x.media / x.hires) : '-',
      cells: ['Total', ...tc.slice(0, 3), '', '', ...tc.slice(3)] });
    const ca = RAC.text.costAdjustment(plan);
    return {
      key: 'cells:' + q, title: `${L()[q]} by location`, warnCol: 12,
      columns: [{ key: 'label', label: 'Location', w: 31 }, ...COMMON.slice(0, 3).map(c => ({ ...c, w: c.w - 1 })),
        { key: 'base', label: 'Base CPA', align: 'right', w: 21 }, { key: 'adj', label: 'CPA adjustments', align: 'right', w: 30 },
        ...COMMON.slice(3).map(c => ({ ...c, w: c.w - 1 }))],
      rows,
      notes: [
        `Plan CPA (media) = base CPA x CPA adjustments. The CPA adjustments are, in order, the thin-data adjustment x the diminishing returns adjustment x the ${ca.label.charAt(0).toLowerCase() + ca.label.slice(1)}${ca.extra ? ` (${ca.basis})` : ''}. Predicted applies = media / plan CPA. Predicted hires = predicted applies x quality rate x hire rate from quality applies x hire adjustment.`,
        `The quality rate for ${L()[q]} was ${plan.rates.platform[q].basis}.${feeRate > 0 ? ` Fee: ${f.pct(feeRate, 2)} of media spend.` : ' Appcast has no fee.'}${low.length ? ` Rows in orange are low confidence (little evidence behind the hire rate or the cost per application): ${f.list(low)}.` : ''}`,
        ROUNDING_NOTE,
      ],
    };
  }

  function all(plan) {
    return [locations(plan), platforms(plan), ...P().map(q => cells(plan, q))];
  }

  RAC.tables = { MIN_HIRES_FOR_CPH, ROUNDING_NOTE, COMMON, locations, platforms, cells, all };
})(window.RAC = window.RAC || {});
