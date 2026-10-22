// Location priorities, What changed and update: under the list of what
// opened and closed between two days, what that means on Google, Meta and
// Indeed, and anything that was already out of step before those days
// (planner/locations.js). Google and Meta are read through Windsor. Changes
// are sent only from the live address, for the campaigns ticked, after a
// confirm (api/windsor-spend.mjs ?apply=1); a test run anywhere shows what
// would be sent and sends nothing. Loaded by
// index.html as a Babel script before the app; exposed as
// window.RACUI.LocationUpdates.
(function () {
  const RACUI = (window.RACUI = window.RACUI || {});
  const { useState, useMemo } = React;
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

  // The request for api/windsor-spend.mjs ?apply=1, one entry per campaign.
  function requestFor(c, pause) {
    if (pause) return { platform: c.platform, campaignId: c.id, campaignName: c.name, adsetIds: c.adsets, pause: true };
    return { platform: c.platform, campaignId: c.id, campaignName: c.name, adsetIds: c.adsets,
      add: c.add.flatMap(a => a.points.map(p => ({ town: a.town, lat: p.lat, lng: p.lng }))),
      remove: c.remove.map(r => ({ town: r.town, lat: r.lat, lng: r.lng, radius: r.radius, key: r.key, city: r.city, place: r.place })),
      replace: c.replace.map(r => ({ town: r.town, place: r.place, key: r.key, lat: r.points[0].lat, lng: r.points[0].lng, radius: r.points[0].radius_km })) };
  }
  const WAIT_MIN = 15;   // Windsor's copy of the targeting can lag this long

  function LocationUpdates({ pri, from, to, role, oneRacRegions, register: list, getTargeting, applyLocations, canApply, fmtDay }) {
    const RAC = window.RAC;
    const dates = (pri && pri.dates) || [];
    const latest = dates[dates.length - 1];
    // The location list, loaded once by the Location priorities tool.
    const register = list && !list.error ? list : null;
    const [state, setState] = useState({ status: 'idle' });
    const [answers, setAnswers] = useState({});     // pause questions: campaign name -> 'yes' | 'no'
    const [picked, setPicked] = useState(null);     // campaign names ticked in the confirm step
    const [run, setRun] = useState({ status: 'idle' });
    const [lastApplied, setLastApplied] = useState(null);
    const [copied, setCopied] = useState(false);
    const written = from && to ? RAC.locations.writtenUpdate(pri, from, to, oneRacRegions, register) : '';
    const copy = () => navigator.clipboard.writeText(written).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });

    const read = async () => {
      setState({ status: 'busy' });
      try { setState({ status: 'done', live: await getTargeting(), at: new Date() }); }
      catch (e) { setState({ status: 'error', msg: e.message }); }
    };
    const out = useMemo(() => (state.live && register ? RAC.locations.preview({ register, pri, date: to, prevDate: from,
      oneRacRegions, live: state.live, regions: window.__AVP_DATA__.regions_ordered }) : null), [state.live, register, pri, from, to, oneRacRegions]);

    // OneRAC is its own role switch: its campaigns show there and nowhere else.
    const mine = (c) => c.kind === role;
    const isOne = role === 'OneRAC';
    const townChanges = out ? out.townChanges.filter(t => t.role === role) : [];
    const drift = out ? out.campaigns.filter(mine).map(c => ({ c, add: c.add.filter(x => !x.fromChanges), remove: c.remove.filter(x => !x.fromChanges) }))
      .filter(x => x.add.length || x.remove.length || x.c.replace.length || x.c.other.length || x.c.unmatched.length || (x.c.question && !townChanges.length)) : [];
    const swaps = (c) => c.replace.map(x => `replace ${x.place} (place) with ${x.town} (${x.points[0].radius_km} km)`);
    const noCampaign = out ? out.noCampaign.filter(x => x.role === role) : [];
    const unknown = out ? out.unknownTowns.filter(x => (isOne ? (oneRacRegions || []).includes(x.region) : x.role === role)) : [];
    const indeedFor = (town) => (out ? out.indeed.filter(x => (isOne || x.role === role) && RAC.locations.townOf(x.job).toLowerCase() === town.toLowerCase()) : []);

    // What can be sent: every campaign for this role with towns to change,
    // and any whose pause question was answered yes.
    const sendable = out ? out.campaigns.filter(mine).filter(c => !c.wholeRegion && !c.notes.length && (c.question ? answers[c.name] === 'yes' : (c.add.length || c.remove.length || c.replace.length))) : [];
    const ticked = sendable.filter(c => !picked || picked.includes(c.name));
    const waiting = lastApplied && (Date.now() - lastApplied) < WAIT_MIN * 60000;
    const describe = (c) => (c.question && answers[c.name] === 'yes' ? 'pause the campaign'
      : [c.add.length && 'add ' + c.add.map(x => `${x.town} (${out.radius_km} km)`).join(', '), c.remove.length && 'remove ' + c.remove.map(x => x.town).join(', '), ...swaps(c)].filter(Boolean).join('; '));
    const send = async (test) => {
      setRun({ status: 'busy', test });
      try {
        const r = await applyLocations({ test, changes: ticked.map(c => requestFor(c, c.question && answers[c.name] === 'yes')) });
        setRun({ status: 'done', test, ...r });
        if (r.applied) setLastApplied(Date.now());
      } catch (e) { setRun({ status: 'error', msg: e.message }); }
    };

    return (
      <div className="card" data-panel="locations">
        <div className="card-head">
          <div className="card-title">Update Google, Meta and Indeed</div>
          <div className="card-sub">{from && fmtDay(from)} to {to && fmtDay(to)}</div>
        </div>
        <div className="card-body">
          <div className="section-label">Written update ({from && fmtDay(from)} to {to && fmtDay(to)}, both roles)</div>
          <textarea readOnly value={written} data-field="written-update" rows={Math.min(18, written.split('\n').length + 1)}
            style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, padding: 10, boxSizing: 'border-box' }} />
          <div style={{ margin: '6px 0 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-sm" disabled={!written} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            <span className="help-text">Every job that opened or closed between the two days, as RAC names it.</span>
          </div>

          <div className="section-label">Google and Meta</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={!register || !dates.length || state.status === 'busy'} onClick={read}>
              {state.status === 'busy' ? 'Reading Google and Meta…' : state.live ? 'Read Google and Meta again' : 'Check Google and Meta'}
            </button>
            <span className="help-text">
              {state.at ? 'Read at ' + state.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '. ' : ''}
              Reading changes nothing.
            </span>
          </div>
          {state.status === 'error' && <div className="banner banner-warn" style={{ marginTop: 12 }}><div>{state.msg}</div></div>}
          {list && list.error && <div className="banner banner-warn" style={{ marginTop: 12 }}><div>Could not read the location list (data/locations.json), so Google and Meta can&rsquo;t be checked.</div></div>}
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
                      {tc.platforms[p].question && <Question q={tc.platforms[p].question} name={tc.platforms[p].campaign} answers={answers} setAnswers={setAnswers} />}
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
                  {[add.length && 'add ' + add.map(x => `${x.town} (${out.radius_km} km)`).join(', '), remove.length && 'remove ' + remove.map(x => x.town).join(', '), ...swaps(c)].filter(Boolean).join('; ') || 'no town to change'}
                  {c.question && !townChanges.length && <Question q={c.question} name={c.name} answers={answers} setAnswers={setAnswers} />}
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

              <div className="section-label" style={{ marginTop: 18 }}>Update Google and Meta</div>
              {!sendable.length && <div className="help-text">Nothing to send for {role}.</div>}
              {sendable.length > 0 && (
                <div data-panel="confirm">
                  {sendable.map(c => (
                    <label key={c.platform + c.name} className="help-text" style={{ display: 'block', marginBottom: 4 }}>
                      <input type="checkbox" checked={ticked.includes(c)}
                        onChange={e => setPicked(ps => { const cur = ps || sendable.map(x => x.name); return e.target.checked ? [...cur, c.name] : cur.filter(n => n !== c.name); })} />
                      {' '}<strong>{PLATFORM[c.platform]}</strong> &middot; {c.name}: {describe(c)}
                    </label>
                  ))}
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {canApply && (
                      <button className="btn btn-primary" disabled={!ticked.length || run.status === 'busy' || waiting}
                        onClick={() => { if (window.confirm(`Change ${ticked.length} campaign${ticked.length > 1 ? 's' : ''} in RAC's live Google and Meta accounts?\n\n` + ticked.map(c => `${PLATFORM[c.platform]} · ${c.name}: ${describe(c)}`).join('\n'))) send(false); }}>
                        {run.status === 'busy' && !run.test ? 'Updating…' : `Update ${ticked.length} campaign${ticked.length === 1 ? '' : 's'}`}
                      </button>
                    )}
                    <button className="btn" disabled={!ticked.length || run.status === 'busy'} onClick={() => send(true)}>
                      {run.status === 'busy' && run.test ? 'Testing…' : 'Test run (changes nothing)'}
                    </button>
                    <span className="help-text">
                      {canApply ? 'Asks you to confirm before anything is sent.' : 'This is a test link, so it can only do a test run.'}
                      {waiting && ` Just updated: Windsor can take ${WAIT_MIN} minutes to show it, so read Google and Meta again before the next update.`}
                    </span>
                  </div>
                </div>
              )}
              {run.status === 'error' && <div className="banner banner-warn" style={{ marginTop: 12 }}><div>{run.msg}</div></div>}
              {run.status === 'done' && (
                <div className={'banner ' + (run.results.some(r => r.error || r.skip) ? 'banner-warn' : 'banner-good')} style={{ marginTop: 12 }} data-panel="results"><div>
                  <strong>{run.applied ? 'Sent to Google and Meta.' : 'Test run: nothing was sent.'}</strong>
                  {!run.applied && <> Connection to Windsor for changes: {run.connection === 'ok' ? 'working' : run.connection}.</>}
                  {run.results.map(r => (
                    <div key={r.platform + r.campaignName} style={{ marginTop: 6 }}>
                      {PLATFORM[r.platform]} &middot; {r.campaignName}:{' '}
                      {r.error ? 'failed: ' + r.error : r.skip ? 'not sent: ' + r.skip
                        : run.applied ? `done (${r.sent.length} change${r.sent.length === 1 ? '' : 's'})` : `would send ${r.sent.map(s => s.action).join(', ')}`}
                    </div>
                  ))}
                  {run.applied && <div style={{ marginTop: 6 }}>Read Google and Meta again in about {WAIT_MIN} minutes to see the new targeting here.</div>}
                </div></div>
              )}
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

  function Question({ q, name, answers, setAnswers }) {
    return (
      <div style={{ marginTop: 2 }}>
        {q}{' '}
        <button className="btn btn-sm" onClick={() => setAnswers(a => ({ ...a, [name]: 'yes' }))}>Yes</button>{' '}
        <button className="btn btn-sm" onClick={() => setAnswers(a => ({ ...a, [name]: 'no' }))}>No</button>
        {answers[name] && <span> {answers[name] === 'yes' ? 'Pause it: ticked below.' : 'Leave it running.'}</span>}
      </div>
    );
  }

  RACUI.LocationUpdates = LocationUpdates;
})();
