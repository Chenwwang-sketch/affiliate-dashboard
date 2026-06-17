import { NextResponse } from "next/server";

// GET /api/debug - tests platform connections
export async function GET() {
  const probes: Record<string, any> = {};
  const env: Record<string, string> = {};

  // --- Awin ---
  env.AWIN_TOKEN = process.env.AWIN_TOKEN ? "(set)" : "MISSING";
  env.AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || "MISSING";
  try {
    const t = process.env.AWIN_TOKEN;
    const pid = process.env.AWIN_PUBLISHER_ID;
    if (t && pid) {
      const res = await fetch(
        `https://api.awin.com/publishers/${pid}/transactions/?startDate=2026-06-01T00:00:00&endDate=2026-06-02T00:00:00&timezone=UTC&accessToken=${t}`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      const body = await res.text();
      probes.awin = {
        ok: res.ok,
        httpStatus: res.status,
        bodyPreview: body.slice(0, 300),
      };
    } else {
      probes.awin = { ok: false, error: "missing env vars" };
    }
  } catch (e: any) {
    probes.awin = { ok: false, error: e.message };
  }

  // --- Impact ---
  env.IMPACT_ACCOUNT_SID = process.env.IMPACT_ACCOUNT_SID || "MISSING";
  env.IMPACT_AUTH_TOKEN = process.env.IMPACT_AUTH_TOKEN ? "(set)" : "MISSING";
  try {
    const sid = process.env.IMPACT_ACCOUNT_SID;
    const tok = process.env.IMPACT_AUTH_TOKEN;
    if (sid && tok) {
      const res = await fetch(
        `https://api.impact.com/Mediapartners/${sid}/Actions?Page=1&PageSize=1`,
        { headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), Accept: "application/json" } }
      );
      const body = await res.text();
      probes.impact = { ok: res.ok, httpStatus: res.status, bodyPreview: body.slice(0, 300) };
    } else {
      probes.impact = { ok: false, error: "missing env vars" };
    }
  } catch (e: any) {
    probes.impact = { ok: false, error: e.message };
  }

  // --- LeadDyno ---
  env.LEADDYNO_TOKEN = process.env.LEADDYNO_TOKEN ? "(set)" : "MISSING";
  env.LEADDYNO_PUBLIC_KEY = process.env.LEADDYNO_PUBLIC_KEY ? "(set)" : "MISSING";
  try {
    const priv = process.env.LEADDYNO_TOKEN;
    const pub = process.env.LEADDYNO_PUBLIC_KEY;
    if (priv && pub) {
      const res = await fetch(
        `https://api.leaddyno.com/v1/purchases?key=${priv}&from=2026-06-01&to=2026-06-02&per_page=1`,
        { headers: { Authorization: pub } }
      );
      const body = await res.text();
      probes.leaddyno = { ok: res.ok, httpStatus: res.status, bodyPreview: body.slice(0, 300) };
    } else {
      probes.leaddyno = { ok: false, error: "missing env vars" };
    }
  } catch (e: any) {
    probes.leaddyno = { ok: false, error: e.message };
  }

  // --- GoAffPro ---
  env.GOAFFPRO_TOKEN = process.env.GOAFFPRO_TOKEN ? "(set)" : "MISSING";
  env.GOAFFPRO_BASE_URL = process.env.GOAFFPRO_BASE_URL || "MISSING";
  try {
    const tok = process.env.GOAFFPRO_TOKEN;
    const base = process.env.GOAFFPRO_BASE_URL;
    if (tok && base) {
      const apiBase = base.replace(/\/+$/, "");
      const res = await fetch(
        `${apiBase}/api/admin/orders?from=2026-06-01&to=2026-06-02&limit=1`,
        { headers: { "X-Goaffpro-Access-Token": tok } }
      );
      const body = await res.text();
      probes.goaffpro = { ok: res.ok, httpStatus: res.status, bodyPreview: body.slice(0, 300) };
    } else {
      probes.goaffpro = { ok: false, error: "missing env vars" };
    }
  } catch (e: any) {
    probes.goaffpro = { ok: false, error: e.message };
  }

  return NextResponse.json({ env, probes });
}
