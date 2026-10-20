// RAC planner: Update locations, the preview.
//
// Compares the towns open today on Location priorities with the towns each
// live Google and Meta campaign targets, and lists what would change. It
// reads; it changes nothing. Applying the changes is a later step.
//
// It works on the target state, not on yesterday against today: what a
// campaign should target is every town open today for its role and region,
// so a town missed on an earlier day still comes up.
//
//   - Campaigns: Conversion campaigns named "RAC | Conversion | <role> |
//     <region> | ...". UK-wide and Open Day campaigns never follow the
//     priorities. In a OneRAC region the OneRAC campaign takes both roles and
//     the role campaigns there are left alone (they are idle).
//   - Towns: the location list (data/locations.json) gives each town one
//     region for both roles and its point(s). A town missing from the list is
//     reported, never guessed.
//   - Matching: a Google radius or Meta pin is a town when it sits within
//     match_km of the town's point; a Meta city matches on name.
//   - London, and towns marked wholeRegion, are covered by one target for the
//     region (user decision, 20 October 2026): only the whole region closing
//     raises anything.
//   - New towns go in at radius_km (25 km). Existing radii are left as they
//     are (user decision, 20 October 2026).
//   - A campaign whose last open town has closed is never emptied: Google
//     reads no locations as the whole UK. It asks whether to pause instead.
//   - Anything else on a campaign (a named place, a pin or city that is no
//     town on the list) is listed and left alone.
//   - Indeed cannot be changed from here, so its list is every job that
//     opened or closed between the two days, for doing by hand.
//
//   RAC.locations.townOf(rowLocation)   the town in "Job title - Town"
//   RAC.locations.preview(opts)         the preview (see below)
(function (RAC) {
  'use strict';

  const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and')
    .replace(/\b(the|england)\b/g, '').replace(/[^a-z]/g, '');

  // "Roadside Technician Nights - Leeds", "Superflex Roadside Patrol - York",
  // "Roadside Technician  Banbury" (no dash), "Night -Derby".
  function townOf(location) {
    const s = String(location || '').split(' - ');
    const t = s.length > 1 ? s.slice(1).join(' - ') : String(location || '').replace(/^.*(Technician|Mechanic|Patrol)\s+/, '');
    return t.trim().replace(/^Nights?\s*-\s*|\s*-\s*Nights?$/i, '').replace(/^Night\s*-/i, '').trim();
  }

  const km = (a, b) => {
    const r = (x) => x * Math.PI / 180, dl = r(b.lat - a.lat), dg = r(b.lng - a.lng);
    return 12742 * Math.asin(Math.sqrt(Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dg / 2) ** 2));
  };

  // Campaign name -> { roles, region, kind } or { skip: reason }.
  function parseCampaign(name, regions, oneRac) {
    const seg = String(name || '').split('|').map(x => x.trim());
    if (seg[0] !== 'RAC' || seg[1] !== 'Conversion') return { skip: 'not a conversion campaign' };
    const roleSeg = seg[2] || '', regionSeg = seg[3] || '';
    if (/^uk$/i.test(regionSeg)) return { skip: 'UK-wide, always on' };
    if (/open day/i.test(regionSeg)) return { skip: 'open day' };
    const region = regions.find(r => norm(r) === norm(regionSeg));
    if (!region) return { skip: 'region "' + regionSeg + '" not recognised' };
    const isOne = /onerac/i.test(roleSeg), smr = /smr/i.test(roleSeg), patrol = /patrol/i.test(roleSeg);
    if (!isOne && smr === patrol) return { skip: 'role not recognised' };
    if (!isOne && oneRac.includes(region)) return { skip: 'OneRAC runs in ' + region };
    if (isOne && !oneRac.includes(region)) return { skip: 'OneRAC has not started in ' + region };
    return { kind: isOne ? 'OneRAC' : (smr ? 'SMR' : 'Patrol'), roles: isOne ? RAC.ROLES.slice() : [smr ? 'SMR' : 'Patrol'], region };
  }

  const unit = (u) => (/mile/i.test(u || '') ? 'miles' : 'km');

  // Live targets per campaign, from the Windsor rows.
  //   google: [{ campaign, campaign_id, campaign_criterion_negative,
  //              campaign_criterion_proximity_radius, ..._radius_units,
  //              ..._geo_point_latitude_in_micro_degrees, ..._longitude_...,
  //              campaign_criterion_location_name }]
  //   meta:   [{ campaign, campaign_id, adset_id, adset_name, adset_targeting }]
  function liveCampaigns(live) {
    const out = new Map();
    const get = (platform, name, id) => {
      const k = platform + '|' + name;
      if (!out.has(k)) out.set(k, { platform, name, id, targets: [], other: [], adsets: [], seen: new Set() });
      return out.get(k);
    };
    ((live && live.google) || []).forEach(r => {
      const c = get('google', r.campaign, r.campaign_id);
      if (r.campaign_criterion_negative === true || r.campaign_criterion_negative === 'true') return;
      if (r.campaign_criterion_proximity_radius != null) {
        const t = { lat: r.campaign_criterion_proximity_geo_point_latitude_in_micro_degrees / 1e6,
          lng: r.campaign_criterion_proximity_geo_point_longitude_in_micro_degrees / 1e6,
          radius: Number(r.campaign_criterion_proximity_radius), unit: unit(r.campaign_criterion_proximity_radius_units) };
        const k = t.lat.toFixed(5) + ',' + t.lng.toFixed(5) + ',' + t.radius;
        if (!c.seen.has(k)) { c.seen.add(k); c.targets.push(t); }
      } else if (r.campaign_criterion_location_name && !c.seen.has(r.campaign_criterion_location_name)) {
        c.seen.add(r.campaign_criterion_location_name);
        c.other.push(r.campaign_criterion_location_name);
      }
    });
    ((live && live.meta) || []).forEach(r => {
      const c = get('meta', r.campaign, r.campaign_id);
      if (c.adsets.some(a => a.id === r.adset_id)) return;
      let t = r.adset_targeting;
      try { t = typeof t === 'string' ? JSON.parse(t) : (t || {}); } catch (e) { t = {}; }
      const g = t.geo_locations || {};
      const geo = JSON.stringify({ cities: g.cities, custom_locations: g.custom_locations, places: g.places, regions: g.regions, countries: g.countries });
      c.adsets.push({ id: r.adset_id, name: r.adset_name, geo });
      if (c.adsets.length > 1) return;   // every ad set is checked against the first below
      (g.cities || []).forEach(x => c.targets.push({ city: x.name, key: x.key, radius: Number(x.radius), unit: unit(x.distance_unit) }));
      (g.custom_locations || []).forEach(x => c.targets.push({ lat: Number(x.latitude), lng: Number(x.longitude), radius: Number(x.radius), unit: unit(x.distance_unit) }));
      (g.places || []).forEach(x => c.other.push('place: ' + (x.name || x.key)));
      (g.regions || []).forEach(x => c.other.push('region: ' + (x.name || x.key)));
      (g.countries || []).forEach(x => c.other.push('country: ' + x));
    });
    out.forEach(c => {
      delete c.seen;
      c.adsetsDiffer = c.adsets.length > 1 && c.adsets.some(a => a.geo !== c.adsets[0].geo);
    });
    return [...out.values()];
  }

  // opts:
  //   register      data/locations.json
  //   pri           the month's Location priorities ({ dates, roles })
  //   date, prevDate  today and the day to compare Indeed against
  //   oneRacRegions regions OneRAC runs in this month
  //   live          { google: [...], meta: [...] } Windsor rows
  //   regions       the twelve region names
  function preview(opts) {
    const reg = opts.register, pri = opts.pri || { roles: {} };
    const regions = opts.regions || [...new Set(reg.locations.map(l => l.region))];
    const oneRac = opts.oneRacRegions || [];
    const radius = reg.radius_km, matchKm = reg.match_km;
    const byName = new Map(reg.locations.map(l => [norm(l.name), l]));

    // Towns open today, per role, and anything not on the list.
    const open = {}, unknown = new Map();
    RAC.ROLES.forEach(role => {
      open[role] = new Map();
      (((pri.roles || {})[role] || {}).rows || []).forEach(row => {
        const n = ((row.v || {})[opts.date]) || 0;
        if (!(n > 0)) return;
        const town = townOf(row.location), loc = byName.get(norm(town));
        if (!loc) { unknown.set(role + '|' + town, { role, town, region: row.region, open: n }); return; }
        open[role].set(loc.name, { loc, open: (open[role].get(loc.name) || { open: 0 }).open + n });
      });
    });
    const wanted = (roles, region) => {
      const m = new Map();
      roles.forEach(role => open[role].forEach((v, k) => { if (v.loc.region === region) m.set(k, { loc: v.loc, open: (m.get(k) ? m.get(k).open : 0) + v.open }); }));
      return m;
    };
    const wholeRegion = (region) => region === 'London' || reg.locations.some(l => l.region === region && l.wholeRegion);

    // Which town a live target is.
    const townFor = (t) => {
      if (t.city) return byName.get(norm(t.city)) || reg.locations.find(l => l.meta && norm(l.meta) === norm(t.city)) ||
        reg.locations.find(l => (l.points || []).some(p => norm(p.name) === norm(t.city))) || null;
      let best = null, bestKm = Infinity;
      reg.locations.forEach(l => (l.points || []).forEach(p => { const d = km(t, p); if (d < bestKm) { best = l; bestKm = d; } }));
      return bestKm <= matchKm ? best : null;
    };
    const label = (t) => t.city ? `${t.city} (${t.radius} ${t.unit})` : `pin ${t.lat.toFixed(4)}, ${t.lng.toFixed(4)} (${t.radius} ${t.unit})`;

    const campaigns = [], skipped = [], covered = new Set();
    liveCampaigns(opts.live).forEach(c => {
      const p = parseCampaign(c.name, regions, oneRac);
      if (p.skip) { skipped.push({ platform: c.platform, name: c.name, reason: p.skip }); return; }
      const want = wanted(p.roles, p.region);
      p.roles.forEach(role => covered.add(c.platform + '|' + role + '|' + p.region));
      const out = { platform: c.platform, name: c.name, id: c.id, kind: p.kind, region: p.region,
        adsets: c.adsets.map(a => a.id), add: [], remove: [], keep: [], other: c.other.slice(), unmatched: [],
        openTowns: [...want.values()].map(v => v.loc.name).sort(), question: null, notes: [] };
      if (c.adsetsDiffer) out.notes.push('Its ad sets target different locations, so it is left alone until they match.');
      if (wholeRegion(p.region)) {
        out.wholeRegion = true;
        if (!want.size && c.targets.length) out.question = `This is the last open location in ${c.name}. Should I pause this campaign?`;
        campaigns.push(out);
        return;
      }
      const hit = new Set();
      c.targets.forEach(t => {
        const l = townFor(t);
        if (!l) { out.unmatched.push(label(t)); return; }
        if (want.has(l.name)) { hit.add(l.name); out.keep.push(l.name); }
        else out.remove.push({ town: l.name, target: label(t) });
      });
      want.forEach((v, name) => {
        if (hit.has(name)) return;
        if (v.loc.wholeRegion) return;
        out.add.push({ town: name, open: v.open, points: v.loc.points.map(pt => ({ ...pt, radius_km: radius })) });
      });
      // Never empty a campaign: ask about pausing it instead.
      if (!out.keep.length && !out.add.length && out.remove.length) {
        out.question = `This is the last open location in ${c.name}. Should I pause this campaign?`;
      }
      if (c.adsetsDiffer) { out.add = []; out.remove = []; }
      campaigns.push(out);
    });

    // Towns open where no live campaign of that role and region exists.
    const noCampaign = [];
    ['google', 'meta'].forEach(platform => regions.forEach(region => {
      const roles = oneRac.includes(region) ? [RAC.ROLES.slice()] : RAC.ROLES.map(r => [r]);
      roles.forEach(rs => {
        const want = wanted(rs, region);
        if (!want.size || rs.some(r => covered.has(platform + '|' + r + '|' + region))) return;
        noCampaign.push({ platform, role: rs.length > 1 ? 'OneRAC' : rs[0], region, towns: [...want.keys()].sort() });
      });
    }));

    // Indeed: jobs that opened or closed between the two days.
    const indeed = [];
    if (opts.prevDate && opts.prevDate !== opts.date) {
      RAC.ROLES.forEach(role => (((pri.roles || {})[role] || {}).rows || []).forEach(row => {
        const a = ((row.v || {})[opts.prevDate]) || 0, b = ((row.v || {})[opts.date]) || 0;
        if ((a > 0) === (b > 0)) return;
        const loc = byName.get(norm(townOf(row.location)));
        indeed.push({ role, job: row.location, region: loc ? loc.region : row.region, change: b > 0 ? 'add' : 'remove', open: b });
      }));
    }

    const changes = campaigns.filter(c => c.add.length || c.remove.length || c.question);
    return {
      date: opts.date, prevDate: opts.prevDate || null, radius_km: radius,
      campaigns, changes, skipped, noCampaign, indeed,
      unknownTowns: [...unknown.values()],
      counts: { campaigns: campaigns.length, withChanges: changes.length,
        add: RAC.util.sum(campaigns.map(c => c.add.length)), remove: RAC.util.sum(campaigns.map(c => c.remove.length)) },
    };
  }

  RAC.locations = { townOf, preview, parseCampaign, liveCampaigns };
})(window.RAC = window.RAC || {});
