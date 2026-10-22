// Checks for Update locations (planner/locations.js): the preview of what
// Google and Meta campaigns would change to match today's open towns. The
// campaigns here are made up; only the location list is the real file.
import { loadPlanner, readRoot } from '../lib/planner.mjs';
import { checkRequest, googlePlan, metaPlan, ACCOUNTS } from '../../api/_locations_apply.mjs';

export default function (check, { assert }) {
  const RAC = loadPlanner();
  const real = JSON.parse(readRoot('data/locations.json'));
  const REGIONS = ['London', 'South East', 'East of England', 'South West', 'East Midlands', 'West Midlands', 'North West',
    'North East', 'Yorkshire & Humber', 'Scotland', 'Wales', 'Northern Ireland'];

  // A small list: two Yorkshire towns, one in the West Midlands, London.
  const register = { radius_km: 25, match_km: 5, locations: [
    { name: 'Leeds', region: 'Yorkshire & Humber', points: [{ name: 'Leeds', lat: 53.8007, lng: -1.5503 }] },
    { name: 'Hull', region: 'Yorkshire & Humber', points: [{ name: 'Kingston upon Hull', lat: 53.7446, lng: -0.3352 }] },
    { name: 'Central Birmingham', region: 'West Midlands', meta: 'Birmingham', points: [{ name: 'Birmingham', lat: 52.4797, lng: -1.9027 }] },
    { name: 'Coventry', region: 'West Midlands', points: [{ name: 'Coventry', lat: 52.4081, lng: -1.5106 }] },
    { name: 'Heathrow', region: 'London', points: [{ name: 'Heathrow', lat: 51.47, lng: -0.4543 }] },
  ] };
  const row = (location, region, today, before = today) => ({ location, region, v: { '2026-10-19': before, '2026-10-20': today } });
  const pri = (smr, patrol = []) => ({ dates: ['2026-10-19', '2026-10-20'], roles: { SMR: { rows: smr }, Patrol: { rows: patrol } } });
  const pin = (campaign, lat, lng, radius = 30, units = 'KILOMETERS') => ({ campaign, campaign_id: campaign.length, campaign_criterion_negative: false,
    campaign_criterion_proximity_radius: radius, campaign_criterion_proximity_radius_units: units,
    campaign_criterion_proximity_geo_point_latitude_in_micro_degrees: lat * 1e6, campaign_criterion_proximity_geo_point_longitude_in_micro_degrees: lng * 1e6 });
  const adset = (campaign, id, cities, extra = {}) => ({ campaign, campaign_id: 'c' + campaign.length, adset_id: id, adset_name: 'Ad set ' + id,
    adset_targeting: JSON.stringify({ geo_locations: { cities: cities.map(c => ({ name: c, key: c, radius: 30, distance_unit: 'kilometer' })), ...extra }, age_min: 18 }) });
  const run = (p, live, oneRacRegions = []) => RAC.locations.preview({ register, pri: p, date: '2026-10-20', prevDate: '2026-10-19', live, oneRacRegions, regions: REGIONS });
  const YORKS = 'RAC | Conversion | SMR Mechanics | Yorkshire & The Humber | GS | February 26 | 2936';
  const WM = 'RAC | Conversion | SMR Mechanics | West Midlands | Meta | Jul 26 | 3037';

  check('Update locations: the town in each job name, however RAC writes it', () => {
    const cases = { 'Mobile Vehicle Technician - Burton Upon Trent': 'Burton Upon Trent', 'Roadside Technician Nights - Leeds': 'Leeds',
      'Roadside Technician  Banbury': 'Banbury', 'Night -Derby': 'Derby', 'Roadside Technician - Reading - Nights': 'Reading',
      'Superflex Roadside Patrol - Oldham/Bury': 'Oldham/Bury' };
    Object.entries(cases).forEach(([job, town]) => assert(RAC.locations.townOf(job) === town, `${job}: got ${RAC.locations.townOf(job)}`));
    return Object.keys(cases).length + ' job names read';
  });

  check('Update locations: a campaign that matches is left alone, an opened town is added at 25 km and a closed one removed', () => {
    const same = run(pri([row('Mobile Vehicle Technician - Leeds', 'Yorkshire & Humber', 1), row('Mobile Vehicle Technician - Hull', 'Yorkshire & Humber', 2)]),
      { google: [pin(YORKS, 53.8, -1.55), pin(YORKS, 53.75, -0.34)] });
    assert(same.changes.length === 0 && same.campaigns[0].keep.length === 2, 'matching campaign should have no changes');
    const moved = run(pri([row('Mobile Vehicle Technician - Leeds', 'Yorkshire & Humber', 1, 0), row('Mobile Vehicle Technician - Hull', 'Yorkshire & Humber', 0, 1)]),
      { google: [pin(YORKS, 53.75, -0.34)] });
    const c = moved.campaigns[0];
    assert(c.add.length === 1 && c.add[0].town === 'Leeds' && c.add[0].points[0].radius_km === 25, 'Leeds should be added at 25 km');
    assert(c.remove.length === 1 && c.remove[0].town === 'Hull', 'Hull should be removed');
    assert(moved.indeed.length === 2 && moved.indeed.some(x => x.change === 'add' && /Leeds/.test(x.job)), 'Indeed should list both jobs');
    return `added ${c.add[0].town} at 25 km, removed ${c.remove[0].town}; Indeed lists ${moved.indeed.length} jobs`;
  });

  check('Update locations: the last open town closing asks before pausing and never empties the campaign', () => {
    const out = run(pri([row('Mobile Vehicle Technician - Hull', 'Yorkshire & Humber', 0, 1)]), { google: [pin(YORKS, 53.75, -0.34)] });
    const c = out.campaigns[0];
    assert(/last open location/.test(c.question || '') && /Should I pause this campaign\?/.test(c.question), 'should ask about pausing');
    assert(c.add.length === 0 && c.keep.length === 0, 'nothing kept or added');
    return c.question;
  });

  check('Update locations: Meta matches cities by name and aliases, and leaves ad sets alone when they differ', () => {
    const p = pri([row('Mobile Vehicle Technician - Central Birmingham', 'West Midlands', 1), row('Mobile Vehicle Technician - Coventry', 'West Midlands', 0)]);
    const out = run(p, { meta: [adset(WM, 1, ['Birmingham', 'Coventry']), adset(WM, 2, ['Birmingham', 'Coventry'])] });
    const c = out.campaigns[0];
    assert(c.keep[0] === 'Central Birmingham' && c.remove.length === 1 && c.remove[0].town === 'Coventry', 'Birmingham kept as Central Birmingham, Coventry removed');
    assert(c.adsets.length === 2, 'every ad set is part of the change');
    const differ = run(p, { meta: [adset(WM, 1, ['Birmingham', 'Coventry']), adset(WM, 2, ['Birmingham'])] }).campaigns[0];
    assert(!differ.remove.length && !differ.add.length && differ.notes.length, 'ad sets that differ should be left alone');
    const place = run(p, { meta: [adset(WM, 1, ['Birmingham'], { places: [{ name: 'University of Leeds' }] })] }).campaigns[0];
    assert(place.other.includes('place: University of Leeds'), 'a named place with no point is listed and left alone');
    // A named place with a point counts as its town and is swapped for it.
    const YM = 'RAC | Conversion | SMR Mechanics | Yorkshire & the Humber | Meta | Aug 26 | 3037';
    const uol = { key: '93693583250', name: 'University of Leeds', latitude: 53.8065, longitude: -1.556, radius: 30, distance_unit: 'kilometer' };
    const swap = run(pri([row('Mobile Vehicle Technician - Leeds', 'Yorkshire & Humber', 1), row('Mobile Vehicle Technician - Hull', 'Yorkshire & Humber', 1)]),
      { meta: [adset(YM, 1, [], { places: [uol], custom_locations: [{ latitude: 53.75, longitude: -0.34, radius: 30, distance_unit: 'kilometer' }] })] }).campaigns[0];
    assert(!swap.add.length && !swap.remove.length, 'Leeds is not added on top of the place');
    assert(swap.replace.length === 1 && swap.replace[0].town === 'Leeds' && swap.replace[0].key === uol.key && swap.replace[0].points[0].radius_km === 30, 'University of Leeds is replaced by Leeds at 30 km');
    return 'aliases match, Coventry removed from both ad sets, differing ad sets left alone; University of Leeds offered as a swap for Leeds at its 30 km';
  });

  check('Update locations: London is covered as a whole, OneRAC takes both roles, UK-wide and idle campaigns are left alone', () => {
    const one = 'RAC | Conversion | OneRAC | London | GS | Oct 26 | 3037';
    const live = { google: [pin(one, 51.5072, -0.1276, 15, 'MILES'), pin('RAC | Conversion | Patrol | London | GS | February 26 | 2936', 51.5, -0.12),
      pin('RAC | Conversion | SMR Mechanics | UK | GS | July 25 | 2936 Broad vs Exact', 53.8, -1.55)] };
    const out = run(pri([], [row('Roadside Technician - Heathrow', 'London', 2)]), live, ['London']);
    const c = out.campaigns.find(x => x.kind === 'OneRAC');
    assert(c && c.wholeRegion && !c.add.length && !c.question, 'OneRAC London covers Heathrow with no change');
    assert(out.skipped.some(s => /OneRAC runs in London/.test(s.reason)) && out.skipped.some(s => /UK-wide/.test(s.reason)), 'Patrol London and the UK campaign are skipped');
    const closed = run(pri([], [row('Roadside Technician - Heathrow', 'London', 0, 2)]), live, ['London']).campaigns.find(x => x.kind === 'OneRAC');
    assert(/Should I pause/.test(closed.question || ''), 'London closing entirely asks about pausing');
    return 'OneRAC London unchanged with Heathrow open; asks to pause once nothing in London is open; Patrol London and the UK campaign skipped';
  });

  check('Update locations: a town not on the list, or with no campaign, is reported rather than guessed', () => {
    const out = run(pri([row('Mobile Vehicle Technician - Atlantis', 'South West', 1), row('Mobile Vehicle Technician - Leeds', 'Yorkshire & Humber', 1)]), { google: [] });
    assert(out.unknownTowns.length === 1 && out.unknownTowns[0].town === 'Atlantis', 'Atlantis should be reported');
    assert(out.noCampaign.some(x => x.platform === 'google' && x.region === 'Yorkshire & Humber' && x.towns[0] === 'Leeds'), 'Leeds has no campaign');
    return 'unknown town and missing campaign both reported';
  });

  check('Update locations: each town that opened or closed says what happens on each platform, apart from what was already out of step', () => {
    // Coventry closes today; Leeds was already missing before today.
    const p = pri([row('Mobile Vehicle Technician - Coventry', 'West Midlands', 0, 1), row('Mobile Vehicle Technician - Central Birmingham', 'West Midlands', 1),
      row('Mobile Vehicle Technician - Leeds', 'Yorkshire & Humber', 1)]);
    const out = run(p, { google: [pin(YORKS, 53.75, -0.34)], meta: [adset(WM, 1, ['Birmingham', 'Coventry'])] });
    const cov = out.townChanges.find(t => t.town === 'Coventry');
    assert(cov && cov.change === 'closed' && cov.platforms.meta.status === 'remove' && cov.platforms.meta.campaign === WM, 'Coventry: remove on Meta');
    assert(cov.platforms.google.status === 'noCampaign', 'Coventry: no Google West Midlands campaign here');
    const yorks = out.campaigns.find(c => c.name === YORKS);
    assert(yorks.add[0].town === 'Leeds' && yorks.add[0].fromChanges === false, 'Leeds is listed as already out of step');
    assert(out.campaigns.find(c => c.name === WM).remove[0].fromChanges === true, 'Coventry is listed as from these changes');
    // OneRAC: a town closing for one role while open for the other stays.
    const one = 'RAC | Conversion | OneRAC | East Midlands | GS | Oct 26 | 3037';
    const reg2 = { ...register, locations: [...register.locations, { name: 'Derby', region: 'East Midlands', points: [{ name: 'Derby', lat: 52.9225, lng: -1.4746 }] }] };
    const both = RAC.locations.preview({ register: reg2, pri: pri([row('Mobile Vehicle Technician - Derby', 'East Midlands', 0, 1)], [row('Roadside Technician - Derby', 'East Midlands', 2)]),
      date: '2026-10-20', prevDate: '2026-10-19', oneRacRegions: ['East Midlands'], regions: REGIONS, live: { google: [pin(one, 52.92, -1.47)] } });
    assert(!both.townChanges.some(t => t.town === 'Derby'), 'Derby still open for Patrol: no change for OneRAC, and SMR does not report OneRAC regions');
    assert(both.campaigns[0].keep.includes('Derby') && !both.campaigns[0].remove.length, 'Derby stays on the OneRAC campaign');
    return 'Coventry: remove on Meta, no Google campaign; Leeds kept apart as already out of step; Derby kept on OneRAC while Patrol is open';
  });

  check('OneRAC: a town in its regions is open while either role has it open, in the update and the written update', () => {
    const one = 'RAC | Conversion | OneRAC | East Midlands | GS | Oct 26 | 3037';
    const reg2 = { ...register, locations: [...register.locations,
      { name: 'Derby', region: 'East Midlands', points: [{ name: 'Derby', lat: 52.9225, lng: -1.4746 }] },
      { name: 'Leicester', region: 'East Midlands', points: [{ name: 'Leicester', lat: 52.6369, lng: -1.1398 }] }] };
    // Derby closes for both roles; Leicester opens for Patrol only; Coventry (not OneRAC) closes for SMR.
    const p = pri([row('Mobile Vehicle Technician - Derby', 'East Midlands', 0, 1), row('Mobile Vehicle Technician - Coventry', 'West Midlands', 0, 1)],
      [row('Roadside Technician Nights - Derby', 'East Midlands', 0, 1), row('Superflex Roadside Patrol - Leicester', 'East Midlands', 1, 0)]);
    const rows = RAC.locations.oneRacRows(p, ['East Midlands'], reg2);
    assert(rows.length === 2 && rows.every(r => r.region === 'East Midlands') && rows[0].location === 'OneRAC - Derby' && rows[0].v['2026-10-19'] === 2, 'one row per OneRAC town, both roles added together');
    const out = RAC.locations.preview({ register: reg2, pri: p, date: '2026-10-20', prevDate: '2026-10-19', oneRacRegions: ['East Midlands'], regions: REGIONS,
      live: { google: [pin(one, 52.92, -1.47), pin(one, 51.0, -3.0)] } });
    const tc = (t) => out.townChanges.find(x => x.town === t);
    assert(tc('Derby').role === 'OneRAC' && tc('Derby').change === 'closed' && tc('Derby').platforms.google.status === 'remove', 'Derby closed for OneRAC: remove');
    assert(tc('Leicester').role === 'OneRAC' && tc('Leicester').platforms.google.status === 'add', 'Leicester opened for Patrol only: added to OneRAC');
    assert(tc('Coventry').role === 'SMR', 'Coventry is still an SMR change');
    assert(!out.townChanges.some(x => x.role !== 'OneRAC' && x.region === 'East Midlands'), 'SMR and Patrol do not report OneRAC regions');
    const text = RAC.locations.writtenUpdate(p, '2026-10-19', '2026-10-20', ['East Midlands'], reg2);
    assert(text.endsWith('OneRAC\n\nLocations added:\n\n• OneRAC - Leicester\n\nLocations removed:\n\n• OneRAC - Derby'), 'written update OneRAC section:\n' + text);
    assert(!/OneRAC/.test(RAC.locations.writtenUpdate(p, '2026-10-19', '2026-10-20', [], reg2)), 'no OneRAC section when OneRAC is not running');
    return 'Derby closed for both: remove from OneRAC; Leicester open for Patrol only: add; the written update gains a OneRAC section';
  });

  // ---- What Update Google and Meta sends (api/_locations_apply.mjs) ----
  const crit = (type, extra = {}) => ({ criteria_type: type, campaign_criterion_negative: false, ...extra });
  const prox = (lat, lng, radius = 30, units = 'KILOMETERS', bm = null) => crit('PROXIMITY', { campaign_criterion_proximity_radius: radius,
    campaign_criterion_proximity_radius_units: units, campaign_criterion_bid_modifier: bm,
    campaign_criterion_proximity_geo_point_latitude_in_micro_degrees: lat * 1e6, campaign_criterion_proximity_geo_point_longitude_in_micro_degrees: lng * 1e6 });
  const GC = { platform: 'google', campaignId: '123', campaignName: YORKS };

  check('Update Google and Meta: only RAC role and region campaigns, a few at a time, with UK points', () => {
    assert(checkRequest([]) !== null, 'empty request refused');
    assert(/UK-wide/.test(checkRequest([{ ...GC, campaignName: 'RAC | Conversion | SMR Mechanics | UK | GS | July 25 | 2936 Broad vs Exact' }])), 'UK campaign refused');
    assert(/open day/.test(checkRequest([{ ...GC, campaignName: 'RAC | Conversion | OneRAC | Open Day | Sevenoaks | Meta | October 26 | 3145' }])), 'open day refused');
    assert(/conversion/.test(checkRequest([{ ...GC, campaignName: 'Someone else | Conversion | Leeds' }])), 'other campaigns refused');
    assert(/At most/.test(checkRequest(Array.from({ length: 13 }, () => GC))), 'more than 12 campaigns refused');
    assert(/no UK point/.test(checkRequest([{ ...GC, add: [{ town: 'Paris', lat: 48.85, lng: 2.35 }] }])), 'a point outside the UK refused');
    assert(checkRequest([{ ...GC, add: [{ town: 'Leeds', lat: 53.8, lng: -1.55 }] }]) === null, 'a normal change passes');
    assert(ACCOUNTS.google === '904-497-1739' && ACCOUNTS.meta === '652299511175883', 'RAC accounts only');
    return 'UK-wide, open day and other campaigns refused; at most 12 campaigns; points must be in the UK; RAC accounts only';
  });

  check('Update Google and Meta: Google keeps every other pin as it is, adds at 25 km and is never emptied', () => {
    const rows = [prox(53.75, -0.34, 30, 'KILOMETERS', 1.2), prox(53.8, -1.55, 20, 'MILES'), crit('KEYWORD'), crit('DEVICE')];
    const p = googlePlan(rows, { ...GC, remove: [{ town: 'Leeds', lat: 53.8, lng: -1.55, radius: 20 }], add: [{ town: 'York', lat: 53.96, lng: -1.08 }] });
    assert(p.action === 'set_campaign_geo_targeting' && p.params.campaign_id === '123' && Array.isArray(p.params.locations) && !p.params.locations.length, 'geo targeting call');
    const [hull, york] = p.params.proximities;
    assert(p.params.proximities.length === 2 && hull.radius === 30 && hull.radius_units === 'KILOMETERS' && hull.bid_modifier === 1.2, 'Hull kept with its radius and bid adjustment');
    assert(york.radius === 25 && york.radius_units === 'KILOMETERS', 'York added at 25 km');
    assert(/no longer on the campaign/.test(googlePlan(rows, { ...GC, remove: [{ town: 'Bath', lat: 51.38, lng: -2.36 }] }).skip), 'a town already gone stops the change');
    assert(/no locations/.test(googlePlan([prox(53.75, -0.34)], { ...GC, remove: [{ town: 'Hull', lat: 53.75, lng: -0.34 }] }).skip), 'never emptied');
    assert(/left for a person/.test(googlePlan([...rows, crit('LOCATION', { campaign_criterion_negative: true })], GC).skip), 'exclusions left for a person');
    const pause = googlePlan(rows, { ...GC, pause: true });
    assert(pause.action === 'pause_campaign' && pause.params.campaign_id === '123', 'pause');
    return 'Hull kept at 30 km with its 1.2 bid adjustment, Leeds removed, York added at 25 km; gone towns, emptying and exclusions stop it; pause only when asked';
  });

  check('Update Google and Meta: Meta changes only the locations, adds 25 km pins and is never emptied', () => {
    const t = { age_min: 18, age_max: 65, publisher_platforms: ['facebook', 'instagram'],
      geo_locations: { cities: [{ key: '1', name: 'Birmingham', radius: 30, distance_unit: 'kilometer' }, { key: '2', name: 'Coventry', radius: 30, distance_unit: 'kilometer' }], location_types: ['home', 'recent'] } };
    const MC = { platform: 'meta', campaignId: 'm1', campaignName: WM };
    const p = metaPlan(t, { ...MC, remove: [{ town: 'Coventry', key: '2', city: 'Coventry' }], add: [{ town: 'Walsall', lat: 52.586, lng: -1.982 }] });
    assert(p.action === 'update_adset', 'ad set update');
    const g = p.targeting.geo_locations;
    assert(g.cities.length === 1 && g.cities[0].key === '1', 'Coventry removed, Birmingham kept');
    assert(g.custom_locations.length === 1 && g.custom_locations[0].radius === 25 && g.custom_locations[0].distance_unit === 'kilometer', 'Walsall added as a 25 km pin');
    assert(JSON.stringify(g.location_types) === JSON.stringify(t.geo_locations.location_types), 'location types untouched');
    const rest = (x) => JSON.stringify({ ...x, geo_locations: undefined });
    assert(rest(p.targeting) === rest(t), 'everything outside the locations sent back exactly as read');
    assert(t.geo_locations.cities.length === 2, 'the targeting read is not changed in place');
    assert(/no longer on the ad set/.test(metaPlan(t, { ...MC, remove: [{ town: 'Leeds', key: '9', city: 'Leeds' }] }).skip), 'a town already gone stops the change');
    assert(/no locations/.test(metaPlan(t, { ...MC, remove: [{ town: 'Central Birmingham', key: '1' }, { town: 'Coventry', key: '2' }] }).skip), 'never emptied');
    assert(metaPlan(t, { ...MC, pause: true }).action === 'pause_campaign', 'pause');
    const tp = { ...t, geo_locations: { places: [{ key: '936', name: 'University of Leeds', latitude: 53.8065, longitude: -1.556, radius: 30, distance_unit: 'kilometer' }], location_types: ['home'] } };
    const sw = metaPlan(tp, { ...MC, replace: [{ town: 'Leeds', place: 'University of Leeds', key: '936', lat: 53.8007, lng: -1.5503, radius: 30 }] });
    assert(!sw.targeting.geo_locations.places && sw.targeting.geo_locations.custom_locations[0].radius === 30 && sw.targeting.geo_locations.custom_locations[0].latitude === 53.8007, 'place swapped for a Leeds pin at 30 km');
    assert(/only Meta/.test(checkRequest([{ ...GC, replace: [{ town: 'Leeds', key: '936', lat: 53.8, lng: -1.55, radius: 30 }] }])), 'no place swaps on Google');
    return 'Coventry removed, Birmingham kept, Walsall added as a 25 km pin; age, placements and location types untouched; gone towns and emptying stop it';
  });

  check('Update Google and Meta: the preview carries what to remove, and real changes only happen on the production deployment', () => {
    const out = run(pri([row('Mobile Vehicle Technician - Coventry', 'West Midlands', 0, 1), row('Mobile Vehicle Technician - Central Birmingham', 'West Midlands', 1)]),
      { meta: [adset(WM, 1, ['Birmingham', 'Coventry'])] });
    const r = out.campaigns[0].remove[0];
    assert(r.town === 'Coventry' && r.key === 'Coventry' && r.city === 'Coventry', 'Meta remove carries the city key');
    const api = readRoot('api/windsor-spend.mjs');
    assert(/const live = process\.env\.VERCEL_ENV === "production" && !body\.test;/.test(api), 'real changes only on production, and never on a test run');
    assert(/if \(live\) for \(const s of out\.sent\) s\.answer = await windsorTool/.test(api), 'nothing is sent unless live');
    assert(/if \(isCron \|\| !email\) return res\.status\(403\)/.test(api), 'a signed-in person only, never the scheduled pull');
    assert(/req\.method !== "POST"/.test(api), 'changes only by POST');
    return 'Meta remove carries the city key; the endpoint sends only on production, signed in, by POST';
  });

  check('Written update: every job that opened or closed, by role, in the team’s usual wording', () => {
    const p = pri([row('Mobile Vehicle Technician - Coventry', 'West Midlands', 0, 1)],
      [row('Roadside Technician - Leeds', 'Yorkshire & Humber', 2, 0), row('Superflex Roadside Patrol - York', 'Yorkshire & Humber', 1)]);
    const text = RAC.locations.writtenUpdate(p, '2026-10-19', '2026-10-20');
    const want = "Please find below all details of today's update to location priorities, covering 19th Oct to 20th Oct.\n\n" +
      'SMR\n\nRoles/locations added:\n\n• None\n\nRoles/locations removed:\n\n• Mobile Vehicle Technician - Coventry\n\n' +
      'Patrol\n\nRoles/locations added:\n\n• Roadside Technician - Leeds\n\nRoles/locations removed:\n\n• None';
    assert(text === want, 'got:\n' + text);
    const d = (iso) => RAC.locations.writtenUpdate(pri([]), iso, iso).match(/covering (\S+ \S+)/)[1];
    assert(d('2026-10-01') === '1st Oct' && d('2026-10-02') === '2nd Oct' && d('2026-10-03') === '3rd Oct' && d('2026-10-11') === '11th Oct' && d('2026-10-22') === '22nd Oct', 'day endings');
    return 'Coventry removed for SMR, Leeds added for Patrol, None where nothing moved; 1st, 2nd, 3rd, 11th, 22nd';
  });

  check('Update locations: the location list gives every town one region and a point', () => {
    const names = new Set();
    real.locations.forEach(l => {
      assert(!names.has(l.name), 'duplicate ' + l.name); names.add(l.name);
      assert(REGIONS.includes(l.region), l.name + ': region ' + l.region);
      assert(l.wholeRegion || (l.points.length && l.points.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat > 49.8 && p.lat < 60.9 && p.lng > -8.2 && p.lng < 1.8)), l.name + ': point outside the UK');
    });
    const decided = { Chigwell: 'London', Esher: 'South East', Maidstone: 'South East', Portsmouth: 'South West', Southampton: 'South West', Bradford: 'Yorkshire & Humber', 'Burton Upon Trent': 'East Midlands' };
    Object.entries(decided).forEach(([t, r]) => assert(real.locations.find(l => l.name === t).region === r, `${t} should be ${r}`));
    assert(real.radius_km === 25, 'new towns go in at 25 km');
    return `${real.locations.length} locations, one region each; the regions decided on 20 October hold`;
  });
}
