// Setup and Plan panels for the planner's core settings, for targets the
// spending caps put out of reach, and the Plan tab's tables. Loaded by
// index.html as a Babel script before the app; exposed as
// window.RACUI.CoreSettings, ReachPanel, FeesNote and PlanTables. Formatting
// helpers are passed in by the app.
//
// Core Setup fields (user decision, 17 September 2026). Each is saved with the
// plan and shown with its default from assumptions.csv beside it:
//   capMultiple        spending cap multiple, 1 to 3 (both roles)
//   otherHiresShare    share of other-source hires credited to paid media, per role
//   otherHiresMonthly  expected hires from other sources per month, per role
//   includeSettling    include months still settling (both roles)
// The real-world CPA outcome adjustment is no longer set here: it comes from
// the assumptions file and shows on the Assumptions tab (user decision,
// 22 September 2026).
(function () {
  const { useState, useEffect } = React;
  const RACUI = (window.RACUI = window.RACUI || {});

  // A number box that keeps what is typed until Enter or leaving the box, so
  // decimals can be typed. Blank means "use the default".
  function NumberField({ value, onCommit, format, parse, width = 90, field }) {
    const [text, setText] = useState(format(value));
    useEffect(() => { setText(format(value)); }, [value]);
    const commit = () => {
      const v = parse(text);
      onCommit(v);
      setText(format(v === null ? value : v));
    };
    return (
      <input className="text-input" style={{ width, flex: 'none' }} data-field={field}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    );
  }

  const num = (s) => {
    const t = String(s).replace(/[^0-9.]/g, '');
    return t === '' || isNaN(Number(t)) ? null : Number(t);
  };
  const sourceLabel = (s) => (s ? RAC.text.sourceLabel(s) : 'starting value');

  function Row({ label, children, note }) {
    return (
      <div className="dial-row" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
        <label className="field-label" style={{ flex: 'none', width: 250, paddingTop: 6 }}>{label}</label>
        {children}
        <span className="help-text" style={{ flex: 1, paddingTop: 4 }}>{note}</span>
      </div>
    );
  }

  function CoreSettings({ plan, state, update, role, fmt }) {
    const v2 = plan && plan.v2;
    if (!v2) return null;
    const s = Object.fromEntries(v2.settings.map(x => [x.key, x]));
    const os = v2.otherSources;
    const perRole = (field, v) => update({ [field]: { ...(state[field] || {}), [role]: v } });
    const reset = (fn) => (
      <a href="#" className="link-inline" onClick={e => { e.preventDefault(); fn(); }}>use the default</a>
    );
    const monthName = (mo) => (fmt.monthShort ? fmt.monthShort(mo) : mo);
    const settling = v2.settlingUsed || [];
    return (
      <div data-panel={'core-settings-' + role}>
        <Row label="Spending cap multiple"
          note={<>Each location and platform is capped at its largest successful month times this (x1 to x3);
            the plan never spends above the caps. Applies to both roles. Default {RAC.text.fmt.mult(s.capMultiple.default)} ({sourceLabel(s.capMultiple.source)}).</>}>
          <NumberField field="cap-multiple" value={s.capMultiple.value}
            format={v => RAC.text.fmt.mult(v)}
            parse={t => {
              // x1 to x3; a figure typed as a percentage (150%, or 150) still works.
              const n = num(t);
              if (n === null) return null;
              const m = /%/.test(t) || n > 3 ? n / 100 : n;
              return Math.min(3, Math.max(1, m));
            }}
            onCommit={v => update({ capMultiple: v === null ? s.capMultiple.default : v })} />
        </Row>
        <Row label="Other-source hires credited to paid media"
          note={<>Share of the expected hires from other sources that grows with paid spend (0% to 100%); the rest is
            a fixed line that counts towards the hire target. Default {Math.round(s.otherHiresShare.default * 100)}% ({sourceLabel(s.otherHiresShare.source)}).</>}>
          <NumberField field={'other-hires-share-' + role} value={s.otherHiresShare.value}
            format={v => Math.round(v * 100) + '%'}
            parse={t => { const n = num(t); return n === null ? null : Math.min(100, Math.max(0, n)) / 100; }}
            onCommit={v => perRole('otherHiresShare', v)} />
        </Row>
        <Row label="Expected hires from other sources per month"
          note={<>
            Default {s.otherHiresMonthly.default.toFixed(1)}, the average of the settled months in RAC&rsquo;s applicant
            tracking data ({os.months.map(m => monthName(m.month) + ' ' + m.hires).join(', ')}).
            {os.recentMean !== null && <> Average since {monthName(os.recentFrom)}, after the tracking fixes: {os.recentMean.toFixed(1)}.</>}
            {' '}This month: {(v2.totals.otherHires).toFixed(1)} after the credited share.
            {s.otherHiresMonthly.changed && <> {reset(() => perRole('otherHiresMonthly', null))}.</>}
          </>}>
          <NumberField field={'other-hires-monthly-' + role} value={s.otherHiresMonthly.value}
            format={v => v.toFixed(1)}
            parse={t => num(t)}
            onCommit={v => perRole('otherHiresMonthly', v)} />
        </Row>
        <Row label="Efficiency"
          note={<>
            0% by default: the money is split between locations by their open roles, as it always has been. Above 0 the
            split moves that far towards where a hire is predicted to cost least, still inside every location maximum,
            spending cap and cost limit. It is a way to ask what efficiency alone would do; RAC hires against open
            roles, so it is left at 0 unless you want that comparison. Applies to both roles.
            {v2.efficiency && v2.efficiency.weight > 0 && v2.efficiency.byLocation.length > 0 && (
              <> Now: {v2.efficiency.byLocation.map(x => `${x.region} ${Math.round(x.openRoles * 100)}% to ${Math.round(x.share * 100)}%`).join(', ')}.</>
            )}
          </>}>
          <NumberField field="efficiency" value={state.efficiency != null ? state.efficiency : 0}
            format={v => Math.round(v * 100) + '%'}
            parse={t => { const n = num(t); return n === null ? 0 : Math.min(100, Math.max(0, n)) / 100; }}
            onCommit={v => update({ efficiency: v })} />
        </Row>
        <Row label="Include months still settling"
          note={<>
            Off by default. A month counts once 31 days have passed after it ended. Turn this on to use complete months
            that are still settling; each one used is flagged &ldquo;not yet settled, figures may change&rdquo;. Applies to both roles.
            {settling.length > 0 && <strong> In use: {settling.map(x => monthName(x.month)).join(', ')} (not yet settled, figures may change).</strong>}
          </>}>
          <input type="checkbox" data-field="include-settling" style={{ marginTop: 8, flex: 'none', width: 90 }}
            checked={!!state.includeSettling}
            onChange={e => update({ includeSettling: e.target.checked })} />
        </Row>
      </div>
    );
  }

  // Shown when the hire target cannot be reached within the spending caps.
  function ReachPanel({ plan, fmt }) {
    const v2 = plan && plan.v2;
    const r = v2 && v2.reach;
    if (!r) return null;
    const { fmtGBP } = fmt;
    const target = v2.hireTarget || v2.goal;
    return (
      <div className="banner banner-warn" data-panel="reach" style={{ marginBottom: 18 }}>
        <div className="banner-icon">!</div>
        <div style={{ flex: 1 }}>
          <strong>{target} hires cannot be reached within the spending caps.</strong>{' '}
          At a cap multiple of {RAC.text.fmt.mult(v2.capMultiple)} the most the plan can deliver is {r.mostHires.toFixed(1)} hires,
          needing a total budget of {fmtGBP(r.saturationBudget)} ({fmtGBP(r.saturationPlaced)} placed plus {fmtGBP(r.saturationHoldbacks)} held back).
          {' '}{RAC.text.reachSentence(v2)} At this plan&rsquo;s budget, {fmtGBP(r.unplaced)} could not be placed.
          <table className="alloc-table" style={{ marginTop: 10, maxWidth: 760 }}>
            <thead>
              <tr>
                <th>Cap multiple</th>
                <th className="num">Hires at {fmtGBP(v2.budget)}</th>
                <th className="num">Not placed</th>
                <th className="num">Budget for {target} hires</th>
                <th className="num">Most hires (total budget where they stop rising)</th>
              </tr>
            </thead>
            <tbody>
              {r.byMultiple.map(x => (
                <tr key={x.multiple} style={x.current ? { fontWeight: 600 } : null}>
                  <td>{RAC.text.fmt.mult(x.multiple)}{x.current ? ' (this plan)' : ''}</td>
                  <td className="num mono">{x.hiresAtBudget.toFixed(1)}</td>
                  <td className="num mono">{fmtGBP(x.unplacedAtBudget)}</td>
                  <td className="num mono">{x.budgetForTarget ? fmtGBP(x.budgetForTarget) : 'out of reach'}</td>
                  <td className="num mono">{x.budgetForTarget ? '-' : `${x.mostHires.toFixed(1)} (${fmtGBP(x.saturationBudget)})`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Platform fees in this plan (plans from October 2026): Indeed, Meta and Google
  // spend is media plus fee, and the budget includes the fees.
  function FeesNote({ plan, fmt }) {
    const f = plan && plan.v2 && plan.v2.fees;
    if (!f || !f.on) return null;
    const { fmtGBP } = fmt;
    const pct = (x) => (x * 100).toFixed(2).replace(/0$/, '') + '%';
    const L = window.RAC.PLATFORM_LABELS;
    return (
      <div className="banner banner-info" data-panel="fees" style={{ marginBottom: 18 }}>
        <div className="banner-icon">i</div>
        <div>
          <strong>Platform fees included: {fmtGBP(f.total)}.</strong>{' '}
          Indeed {pct(f.rates.indeed)}, Meta {pct(f.rates.meta)} and Google {pct(f.rates.google)} of media spend, inside the budget (Appcast has none).
          {' '}{['indeed', 'meta', 'google'].map(p => `${L[p]}: media ${fmtGBP(f.byPlatform[p].media)}, fee ${fmtGBP(f.byPlatform[p].fee)}`).join('; ')};
          {' '}Indeed Premium fee {fmtGBP(f.premium)}. Fees are shown separately; forecasts, cost per application and cost per hire use media spend.
        </div>
      </div>
    );
  }

  // The plan's tables, the same ones the PDF draws (exports/tables.js):
  // locations, platforms, then each platform by location. A second line under
  // a figure is its range, or the parts of the CPA adjustments.
  function PlanTables({ plan }) {
    if (!plan) return null;
    return (
      <div data-panel="plan-tables">
        {RAC.tables.all(plan).map(t => (
          <div className="card" key={t.key} data-table={t.key}>
            <div className="card-head">
              <div className="card-title">{t.title}</div>
            </div>
            <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="alloc-table">
                <thead>
                  <tr>{t.columns.map(c => <th key={c.key} className={c.align === 'right' ? 'num' : ''}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {t.rows.map((r, ri) => (
                    <tr key={ri} className={r.total ? 'total-row' : ''}>
                      {r.cells.map((v, ci) => {
                        const main = Array.isArray(v) ? v[0] : v;
                        const sub = Array.isArray(v) ? v[1] : null;
                        const c = t.columns[ci];
                        const warn = r.warn && ci === (t.warnCol !== undefined ? t.warnCol : t.columns.length - 1);
                        return (
                          <td key={ci} className={c.align === 'right' ? 'num mono' : ''}
                            style={{ fontWeight: ci === 0 || r.total ? 600 : 400, color: warn ? 'var(--warn)' : 'inherit', whiteSpace: c.wrap ? 'normal' : 'nowrap' }}>
                            {main}
                            {sub && <div className="help-text" style={{ fontSize: 11, marginTop: 1 }}>{sub}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="help-text" style={{ padding: '12px 16px' }}>
                {t.notes.map((n, i) => <p key={i} style={{ margin: i ? '6px 0 0' : 0 }}>{n}</p>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  RACUI.CoreSettings = CoreSettings;
  RACUI.PlanTables = PlanTables;
  RACUI.ReachPanel = ReachPanel;
  RACUI.FeesNote = FeesNote;
})();
