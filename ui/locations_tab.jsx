// Location priorities: Update locations. Reads what every live Google and
// Meta conversion campaign targets (through Windsor) and shows what would
// change to match the towns open today (planner/locations.js). This version
// is a preview: nothing is sent to Google or Meta. Loaded by index.html as a
// Babel script before the app; exposed as window.RACUI.LocationUpdates.
(function () {
  const RACUI = (window.RACUI = window.RACUI || {});
  const { useState, useEffect } = React;
  const PLATFORM = { google: 'Google', meta: 'Meta' };

  function LocationUpdates({ pri, month, oneRacRegions, getTargeting, fmtDay }) {
    const RAC = window.RAC;
    const dates = (pri && pri.dates) || [];
    const [register, setRegister] = useState(null);
    const [state, setState] = useState({ status: 'idle' });
    const [answers, setAnswers] = useState({});
    useEffect(() => {
      fetch('data/locations.json').then(r => r.json()).then(setRegister)
        .catch(e => setState({ status: 'error', msg: 'Could not read the location list: ' + e.message }));
    }, []);

    const go = async () => {
      setState({ status: 'busy' });
      try {
        const live = await getTargeting();
        const out = RAC.locations.preview({ register, pri, date: dates[dates.length - 1], prevDate: dates[dates.length - 2],
          oneRacRegions, live, regions: window.__AVP_DATA__.regions_ordered });
        setState({ status: 'done', out, errors: live.errors || [] });
        setAnswers({});
      } catch (e) { setState({ status: 'error', msg: e.message }); }
    };

    const out = state.out;
    const towns = (xs) => xs.map(x => x.town).join(', ');
    return (
      <div data-panel="locations">
        <div className="banner banner-info">
          <div className="banner-icon">i</div>
          <div>
            Compares the towns open on {dates.length ? fmtDay(dates[dates.length - 1]) : 'the latest day'} with what every live
            Google and Meta conversion campaign targets, and lists what would change. New towns go in at
            {' '}{register ? register.radius_km : 25} km; existing radii stay as they are. UK-wide and open day campaigns are left alone.
            {' '}<strong>Preview only: nothing is sent to Google or Meta.</strong>
          </div>
        </div>
        <div className="card"><div className="card-body">
          <button className="btn btn-primary" disabled={!register || !dates.length || state.status === 'busy'} onClick={go}>
            {state.status === 'busy' ? 'Reading Google and Meta…' : 'Check live targeting'}
          </button>
          {!dates.length && <span className="help-text" style={{ marginLeft: 12 }}>Paste this month&rsquo;s priorities first.</span>}
          {state.status === 'error' && <div className="banner banner-warn" style={{ marginTop: 12 }}><div>{state.msg}</div></div>}
          {(state.errors || []).map(e => (
            <div key={e.connector} className="banner banner-warn" style={{ marginTop: 12 }}><div>{e.connector}: {e.error}</div></div>
          ))}
        </div></div>

        {out && (
          <>
            <div className="card">
              <div className="card-head"><div className="card-title">
                {out.changes.length ? `${out.changes.length} campaign${out.changes.length > 1 ? 's' : ''} to change` : 'Every campaign matches today’s list'}
              </div></div>
              <div className="card-body">
                <p className="help-text">{out.counts.campaigns} live campaigns checked: {out.counts.add} town{out.counts.add === 1 ? '' : 's'} to add, {out.counts.remove} to remove.</p>
                {out.changes.length > 0 && (
                  <table className="alloc-table">
                    <thead><tr><th>Platform</th><th>Campaign</th><th>Add</th><th>Remove</th><th>Notes</th></tr></thead>
                    <tbody>
                      {out.changes.map(c => (
                        <tr key={c.platform + c.name} data-campaign={c.name}>
                          <td>{PLATFORM[c.platform]}</td>
                          <td>{c.kind} &middot; {c.region}</td>
                          <td>{towns(c.add) || '–'}</td>
                          <td>{towns(c.remove) || '–'}</td>
                          <td>
                            {c.question && (
                              <div>
                                {c.question}{' '}
                                <button className="btn btn-sm" onClick={() => setAnswers(a => ({ ...a, [c.name]: 'yes' }))}>Yes</button>{' '}
                                <button className="btn btn-sm" onClick={() => setAnswers(a => ({ ...a, [c.name]: 'no' }))}>No</button>
                                {answers[c.name] && <span className="help-text"> {answers[c.name] === 'yes' ? 'Noted: pause.' : 'Noted: leave running.'} Nothing is applied yet.</span>}
                              </div>
                            )}
                            {c.other.length > 0 && <div>Set up differently, left alone: {c.other.join(', ')}</div>}
                            {c.unmatched.length > 0 && <div>Not a town on the list, left alone: {c.unmatched.join(', ')}</div>}
                            {c.notes.map(n => <div key={n}>{n}</div>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><div className="card-title">Indeed: change by hand</div></div>
              <div className="card-body">
                {out.prevDate ? (
                  out.indeed.length ? (
                    <table className="alloc-table">
                      <thead><tr><th>Role</th><th>Job</th><th>Region</th><th>Change</th></tr></thead>
                      <tbody>{out.indeed.map(x => (
                        <tr key={x.role + x.job}><td>{x.role}</td><td>{x.job}</td><td>{x.region}</td>
                          <td>{x.change === 'add' ? `Add (${x.open} open)` : 'Remove'}</td></tr>
                      ))}</tbody>
                    </table>
                  ) : <p className="help-text">No jobs opened or closed between {fmtDay(out.prevDate)} and {fmtDay(out.date)}.</p>
                ) : <p className="help-text">Only one day this month, so there is nothing to compare yet.</p>}
              </div>
            </div>

            {(out.noCampaign.length > 0 || out.unknownTowns.length > 0) && (
              <div className="card">
                <div className="card-head"><div className="card-title">Worth a look</div></div>
                <div className="card-body method-body">
                  {out.noCampaign.map(x => (
                    <p key={x.platform + x.role + x.region}>No live {PLATFORM[x.platform]} {x.role} campaign in {x.region}, but {x.towns.join(', ')} {x.towns.length > 1 ? 'are' : 'is'} open.</p>
                  ))}
                  {out.unknownTowns.map(x => (
                    <p key={x.role + x.town}>{x.town} ({x.role}, {x.region}) is open but not on the location list, so it is not in the preview. Add it to data/locations.json.</p>
                  ))}
                </div>
              </div>
            )}

            <details className="help-text" style={{ margin: '0 0 18px 4px' }}>
              <summary>{out.skipped.length} campaigns not compared, and why</summary>
              <ul>{out.skipped.map(s => <li key={s.platform + s.name}>{PLATFORM[s.platform]}: {s.name} ({s.reason})</li>)}</ul>
            </details>
          </>
        )}
      </div>
    );
  }

  RACUI.LocationUpdates = LocationUpdates;
})();
