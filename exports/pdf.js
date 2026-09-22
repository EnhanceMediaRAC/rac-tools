// RAC planner: the plan PDF (D8). Drawn only from the plan object the screen
// used, so its figures are the planner's. A4 landscape, jsPDF.
//
// Order for each document:
//   commentary (the notes on the legacy plan and on this plan; optional)
//   1. summary: budget, hold-backs, fees, hires, applications, the budget for
//      the target (or what is reachable), assumptions and risks
//   2. locations
//   3. platforms
//   4. location and platform, one table per platform, with the base cost per
//      application and the CPA adjustments
//   Tables 2 to 4 come from exports/tables.js, which the Plan tab also uses.
//   5. method and glossary (exports/text.js)
// The last page carries the version stamp (exports/stamp.js, short form). Before saving, the
// output checks (exports/checks.js) run on every string drawn, every table
// row and the title; a document that fails is not saved.
//
//   RAC.pdf.build(jsPDF, docs, opts)   -> { pdf, texts, rows, titles, problems }
//   RAC.pdf.save(jsPDF, docs, opts)    builds, checks, saves; returns the file name
//     docs: [{ role, roleName, plan (the planner result), commentary: { legacy: [..], plan: [..] } }]
//     opts: { notes (default true), monthLabel, planName, code (stamp commit) }
(function (RAC) {
  'use strict';
  const P = () => RAC.PLATFORMS;
  const L = () => RAC.PLATFORM_LABELS;
  const f = () => RAC.text.fmt;
  const U = () => RAC.util;

  const NAVY = [20, 33, 61], ORANGE = [242, 140, 40], INK = [33, 37, 41], MUTED = [110, 117, 125];
  const LINE = [214, 219, 226], ZEBRA = [245, 247, 250], HEAD = [232, 236, 242], WARN = [176, 76, 20];
  const PAGE_W = 297, PAGE_H = 210, M = 14, BOTTOM = 192;

  // Cost limits set for this plan (D6), for the assumptions box.
  function limitLines(p, F) {
    const lim = (p.inputs && p.inputs.limits) || {};
    const cph = Object.keys(lim.cph || {}).filter(r => lim.cph[r] > 0);
    const cpa = [];
    Object.keys(lim.cpa || {}).forEach(r => P().forEach(q => { if ((lim.cpa[r] || {})[q] > 0) cpa.push(`${r} ${L()[q]} ${F.gbp(lim.cpa[r][q], 2)}`); }));
    const out = [];
    if (cph.length) out.push(`Cost per hire limits (media): ${cph.map(r => `${r} ${F.gbp(lim.cph[r])}`).join(', ')}. The plan stops adding spend to a location where its limit would be passed.`);
    if (cpa.length) out.push(`Cost per application limits (media): ${cpa.join(', ')}. Each replaces that row’s spending cap: spend continues until the predicted cost per application reaches the limit.`);
    if (!out.length) out.push('Cost limits: none set for this plan.');
    return out;
  }

  function titleOf(d, monthLabel) {
    const t = d.plan.hireTarget > 0 ? `plan for ${d.plan.hireTarget} hires` : 'plan';
    return `RAC ${monthLabel} ${d.roleName} ${t}`;
  }

  function build(jsPDF, docs, opts = {}) {
    const pdf = new jsPDF('l', 'mm', 'a4');
    const texts = [], rows = [], titles = [];
    const F = f();
    const notes = opts.notes !== false;
    const monthLabel = opts.monthLabel || '';
    let started = false;
    let pageTitle = '', pageSub = '', stampLine = '';
    let y = 0;

    // Drawing helpers. Every string goes through T so the checks see it.
    const T = (s, x, yy, o) => { const str = String(s); texts.push(str); pdf.text(str, x, yy, o || {}); };
    let curFont = null;
    const font = (size, style = 'normal', color = INK) => { curFont = [size, style, color]; pdf.setFont('helvetica', style); pdf.setFontSize(size); pdf.setTextColor(...color); };
    const wrap = (s, w) => pdf.splitTextToSize(String(s), w);

    // Page header: the plan title small, then the section in large type, so
    // the part that changes from page to page is the one that stands out.
    // The caller's font is restored afterwards, so text carried onto a new
    // page keeps its own style.
    function header(title, section) {
      const saved = curFont;
      pdf.setFillColor(...NAVY); pdf.rect(0, 0, PAGE_W, 20, 'F');
      pdf.setFillColor(...ORANGE); pdf.rect(0, 20, PAGE_W, 1.2, 'F');
      font(8.5, 'normal', [220, 226, 236]); T(title, M, 7.5);
      font(15, 'bold', [255, 255, 255]); T(section, M, 15.5);
      font(8, 'normal', [220, 226, 236]); T(`Prepared by Enhance Media${opts.planName ? ' · ' + opts.planName : ''}`, PAGE_W - M, 7.5, { align: 'right' });
      if (saved) font(...saved);
      y = 29;
    }
    function page(title, section) {
      if (started) pdf.addPage();
      started = true;
      pageTitle = title; pageSub = section;
      header(title, section);
    }
    // Room for h mm, or a continuation page.
    function ensure(h, again) {
      if (y + h <= BOTTOM) return false;
      pdf.addPage();
      header(pageTitle, pageSub + ' (continued)');
      if (again) again();
      return true;
    }
    function heading(s) {
      ensure(12);
      font(11, 'bold', NAVY); T(s, M, y); y += 2;
      pdf.setDrawColor(...LINE); pdf.line(M, y, PAGE_W - M, y); y += 5;
    }
    function para(s, x = M, w = PAGE_W - 2 * M, size = 8.5) {
      font(size, 'normal', INK);
      const lines = wrap(s, w);
      lines.forEach(line => { ensure(4.2); T(line, x, y); y += size * 0.42; });
      y += 1.5;
    }

    // A table. cols: [{ label, w, align, sub }]; body: arrays of cell values,
    // where a cell is a string or [main, small second line].
    function table(cols, body, o = {}) {
      const x0 = M;
      // Header labels: a word is never split; the label shrinks instead
      // (point 19). The header is as tall as its longest label.
      const heads = cols.map(c => {
        let size = 6.6;
        font(size, 'bold', NAVY);
        const fits = () => String(c.label).split(' ').every(word => wrap(word, c.w - 2).length === 1);
        while (!fits() && size > 5.4) { size -= 0.2; font(size, 'bold', NAVY); }
        return { size, lines: wrap(c.label, c.w - 2).slice(0, 3) };
      });
      const hh = 3.1 + 2.8 * Math.max(...heads.map(h => h.lines.length));
      const drawHead = () => {
        pdf.setFillColor(...HEAD); pdf.rect(x0, y - 4.5, cols.reduce((a, c) => a + c.w, 0), hh, 'F');
        let x = x0;
        cols.forEach((c, ci) => {
          font(heads[ci].size, 'bold', NAVY);
          heads[ci].lines.forEach((ln, i) => T(ln, c.align === 'right' ? x + c.w - 1.5 : x + 1.5, y - 1.4 + i * 2.8, c.align === 'right' ? { align: 'right' } : {}));
          x += c.w;
        });
        y += hh - 2;
      };
      drawHead();
      body.forEach((r, ri) => {
        const lines = cols.map((c, ci) => {
          if (!c.wrap || Array.isArray(r.cells[ci])) return null;
          font(7.2, r.total || ci === 0 ? 'bold' : 'normal', INK);   // measure in the font it is drawn in
          return wrap(r.cells[ci] === null || r.cells[ci] === undefined ? '' : r.cells[ci], c.w - 2);
        });
        const two = r.cells.some(v => Array.isArray(v) && v[1]) || lines.some(l => l && l.length > 1);
        const rh = two ? 7.4 : 4.6;
        if (ensure(rh + 1, drawHead)) { /* continued */ }
        if (r.total) { pdf.setFillColor(...HEAD); pdf.rect(x0, y - 3.4, cols.reduce((a, c) => a + c.w, 0), rh, 'F'); }
        else if (ri % 2 === 1) { pdf.setFillColor(...ZEBRA); pdf.rect(x0, y - 3.4, cols.reduce((a, c) => a + c.w, 0), rh, 'F'); }
        let x = x0;
        cols.forEach((c, ci) => {
          const v = r.cells[ci];
          const main = Array.isArray(v) ? v[0] : v;
          const small = Array.isArray(v) ? v[1] : null;
          const ax = c.align === 'right' ? x + c.w - 1.5 : x + 1.5;
          const al = c.align === 'right' ? { align: 'right' } : {};
          font(7.2, r.total || ci === 0 ? 'bold' : 'normal', r.warn && ci === (o.warnCol !== undefined ? o.warnCol : cols.length - 1) ? WARN : INK);
          if (lines[ci] && lines[ci].length > 1) {
            // A wrapping column: first line, then the rest on a second line in the same style.
            T(lines[ci][0], ax, y, al);
            T(wrap(lines[ci].slice(1).join(' '), c.w - 2)[0] || '', ax, y + 3, al);
            x += c.w;
            return;
          }
          T(wrap(main === null || main === undefined ? '' : main, c.w - 2)[0] || '', ax, y, al);
          if (small) { font(5.8, 'normal', MUTED); T(wrap(small, c.w - 2)[0] || '', ax, y + 3, al); }
          x += c.w;
        });
        if (o.rowCheck) rows.push(o.rowCheck(r));
        y += rh;
      });
      y += 3;
    }

    const range = (lo, hi, dp = 0) => `${F.num(lo, dp)} to ${F.num(hi, dp)}`;

    function commentary(d, title) {
      [['legacy', 'Notes on the legacy plan'], ['plan', 'Notes on this plan']].forEach(([k, label]) => {
        const pts = (d.commentary && d.commentary[k]) || [];
        if (!pts.length) return;
        page(title, label);
        pts.forEach((p, i) => {
          ensure(10);
          font(10, 'bold', ORANGE); T(String(i + 1), M, y);
          font(9.5, 'normal', INK);
          wrap(p, PAGE_W - 2 * M - 10).forEach(line => { ensure(5); T(line, M + 8, y); y += 4.6; });
          y += 2.5;
        });
      });
    }

    function summary(d, title) {
      const p = d.plan, t = p.totals, r = t.range, hb = p.holdbacks, fees = p.fees;
      page(title, 'Summary');
      titles.push({ title, plan: p });
      const colW = (PAGE_W - 2 * M - 10) / 2;
      const top = y;
      // Left: the money. Fees are kept separate (user decision, 22 September 2026).
      font(10, 'bold', NAVY); T('Budget', M, y); y += 5;
      const money = [
        [`Monthly budget${fees && fees.on ? ' (including platform fees)' : ''}`, F.gbp(p.budget)],
        [`Indeed Premium${hb.premiumFee > 0 ? ` (media ${F.gbp(hb.premiumMedia)} + fee ${F.gbp(hb.premiumFee, 2)})` : ''}`, '- ' + F.gbp(hb.premium, hb.premiumFee > 0 ? 2 : 0)],
        ['Combined Activity reserve', '- ' + F.gbp(hb.combined)],
      ];
      if (hb.oneRac > 0) money.push(['OneRAC hold-back', '- ' + F.gbp(hb.oneRac)]);
      const boldRow = money.length;
      money.push(['Deployable budget', F.gbp(p.deployable)]);
      money.push(['Placed in the plan', F.gbp(p.placed)]);
      if (fees && fees.on) {
        money.push(['  media', F.gbp(t.media)]);
        money.push([`  platform fees (Indeed ${F.pct(fees.rates.indeed, 2)}, Meta ${F.pct(fees.rates.meta, 2)}, Google ${F.pct(fees.rates.google, 2)})`, F.gbp(fees.placed, 2)]);
      }
      money.push(['Budget the plan could not place efficiently', F.gbp(p.unplaced.total)]);
      money.forEach(([a, b], i) => {
        const sub = a.startsWith('  ');
        font(8.5, i === boldRow ? 'bold' : 'normal', sub ? MUTED : INK);
        T(a.trim(), M + (sub ? 4 : 0), y); T(b, M + colW, y, { align: 'right' });
        y += 4.4;
      });
      const leftEnd = y;
      // Right: the results.
      y = top;
      const x = M + colW + 10;
      font(10, 'bold', NAVY); T('Predicted results', x, y); y += 5;
      const tt = RAC.text.targetText(p);
      const res = [
        ['Predicted hires', `${F.num(t.allHires)}`, `range ${range(r.allHires.low, r.allHires.high)}`],
        ['  from paid media', `${F.num(t.hires)}`, `range ${range(r.hires.low, r.hires.high)}`],
        ['  expected from other sources, not modelled on the budget', `${F.num(t.otherHires)}`, `range ${range(r.otherHires.low, r.otherHires.high)}`],
        ['Predicted applications', F.int(t.apps), `range ${range(r.apps.low, r.apps.high)}`],
        ['Quality applications', F.int(t.passed), ''],
        ['Cost per application (media)', F.gbp(t.cpa, 2), ''],
        ['Cost per hire, paid media (media)', F.gbp(t.cph), ''],
        [p.hireTarget > 0 ? `Budget for ${p.hireTarget} hires` : 'Budget for the target', tt.value, ''],
      ];
      res.forEach(([a, b, c]) => {
        const sub = a.startsWith('  ');
        font(8.5, sub ? 'normal' : 'bold', INK);
        const al = wrap(a.trim(), colW - 72);
        T(al[0], x + (sub ? 4 : 0), y);
        const bl = wrap(b, 58);
        font(8.5, 'normal', INK); T(bl[0], x + colW - 38, y, { align: 'right' });
        font(7.5, 'normal', MUTED); T(c, x + colW, y, { align: 'right' });
        const extra = Math.max(al.length, bl.length) - 1;
        for (let k = 1; k <= extra; k++) {
          y += 3.6;
          font(8.5, sub ? 'normal' : 'bold', INK); if (al[k]) T(al[k], x + (sub ? 4 : 0), y);
          font(8.5, 'normal', INK); if (bl[k]) T(bl[k], x + colW - 38, y, { align: 'right' });
        }
        y += 4.4;
      });
      y = Math.max(leftEnd, y) + 1;
      // The budget for the target in steps (point 30).
      tt.lines.filter(Boolean).forEach(l => para(l, M, PAGE_W - 2 * M, 8));
      y += 1;

      if (p.reach) {
        heading('What the spending caps allow');
        para(`The hire target could not be reached within the spending caps at a cap multiple of ${F.mult(p.capMultiple)}. The same plan at other cap multiples:`);
        table([
          { label: 'Cap multiple', w: 40 }, { label: `Hires at ${F.gbp(p.budget)}`, w: 40, align: 'right' },
          { label: 'Budget not placed', w: 40, align: 'right' }, { label: `Budget for ${p.hireTarget} hires`, w: 50, align: 'right' },
          { label: 'Most hires (total budget where they stop rising)', w: 70, align: 'right' },
        ], p.reach.byMultiple.map(m => ({ cells: [
          `${F.mult(m.multiple)}${m.current ? ' (this plan)' : ''}`, F.num(m.hiresAtBudget), F.gbp(m.unplacedAtBudget),
          m.budgetForTarget ? F.gbp(m.budgetForTarget) : 'out of reach',
          m.budgetForTarget ? '-' : `${F.num(m.mostHires)} (${F.gbp(m.saturationBudget)})`,
        ] })));
      }

      heading('Assumptions and risks');
      const s = Object.fromEntries(p.settings.map(z => [z.key, z]));
      const ca = RAC.text.costAdjustment(p);
      const src = (z) => (z.changed ? `set for this plan; default ${z.unit === 'share' ? F.pct(z.default) : z.unit === 'multiple' && z.key === 'capMultiple' ? F.mult(z.default) : z.default}` : RAC.text.sourceLabel(z.source));
      // Spend above past levels, in three parts that do not overlap: above the
      // month a cap was based on; above the largest month the row ran; and in
      // rows with no spend of their own in the months the caps looked at.
      const capFirst = F.month(RAC.assumptions.get(p.A, 'ceiling_first_month'));
      const placedCells = p.locations.flatMap(l => P().map(q => l.cells[q])).filter(c => c.spend > 0.005);
      const unrun = placedCells.filter(c => !(c.largestMonth > 0));
      const unrunTotal = unrun.reduce((a, c) => a + c.aboveLargestMonth, 0);
      const aboveRun = Math.max(0, p.aboveLargestMonth.total - unrunTotal);
      const share = (x) => F.pct(p.placed > 0 ? x / p.placed : 0);
      const pastLevels = [
        `Spend above past levels: ${F.gbp(p.aboveLargestSuccessful.total)} (${share(p.aboveLargestSuccessful.total)} of placed spend) is above the month each spending cap was based on`,
        ...(aboveRun > 0.5 ? [`${F.gbp(aboveRun)} (${share(aboveRun)}) is above the largest month the location and platform ran since ${capFirst}`] : []),
        ...(unrun.length ? [`${F.gbp(unrunTotal)} (${share(unrunTotal)}) is in ${F.list(unrun.map(c => `${c.region} ${L()[c.platform]}`))}, which had no spend of ${unrun.length === 1 ? 'its' : 'their'} own since ${capFirst}`] : []),
      ].join('; ') + '. Predictions for spend above past levels are based on the rate at which cost per application rises with spend.';
      const reEntry = RAC.assumptions.entry(p.A, 'remaining_error_factor', d.role) || {};
      const reUsed = ca.remainingError, reTested = reEntry.testedValue;
      const lines = [
        pastLevels,
        ...RAC.text.capsPoint(p),
        `Spending cap multiple: ${F.mult(s.capMultiple.value)}.`,
        `Real-world CPA outcome adjustment: ${reUsed.toFixed(3)} (${RAC.text.sourceLabel(reEntry.source)}). When we predicted past months from the months before them, ${RAC.text.outcomeText(reTested)}${reUsed === 1 && reTested !== null && reTested !== undefined && Math.abs(reTested - 1) > 0.0005 ? ', but not in the same direction with every test month left out, so no adjustment is applied' : reUsed !== 1 ? ', consistently enough to plan for it, so planned costs are raised by that amount' : ''}.`,
        ...(ca.extra ? [`Cost adjustment: planned cost per application is multiplied by ${ca.used.toFixed(3)} (${ca.basis}).`] : []),
        `Expected hires from other sources: ${F.num(s.otherHiresMonthly.value)} a month (${src(s.otherHiresMonthly)}), counted towards the hire target. They are not modelled on the budget; we aim to model this in future.${s.otherHiresShare.value > 0 ? ` ${F.pct(s.otherHiresShare.value)} of them were credited to paid media (${src(s.otherHiresShare)}).` : ''}`,
        `Months used: ${RAC.text.monthsUsed(p.A, d.role, p, opts.backtest).map(r => r.short).join('; ')}. Quality and hire rates, caps, other-source hires and testing follow fixed rules, not the data window; the method pages give each in full.${p.settlingUsed.length ? ` Not yet settled, figures may change: ${p.settlingUsed.map(m => F.month(m.month)).join(', ')}.` : ''}`,
        fees && fees.on ? `Platform fees: Indeed ${F.pct(fees.rates.indeed, 2)}, Meta ${F.pct(fees.rates.meta, 2)} and Google ${F.pct(fees.rates.google, 2)} of media spend (Appcast none): ${F.gbp(fees.total, 2)} in this plan${fees.premium > 0 ? `, of which ${F.gbp(fees.premium, 2)} on Indeed Premium` : ''}. Fees are paid from the budget, so less than the full budget reaches the platforms. They are shown separately; cost per application and cost per hire are on media spend, because past costs were recorded without fees.`
          : 'Platform fees: none in this plan (fees apply to plans from ' + F.month(fees ? fees.firstMonth : '') + ').',
        'Attribution: quality and hire rates came from RAC’s applicant tracking data, which credited each application to the last source used; Meta and Google rates were moved towards the role average (see Method).',
        ...(p.oneRac && p.oneRac.second
          ? [`Second scenario: at a self-competition improvement of ${F.pct(p.oneRac.second.selfCompetition)}, the same budget would be expected to deliver ${F.num(p.oneRac.second.hires)} hires against ${F.num(p.totals.allHires)}, at ${F.gbp(p.oneRac.second.cpa, 2)} an application (media). It is a comparison, not the plan.`]
          : []),
        ...(p.efficiency && p.efficiency.weight > 0
          ? [`Efficiency: the split between locations was moved ${F.pct(p.efficiency.weight)} of the way from VAFs towards where a hire is predicted to cost least (${p.efficiency.byLocation.map(x => `${x.region} ${F.pct(x.openRoles)} to ${F.pct(x.share)}`).join(', ')}). Every location maximum, spending cap, cost limit and the VAF rule still apply.`]
          : []),
        ...limitLines(p, F).filter(l => !/^Cost limits: none/.test(l)),
        ...p.minimumShortfalls.map(x => x.text + '.'),
      ];
      const lowCells = p.locations.flatMap(l => P().map(q => l.cells[q])).filter(c => c.range && c.range.hires && c.range.hires.lowConfidence).length;
      if (lowCells) lines.push(`${lowCells} location and platform ${lowCells === 1 ? 'row is' : 'rows are'} marked low confidence (little evidence behind the hire rate or the cost per application).`);
      const flagged = p.locations.flatMap(l => P().map(q => l.cells[q])).filter(c => c.spend > 0 && c.ceilingFlagged);
      if (flagged.length) lines.push(`No successful month, so capped at the average monthly spend: ${flagged.map(c => `${c.region} ${L()[c.platform]}`).join(', ')}.`);
      lines.forEach(l => { font(7.8, 'normal', INK); const w = wrap(l, PAGE_W - 2 * M - 5); ensure(w.length * 3.3 + 0.6); T('•', M, y); w.forEach(ln => { T(ln, M + 4, y); y += 3.3; }); y += 0.6; });
    }

    // A table page from RAC.tables (the Plan tab shows the same tables).
    function tablePage(title, spec) {
      page(title, spec.title);
      table(spec.columns.map(c => ({ label: c.label, w: c.w, align: c.align, wrap: c.wrap })), spec.rows,
        { warnCol: spec.warnCol, rowCheck: r => ({ label: r.label, spend: r.spend, cph: r.cph }) });
      spec.notes.forEach(n => para(n, M, PAGE_W - 2 * M, 7.2));
    }

    function locations(d, title) { tablePage(title, RAC.tables.locations(d.plan)); }
    function platforms(d, title) { tablePage(title, RAC.tables.platforms(d.plan)); }
    function cells(d, title) { P().forEach(q => tablePage(title, RAC.tables.cells(d.plan, q))); }

    function method(d, title) {
      page(title, 'Method and glossary');
      const colW = (PAGE_W - 2 * M - 8) / 2;
      const cols = [M, M + colW + 8];
      let col = 0;
      const top = y;
      const flow = (s, size, style, color, gap) => {
        font(size, style, color);
        wrap(s, colW).forEach(line => {
          if (y + size * 0.42 > BOTTOM) {
            if (col === 0) { col = 1; y = top; }
            else { pdf.addPage(); header(pageTitle, pageSub + ' (continued)'); col = 0; }
          }
          T(line, cols[col], y); y += size * 0.42;
        });
        y += gap;
      };
      RAC.text.method(d.plan.A, d.role, d.plan, opts.backtest).forEach(sec => {
        flow(sec.heading, 9.5, 'bold', NAVY, 1);
        sec.paras.forEach(p => flow(p, 7.6, 'normal', INK, 1.6));
        y += 1;
      });
      flow('Glossary', 9.5, 'bold', NAVY, 1);
      RAC.text.glossary(d.plan.A, d.role, d.plan).forEach(g => flow(`${g.term}: ${g.text}`, 7.6, 'normal', INK, 1.2));
    }

    docs.forEach(d => {
      const title = titleOf(d, monthLabel);
      if (notes) commentary(d, title);
      summary(d, title);
      locations(d, title);
      platforms(d, title);
      cells(d, title);
      method(d, title);
    });

    // Footers, now the page count is known. The version stamp, in its short
    // form, goes on the last page only (user, 22 September 2026).
    const n = pdf.getNumberOfPages();
    stampLine = docs.map(d => RAC.stamp.short(d.plan, opts.code)).join(' | ');
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      pdf.setDrawColor(...LINE); pdf.line(M, 200, PAGE_W - M, 200);
      font(6.3, 'normal', MUTED);
      if (i === n) T(stampLine, M, 204);
      T(`RAC ${monthLabel} plan · Enhance Media · Page ${i} of ${n}`, PAGE_W - M, 204, { align: 'right' });
    }

    const problems = [
      ...RAC.outputChecks.text(texts.join('\n')),
      ...RAC.outputChecks.pdfRows(rows),
      ...titles.flatMap(t => RAC.outputChecks.title(t.title, t.plan)),
    ];
    return { pdf, texts, rows, titles, problems, pages: n };
  }

  function fileName(docs, opts) {
    const month = (opts.monthLabel || '').replace(/\s+/g, '_');
    const roles = docs.map(d => d.role).join('_');
    return `RAC_${month}_${roles}_Plan${opts.notes === false ? '_No_Notes' : ''}.pdf`;
  }

  function save(jsPDF, docs, opts = {}) {
    const out = build(jsPDF, docs, opts);
    if (out.problems.length) throw new Error('The PDF failed its checks, so it was not saved:\n' + out.problems.join('\n'));
    const name = fileName(docs, opts);
    out.pdf.save(name);
    return name;
  }

  RAC.pdf = { build, save, fileName, titleOf };
})(window.RAC = window.RAC || {});
