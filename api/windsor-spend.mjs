// Windsor spend for the RAC planning tools. Runs on Vercel, never in the
// browser, because it needs the secret Windsor key.
//
// Same shape as EM-Budget-Monitor's refresh-spend.mjs: same auth rule, same
// Windsor call. The difference is what happens to the rows. Budget Monitor
// matches Windsor campaigns to rows a user linked by hand. Here the campaign
// name already carries role, location and platform:
//
//   RAC | Conversion | SMR Mechanics | South East | GS | February 26 | 2936
//
// so there is nothing to link and nothing to match. This just hands the rows
// back and the tool parses them exactly as it parses a pasted export.
//
// GET /api/windsor-spend?from=2026-07-01&to=2026-07-25
// Returns one row per campaign per day: { date, campaign, spend, apps }
//
// Env vars (Vercel, never the frontend):
//   WINDSOR_API_KEY            - from onboard.windsor.ai
//   SUPABASE_URL               - RAC Tools project URL (public)
//   SUPABASE_SERVICE_ROLE_KEY  - RAC Tools service role key (secret)
//   CRON_SECRET                - optional, for a scheduled pull

import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS, checkRequest, googlePlan, metaPlan } from "./_locations_apply.mjs";

const WINDSOR_BASE = "https://connectors.windsor.ai";
const ENHANCE_DOMAIN = "@enhancemedia.co.uk";

// RAC's accounts. Only these two: Indeed and Appcast are not Windsor
// connectors and keep coming in by paste.
// The two connectors RAC runs. Indeed and Appcast are not Windsor sources
// and keep coming in by paste.
//
// They are asked for different things, matching how the Excel pacing doc
// pulls them, which is the setup that has been trusted to date:
//   Google - conversions come out per conversion action, so applications are
//            the rows named exactly "Application Submitted".
//   Meta   - has a dedicated applications field, so spend and applications
//            come back on the same row.
const CONNECTORS = [
  { id: "google_ads", apps: "conversion_action" },
  { id: "facebook", apps: "actions_application_submitted" },
];

const APP_ACTION = "application submitted";

async function windsor(connector, apiKey, from, to, fields) {
  const url = `${WINDSOR_BASE}/${connector}?api_key=${encodeURIComponent(apiKey)}` +
    `&date_from=${from}&date_to=${to}` +
    `&fields=${fields.join(",")}&_renderer=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Windsor ${connector} returned ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : (j.data || []);
}

async function pull(c, apiKey, from, to) {
  const out = new Map();
  const add = (date, campaign, spend, apps) => {
    if (!campaign) return;
    const k = date + "|" + campaign;
    const e = out.get(k) || { date, campaign, spend: 0, apps: 0 };
    e.spend += spend; e.apps += apps;
    out.set(k, e);
  };

  if (c.apps === "actions_application_submitted") {
    // One call: Meta reports both on the same row.
    const rows = await windsor(c.id, apiKey, from, to, ["date", "campaign", "spend", c.apps]);
    for (const x of rows) add(x.date, x.campaign, Number(x.spend) || 0, Number(x[c.apps]) || 0);
    return { rows: [...out.values()], appsError: null };
  }

  // Google: spend first, then applications separately. Asking for both at
  // once repeats the spend against every conversion action on that campaign.
  const spendRows = await windsor(c.id, apiKey, from, to, ["date", "campaign", "spend"]);
  for (const x of spendRows) add(x.date, x.campaign, Number(x.spend) || 0, 0);
  try {
    const convRows = await windsor(c.id, apiKey, from, to,
      ["date", "campaign", "conversion_action_name", "all_conversions"]);
    for (const x of convRows) {
      // Exactly "Application Submitted". The role-specific actions sit
      // alongside it and are not added in, matching the Excel doc.
      if (String(x.conversion_action_name || "").trim().toLowerCase() !== APP_ACTION) continue;
      add(x.date, x.campaign, 0, Number(x.all_conversions) || 0);
    }
  } catch (e) {
    // Spend is the important half. Hand back what we have and say so.
    return { rows: [...out.values()], appsError: String(e.message || e) };
  }
  return { rows: [...out.values()], appsError: null };
}

// Location targeting, last 7 days so every live campaign has a row. Only
// enabled RAC conversion campaigns are handed back; Google's criteria rows
// carry every kind of criterion, and the preview keeps the locations.
const RAC_CONVERSION = "RAC | Conversion |";
const TARGETING = {
  google_ads: { live: (x) => x.campaign_status === "ENABLED", fields: ["campaign", "campaign_id", "campaign_status",
    "campaign_criterion_negative", "campaign_criterion_location_name",
    "campaign_criterion_proximity_radius", "campaign_criterion_proximity_radius_units",
    "campaign_criterion_proximity_geo_point_latitude_in_micro_degrees",
    "campaign_criterion_proximity_geo_point_longitude_in_micro_degrees"] },
  facebook: { live: (x) => x.adset_effective_status === "ACTIVE", fields: ["campaign", "campaign_id",
    "adset_id", "adset_name", "adset_effective_status", "adset_targeting"] },
};

async function targeting(apiKey) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const out = { from, to, google: [], meta: [], errors: [] };
  for (const [id, t] of Object.entries(TARGETING)) {
    try {
      const rows = (await windsor(id, apiKey, from, to, t.fields))
        .filter(x => String(x.campaign || "").startsWith(RAC_CONVERSION) && t.live(x));
      out[id === "facebook" ? "meta" : "google"] = rows;
    } catch (e) { out.errors.push({ connector: id, error: String(e.message || e) }); }
  }
  return out;
}

// Windsor makes changes only through its MCP server, which takes the same API
// key. Three calls: start a session, say it has started, call the tool.
async function windsorTool(apiKey, name, args) {
  const url = "https://mcp.windsor.ai/";
  const headers = { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const send = async (body, session) => {
    const r = await fetch(url, { method: "POST", headers: session ? { ...headers, "Mcp-Session-Id": session } : headers, body: JSON.stringify(body) });
    if (!r.ok && r.status !== 202) throw new Error(`Windsor MCP returned ${r.status}`);
    const text = await r.text();
    // Either plain JSON or a stream of "data:" lines; the answer is the last one.
    const data = text.trim().startsWith("{") ? text : (text.split("\n").filter(l => l.startsWith("data:")).pop() || "").slice(5);
    return { session: r.headers.get("mcp-session-id") || session, msg: data ? JSON.parse(data) : null };
  };
  const init = await send({ jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "rac-tools", version: "1" } } });
  await send({ jsonrpc: "2.0", method: "notifications/initialized" }, init.session);
  const { msg } = await send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }, init.session);
  if (!msg || msg.error) throw new Error((msg && msg.error && msg.error.message) || "No answer from Windsor");
  const text = ((msg.result && msg.result.content) || []).map(c => c.text || "").join(" ");
  if (msg.result && msg.result.isError) throw new Error(text || "Windsor refused the change");
  return text;
}

// POST /api/windsor-spend?apply=1 { changes, test }
// Each change: { platform, campaignId, campaignName, adsetIds, add, remove, pause }.
// Reads each campaign fresh, works out exactly what to send
// (api/_locations_apply.mjs) and sends it. Only the production deployment
// changes anything: anywhere else, or with test set, it stops before
// sending and shows what it would have sent.
async function apply(apiKey, body, admin, email) {
  const changes = (body && body.changes) || [];
  const bad = checkRequest(changes);
  if (bad) return { status: 400, json: { error: bad } };
  const live = process.env.VERCEL_ENV === "production" && !body.test;
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const googleRows = changes.some(c => c.platform === "google")
    ? await windsor("google_ads", apiKey, from, to, ["campaign", "campaign_id", "campaign_status", "criteria_type",
      "campaign_criterion_negative", "campaign_criterion_location_geo_target_constant", "campaign_criterion_bid_modifier",
      "campaign_criterion_proximity_radius", "campaign_criterion_proximity_radius_units",
      "campaign_criterion_proximity_geo_point_latitude_in_micro_degrees", "campaign_criterion_proximity_geo_point_longitude_in_micro_degrees"]) : [];
  const metaRows = changes.some(c => c.platform === "meta")
    ? await windsor("facebook", apiKey, from, to, ["campaign", "campaign_id", "adset_id", "adset_effective_status", "adset_targeting"]) : [];

  const results = [];
  for (const c of changes) {
    const out = { platform: c.platform, campaignName: c.campaignName, sent: [], skip: null };
    try {
      if (c.platform === "google") {
        const rows = googleRows.filter(r => String(r.campaign_id) === String(c.campaignId));
        if (!rows.length || rows[0].campaign !== c.campaignName) { out.skip = "campaign not found as named; check again"; results.push(out); continue; }
        const p = googlePlan(rows, c);
        if (p.skip) out.skip = p.skip;
        else out.sent.push({ connector: "google_ads", action: p.action, account: ACCOUNTS.google, params: p.params });
      } else if (c.pause) {
        const p = metaPlan(null, c);
        out.sent.push({ connector: "facebook", action: p.action, account: ACCOUNTS.meta, params: p.params });
      } else {
        for (const id of c.adsetIds || []) {
          const row = metaRows.find(r => String(r.adset_id) === String(id) && r.campaign === c.campaignName && r.adset_effective_status === "ACTIVE");
          if (!row) { out.skip = `ad set ${id} not found as live; check again`; break; }
          const targeting = typeof row.adset_targeting === "string" ? JSON.parse(row.adset_targeting) : row.adset_targeting;
          const p = metaPlan(targeting, c);
          if (p.skip) { out.skip = p.skip; break; }
          out.sent.push({ connector: "facebook", action: p.action, account: ACCOUNTS.meta, params: { adset_id: String(id), targeting: p.targeting } });
        }
        if (out.skip) out.sent = [];   // all of a campaign's ad sets, or none
      }
      if (live) for (const s of out.sent) s.answer = await windsorTool(apiKey, "execute_action", s);
    } catch (e) { out.error = String(e.message || e); }
    results.push(out);
  }

  let connection = null;
  if (!live) {
    // Prove the change route works without changing anything.
    try { await windsorTool(apiKey, "list_actions", { connector: "google_ads" }); connection = "ok"; }
    catch (e) { connection = String(e.message || e); }
  } else if (admin) {
    const at = new Date().toISOString();
    await admin.from("rac_state").insert({ k: "locations-log:" + at, v: { at, by: email, results }, updated_at: at });
  }
  return { status: 200, json: { applied: live, connection, results } };
}

export default async function handler(req, res) {
  try {
    // GET /api/windsor-spend?version=1 returns the deployed commit, for the
    // version stamp on PDFs and workings. It needs Vercel's system environment
    // variables exposed; without them the commit reads null. Nothing secret is
    // returned, so it needs no sign-in.
    if ((req.query || {}).version) {
      return res.status(200).json({
        commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
        branch: process.env.VERCEL_GIT_COMMIT_REF || null,
        environment: process.env.VERCEL_ENV || null,
      });
    }

    const { WINDSOR_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!WINDSOR_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server is missing WINDSOR_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." });
    }

    // Same rule as Budget Monitor: the cron secret, or a signed-in Enhance
    // Media address, or an address on the allow list.
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const isCron = !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;
    let admin = null, email = "";
    if (!isCron) {
      if (!token) return res.status(401).json({ error: "Not signed in." });
      // The token is issued by one Supabase project and checked against
      // whichever project this function is pointed at. If those differ, every
      // sign-in looks invalid, so say so rather than just refusing.
      let tokenProject = null;
      try {
        const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
        tokenProject = claims.iss || null;
      } catch (e) { /* not a readable token */ }
      const serverProject = SUPABASE_URL.replace(/\/+$/, "");
      if (tokenProject && !tokenProject.startsWith(serverProject)) {
        return res.status(401).json({
          error: "This function is pointed at a different Supabase project than the one you signed in to.",
          signedInTo: tokenProject.replace(/\/auth\/v1$/, ""),
          serverConfiguredFor: serverProject,
          fix: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel to the project you sign in to, then redeploy.",
        });
      }
      admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      email = userData?.user?.email || "";
      if (userErr || !email) {
        return res.status(401).json({
          error: "Sign-in could not be verified.",
          reason: userErr ? String(userErr.message || userErr) : "No email on the account",
          serverConfiguredFor: serverProject,
          hint: "If the reason mentions an invalid or expired token, sign out and back in. If it mentions the API key, the service role key in Vercel is from a different project.",
        });
      }
      let allowed = email.toLowerCase().endsWith(ENHANCE_DOMAIN);
      if (!allowed) {
        const { data: allow } = await admin.from("allowed_emails").select("email").eq("email", email.toLowerCase()).maybeSingle();
        allowed = !!allow;
      }
      if (!allowed) return res.status(403).json({ error: "This account isn't allowed." });
    }

    const q = req.query || {};
    // GET /api/windsor-spend?targeting=1: the locations every live RAC
    // conversion campaign targets on Google and Meta, for the Update
    // locations preview (planner/locations.js). Reads only.
    if (q.targeting) return res.status(200).json(await targeting(WINDSOR_API_KEY));
    // POST /api/windsor-spend?apply=1: Update Google and Meta (see apply).
    // A signed-in person only, never the scheduled pull.
    if (q.apply) {
      if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
      if (isCron || !email) return res.status(403).json({ error: "Changes need a signed-in person." });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const r = await apply(WINDSOR_API_KEY, body, admin, email);
      return res.status(r.status).json(r.json);
    }
    const from = (q.from || "").trim();
    const to = (q.to || "").trim();
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "Give from and to as yyyy-mm-dd." });

    const rows = [];
    const errors = [];
    for (const c of CONNECTORS) {
      try {
        const got = await pull(c, WINDSOR_API_KEY, from, to);
        rows.push(...got.rows);
        if (got.appsError) errors.push({ connector: c.id, error: "Spend came through, applications did not: " + got.appsError });
      } catch (e) { errors.push({ connector: c.id, error: String(e.message || e) }); }
    }
    if (!rows.length && errors.length) return res.status(502).json({ error: errors[0].error, errors });

    // ponytail: rows straight back, no shaping. The tool already knows how to
    // read this exact shape because it is what a Windsor export looks like.
    return res.status(200).json({
      from, to, rows,
      spend: Math.round(rows.reduce((s, r) => s + r.spend, 0) * 100) / 100,
      apps: Math.round(rows.reduce((s, r) => s + r.apps, 0) * 10) / 10,
      errors,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
