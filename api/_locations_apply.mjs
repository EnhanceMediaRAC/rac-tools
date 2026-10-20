// What Update Google and Meta sends, worked out from what the campaign
// targets right now. Used by api/windsor-spend.mjs (?apply=1) and checked by
// tests/checks/99_locations.mjs. No network here: the caller reads, this
// decides, the caller sends. (A leading underscore keeps Vercel from serving
// this file as an endpoint.)
//
// Safety rules, all enforced here:
//   - Only RAC conversion campaigns for a role and region, never UK-wide or
//     open day ones, and only in RAC's two accounts.
//   - At most MAX_CAMPAIGNS campaigns and MAX_TOWNS towns per campaign a run.
//   - Every town to remove must still be there; if the campaign changed since
//     the preview, nothing is sent for it.
//   - A campaign is never left with no locations (Google reads that as the
//     whole UK). Closing its last town is a pause, which the user confirms.
//   - Google: a campaign with named locations or exclusions is left for a
//     person, because the whole location set is replaced on each change.
//     Pins kept keep their radius and bid adjustment.
//   - Meta: only geo_locations changes; the rest of each ad set's targeting
//     is sent back exactly as read. New towns are 25 km pins.

export const ACCOUNTS = { google: '904-497-1739', meta: '652299511175883' };
export const MAX_CAMPAIGNS = 12;
export const MAX_TOWNS = 10;
const CONVERSION = 'RAC | Conversion |';
const SAME = 1e-4;   // degrees, about 10 m

export function campaignAllowed(name) {
  const seg = String(name || '').split('|').map(s => s.trim());
  if (!String(name || '').startsWith(CONVERSION)) return 'not an RAC conversion campaign';
  if (/^uk$/i.test(seg[3] || '')) return 'UK-wide campaigns are never changed';
  if (/open day/i.test(seg[3] || '')) return 'open day campaigns are never changed';
  return null;
}

// Checks a request before anything is read. Returns a reason, or null.
export function checkRequest(changes) {
  if (!Array.isArray(changes) || !changes.length) return 'Nothing to change.';
  if (changes.length > MAX_CAMPAIGNS) return `At most ${MAX_CAMPAIGNS} campaigns at a time; this asks for ${changes.length}.`;
  for (const c of changes) {
    if (!['google', 'meta'].includes(c.platform)) return 'Unknown platform ' + c.platform;
    const bad = campaignAllowed(c.campaignName);
    if (bad) return c.campaignName + ': ' + bad;
    if (((c.add || []).length + (c.remove || []).length) > MAX_TOWNS) return `${c.campaignName}: at most ${MAX_TOWNS} towns at a time.`;
    if ((c.add || []).some(a => !(Number.isFinite(a.lat) && Number.isFinite(a.lng) && a.lat > 49.8 && a.lat < 60.9 && a.lng > -8.2 && a.lng < 1.8))) return c.campaignName + ': a town to add has no UK point.';
  }
  return null;
}

const near = (a, b) => Math.abs(a.lat - b.lat) < SAME && Math.abs(a.lng - b.lng) < SAME;

// Google. rows: this campaign's criteria rows from Windsor (criteria_type,
// campaign_criterion_negative, ..._location_geo_target_constant,
// ..._bid_modifier, proximity fields). Returns { params } or { skip }.
export function googlePlan(rows, change, radiusKm = 25) {
  if (rows.some(r => r.criteria_type === 'LOCATION')) return { skip: 'it has named locations or exclusions, so it is left for a person' };
  const current = [];
  rows.filter(r => r.criteria_type === 'PROXIMITY' && r.campaign_criterion_proximity_radius != null).forEach(r => {
    const p = { latitude: r.campaign_criterion_proximity_geo_point_latitude_in_micro_degrees / 1e6,
      longitude: r.campaign_criterion_proximity_geo_point_longitude_in_micro_degrees / 1e6,
      radius: Number(r.campaign_criterion_proximity_radius),
      radius_units: /MILE/i.test(r.campaign_criterion_proximity_radius_units || '') ? 'MILES' : 'KILOMETERS' };
    const bm = Number(r.campaign_criterion_bid_modifier);
    if (Number.isFinite(bm) && bm > 0 && bm !== 1) p.bid_modifier = bm;
    if (!current.some(q => near({ lat: q.latitude, lng: q.longitude }, { lat: p.latitude, lng: p.longitude }) && q.radius === p.radius)) current.push(p);
  });
  if (change.pause) return { action: 'pause_campaign', params: { campaign_id: String(change.campaignId) } };
  const keep = current.slice();
  for (const r of change.remove || []) {
    const i = keep.findIndex(q => near({ lat: q.latitude, lng: q.longitude }, r) && (r.radius == null || q.radius === r.radius));
    if (i < 0) return { skip: `${r.town} is no longer on the campaign; check again before updating` };
    keep.splice(i, 1);
  }
  const add = (change.add || []).map(a => ({ latitude: a.lat, longitude: a.lng, radius: radiusKm, radius_units: 'KILOMETERS' }));
  const proximities = [...keep, ...add];
  if (!proximities.length) return { skip: 'that would leave it with no locations; pause it instead' };
  return { action: 'set_campaign_geo_targeting', params: { campaign_id: String(change.campaignId), locations: [], proximities } };
}

// Meta. targeting: one ad set's full targeting as read. Returns
// { targeting } (the whole object to send back) or { skip }. Closing the
// last town is a pause, as on Google.
export function metaPlan(targeting, change, radiusKm = 25) {
  if (change.pause) return { action: 'pause_campaign', params: { campaign_id: String(change.campaignId) } };
  const t = JSON.parse(JSON.stringify(targeting || {}));
  const g = t.geo_locations = t.geo_locations || {};
  const cities = (g.cities || []).slice(), pins = (g.custom_locations || []).slice();
  for (const r of change.remove || []) {
    if (r.key || r.city) {
      const i = cities.findIndex(c => (r.key && String(c.key) === String(r.key)) || (!r.key && c.name === r.city));
      if (i < 0) return { skip: `${r.town} is no longer on the ad set; check again before updating` };
      cities.splice(i, 1);
    } else {
      const i = pins.findIndex(p => near({ lat: Number(p.latitude), lng: Number(p.longitude) }, r));
      if (i < 0) return { skip: `${r.town} is no longer on the ad set; check again before updating` };
      pins.splice(i, 1);
    }
  }
  (change.add || []).forEach(a => pins.push({ latitude: a.lat, longitude: a.lng, radius: radiusKm, distance_unit: 'kilometer' }));
  if (cities.length) g.cities = cities; else delete g.cities;
  if (pins.length) g.custom_locations = pins; else delete g.custom_locations;
  const left = (g.cities || []).length + (g.custom_locations || []).length + (g.places || []).length + (g.regions || []).length + (g.countries || []).length;
  if (!left) return { skip: 'that would leave it with no locations; pause it instead' };
  return { action: 'update_adset', targeting: t };
}
