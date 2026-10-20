// Checks for Update locations (planner/locations.js): the preview of what
// Google and Meta campaigns would change to match today's open towns. The
// campaigns here are made up; only the location list is the real file.
import { loadPlanner, readRoot } from '../lib/planner.mjs';

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
    assert(place.other.includes('place: University of Leeds'), 'a named place is listed and left alone');
    return 'aliases match, Coventry removed from both ad sets, differing ad sets and named places left alone';
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
