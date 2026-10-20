// Location priorities, What changed and update: under the list of what
// opened and closed between two days, what that means on Google, Meta and
// Indeed, and anything that was already out of step before those days
// (planner/locations.js). Google and Meta are read through Windsor. This
// version is a preview: nothing is sent to Google or Meta. Loaded by
// index.html as a Babel script before the app; exposed as
// window.RACUI.LocationUpdates.
(function () {
  const RACUI = (window.RACUI = window.RACUI || {});
  const { useState, useEffect, useMemo } = React;
  const PLATFORM = { google: 'Google', meta: 'Meta' };

  function action(s, tc, radius) {
    const other = tc.role === 'SMR' ? 'Patrol' : 'SMR';
    return {
      add: `Add ${tc.town} (${radius} km)`,
      remove: `Remove ${tc.town}`,
      covered: 'No change: the campaign covers the whole region',
      already: 'No change: already targeted',
      otherRole: `No change: still open for ${other}`,
      notTargeted: 'No change: it was not targeted',
      leftAlone: 'Held back: this campaign’s ad sets target different locations',
      noCampaign: `No live ${tc.role} campaign in ${tc.region}`,
    }[s.status];
  }

  function LocationUpdates({ pri, from, to, role, oneRacRegions, getTargeting, fmtDay }) {
    const RAC = window.RAC;
    const dates = (pri && pri.dates) || [];
    const latest = dates[dates.length - 1];
    const [register, setRegister] = useState(null);
    const [state, setState] = useState({ status: 'idle' });
    useEffect(() => {
      fetch('data/locations.json').then(r => r.json()).then(setRegister)
        .catch(e => setState({ status: 'error', msg: 'Could not read the location list: ' + e.message }));
    }, []);

    const read = async () => {
      setState({ status: 'busy' });
      try { setState({ status: 'done', live: await getTargeting(), at: new Date() }); }
      catch (e) { setState({ status: 'error', msg: e.message }); }
    };
    const out = useMemo(() => (state.live && register ? RAC.locations.preview({ register, pri, date: to, prevDate: from,
      oneRacRegions, live: state.live, regions: window.__AVP_DATA__.regions_ordered }) : null), [state.live, register, pri, from, to, oneRacRegions]);

    const mine = (c) => c.kind === role || c.kind === 'OneRAC';
    const townChanges = out ? out.townChanges.filter(t => t.role === role) : [];
    const drift = out ? out.campaigns.filter(mine).map(c => ({ c, add: c.add.filter(x => !x.fromChanges), remove: c.remove.filter(x => !x.fromChanges) }))
      .filter(x => x.add.length || x.remove.length || x.c.other.length || x.c.unmatched.length || (x.c.question && !townChanges.length)) : [];
    const noCampaign = out ? out.noCampaign.filter(x => x.role === role || x.role === 'OneRAC') : [];
    const unknown = out ? out.unknownTowns.filter(x => x.role === role) : [];
    const indeedFor = (town) => (out ? out.indeed.filter(x => x.role === role && RAC.locations.townOf(x.job).toLowerCase() === town.toLowerCase()) : []);

    return (
      <div className="card" data-panel="locations">
        <div className="card-head">
          <div className="card-title">Update Google, Meta and Indeed</div>
          <div className="card-sub">{from && fmtDay(from)} to {to && fmtDay(to)}</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={!register || !dates.length || state.status === 'busy'} onClick={read}>
              {state.status === 'busy' ? 'Reading Google and Meta…' : state.live ? 'Read Google and Meta again' : 'Check Google and Meta'}
            </button>
            <span className="help-text">
              {state.at ? 'Read at ' + state.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '. ' : ''}
              Preview only: nothing is sent to Google or Meta yet.
            </span>
          </div>
          {state.status === 'error' && <div className="banner banner-warn" style={{ marginTop: 12 }}><div>{state.msg}</div></div>}
          {((state.live && state.live.errors) || []).map(e => (
            <div key={e.connector} className="banner banner-warn" style={{ marginTop: 12 }}><div>{e.connector}: {e.error}</div></div>
          ))}
          {out && to !== latest && (
            <div className="banner banner-warn" style={{ marginTop: 12 }}><div>
              Google and Meta are read as they are now, so set the second date to the latest day ({fmtDay(latest)}) for a true picture.
            </div></div>
          )}

          {out && (
            <>
              <div className="section-label" style={{ marginTop: 18 }}>From these changes ({townChanges.length})</div>
              {!townChanges.length && <div className="help-text">Nothing opened or closed for {role} between these days.</div>}
              {townChanges.map(tc => (
                <div key={tc.town} style={{ marginBottom: 12 }} data-town={tc.town}>
                  <div className={'chg-row ' + (tc.change === 'closed' ? 'bad' : 'good')}>{tc.town} {tc.change}<span>{tc.region}</span></div>
                  {['google', 'meta'].map(p => (
                    <div key={p} className="help-text" style={{ margin: '4px 0 0 12px' }} data-platform={p}>
                      <strong>{PLATFORM[p]}:</strong> {action(tc.platforms[p], tc, out.radius_km)}
                      {tc.platforms[p].campaign && <> &middot; {tc.platforms[p].campaign}</>}
                      {tc.platforms[p].question && <div style={{ marginTop: 2 }}>{tc.platforms[p].question}</div>}
                    </div>
                  ))}
                  <div className="help-text" style={{ margin: '4px 0 0 12px' }} data-platform="indeed">
                    <strong>Indeed:</strong>{' '}
                    {indeedFor(tc.town).length
                      ? indeedFor(tc.town).map(x => (x.change === 'add' ? 'Add ' : 'Remove ') + x.job).join('; ')
                      : 'No job opened or closed (another job for this town changed)'}
                  </div>
                </div>
              ))}

              <div className="section-label" style={{ marginTop: 18 }}>Already out of step before {fmtDay(from)} ({drift.length})</div>
              {!drift.length && !noCampaign.length && !unknown.length && <div className="help-text">Nothing else: every {role} campaign matches.</div>}
              {drift.map(({ c, add, remove }) => (
                <div key={c.platform + c.name} className="help-text" style={{ marginBottom: 8 }} data-campaign={c.name}>
                  <strong>{PLATFORM[c.platform]}</strong> &middot; {c.name}:{' '}
                  {[add.length && 'add ' + add.map(x => `${x.town} (${out.radius_km} km)`).join(', '), remove.length && 'remove ' + remove.map(x => x.town).join(', ')].filter(Boolean).join('; ') || 'no town to change'}
                  {c.question && !townChanges.length && <div>{c.question}</div>}
                  {c.other.length > 0 && <div>Set up differently, left alone: {c.other.join(', ')}</div>}
                  {c.unmatched.length > 0 && <div>Not a town on the list, left alone: {c.unmatched.join(', ')}</div>}
                  {c.notes.map(n => <div key={n}>{n}</div>)}
                </div>
              ))}
              {noCampaign.map(x => (
                <div key={x.platform + x.region} className="help-text" style={{ marginBottom: 8 }}>
                  <strong>{PLATFORM[x.platform]}</strong> &middot; no live {x.role} campaign in {x.region}, but {x.towns.join(', ')} {x.towns.length > 1 ? 'are' : 'is'} open.
                </div>
              ))}
              {unknown.map(x => (
                <div key={x.town} className="help-text" style={{ marginBottom: 8 }}>
                  {x.town} ({x.region}) is open but not on the location list, so it is left out. Add it to data/locations.json.
                </div>
              ))}

              <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button className="btn" disabled title="Applying is the next step">Update Google and Meta</button>
                <span className="help-text">Applying comes next. Until then, this shows exactly what it would change.</span>
              </div>
              <details className="help-text" style={{ marginTop: 12 }}>
                <summary>{out.skipped.length} campaigns never compared, and why</summary>
                <ul>{out.skipped.map(s => <li key={s.platform + s.name}>{PLATFORM[s.platform]}: {s.name} ({s.reason})</li>)}</ul>
              </details>
            </>
          )}
        </div>
      </div>
    );
  }

  RACUI.LocationUpdates = LocationUpdates;
})();
