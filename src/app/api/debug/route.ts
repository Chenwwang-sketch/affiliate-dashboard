import { NextResponse } from "next/server";

async function tryFetch(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  const isHtml = text.trim().startsWith("<") || text.trim().startsWith("<!DOCTYPE");
  let json: any = null;
  if (!isHtml) { try { json = JSON.parse(text); } catch {} }
  return { ok: res.ok && !isHtml, httpStatus: res.status, isHtml, bodyPreview: text.slice(0, 800), json };
}

export async function GET() {
  const probes: Record<string, any> = {};
  const env: Record<string, string> = {};

  // --- Awin ---
  env.AWIN_TOKEN = process.env.AWIN_TOKEN ? "(set)" : "MISSING";
  env.AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || "MISSING";
  try {
    const t = process.env.AWIN_TOKEN; const pid = process.env.AWIN_PUBLISHER_ID;
    if (t && pid) {
      const r = await tryFetch(`https://api.awin.com/publishers/${pid}/transactions/?startDate=2026-06-01T00:00:00&endDate=2026-06-02T00:00:00&timezone=UTC&accessToken=${t}`, {});
      probes.awin = { ok: r.ok, httpStatus: r.httpStatus, isHtml: r.isHtml, bodyPreview: r.bodyPreview };
    } else { probes.awin = { ok: false, error: "missing env" }; }
  } catch (e: any) { probes.awin = { ok: false, error: e.message }; }

  // --- Impact ---
  env.IMPACT_ACCOUNT_SID = process.env.IMPACT_ACCOUNT_SID || "MISSING";
  env.IMPACT_AUTH_TOKEN = process.env.IMPACT_AUTH_TOKEN ? "(set)" : "MISSING";
  try {
    const sid = process.env.IMPACT_ACCOUNT_SID;
    const tokens = [process.env.IMPACT_AUTH_TOKEN, process.env.IMPACT_TOKEN].filter(Boolean) as string[];
    if (sid && tokens.length > 0) {
      let best: any = null;
      for (const tok of tokens) {
        const r = await tryFetch(`https://api.impact.com/Mediapartners/${sid}/Actions?Page=1&PageSize=1`, { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), Accept: "application/json" });
        best = { ...r, tokenUsed: tok === tokens[0] ? "IMPACT_AUTH_TOKEN" : "IMPACT_TOKEN" };
        if (r.ok) break;
      }
      probes.impact = { ok: best?.ok || false, httpStatus: best?.httpStatus, isHtml: best?.isHtml, tokenUsed: best?.tokenUsed, bodyPreview: best?.bodyPreview };
    } else { probes.impact = { ok: false, error: "missing env" }; }
  } catch (e: any) { probes.impact = { ok: false, error: e.message }; }

  // --- LeadDyno: 自动探测鉴权 ---
  env.LEADDYNO_TOKEN = process.env.LEADDYNO_TOKEN ? "(set)" : "MISSING";
  env.LEADDYNO_PUBLIC_KEY = process.env.LEADDYNO_PUBLIC_KEY ? "(set)" : "MISSING";
  try {
    const t = process.env.LEADDYNO_TOKEN; const pub = process.env.LEADDYNO_PUBLIC_KEY;
    if (!t) { probes.leaddyno = { ok: false, error: "LEADDYNO_TOKEN missing" }; }
    else {
      const strategies = [
        { name: "Bearer", headers: { Authorization: `Bearer ${t}` }, url: `https://api.leaddyno.com/v1/purchases?per_page=1` },
        ...(pub ? [{ name: "Key+PublicKey", headers: { Authorization: pub }, url: `https://api.leaddyno.com/v1/purchases?key=${t}&per_page=1` }] : []),
      ];
      let best: any = null;
      for (const s of strategies) {
        const r = await tryFetch(s.url, s.headers);
        best = { ...r, strategy: s.name };
        if (r.ok) break;
      }
      probes.leaddyno = { ok: best?.ok || false, httpStatus: best?.httpStatus, isHtml: best?.isHtml, strategy: best?.strategy, bodyPreview: best?.bodyPreview };
    }
  } catch (e: any) { probes.leaddyno = { ok: false, error: e.message }; }

  // --- GoAffPro ---
  env.GOAFFPRO_TOKEN = process.env.GOAFFPRO_TOKEN ? "(set)" : "MISSING";
  env.GOAFFPRO_BASE_URL = process.env.GOAFFPRO_BASE_URL || "MISSING";
  try {
    const tok = process.env.GOAFFPRO_TOKEN; const base = process.env.GOAFFPRO_BASE_URL;
    if (tok && base && base !== "MISSING") {
      const apiBase = base.replace(/\/+$/, "");
      // 尝试多种 API 端点组合
      const urls = [
        `${apiBase}/admin/orders?from=2026-06-01&to=2026-06-02&limit=1`,
        `https://api.goaffpro.com/admin/orders?from=2026-06-01&to=2026-06-02&limit=1`,
        `${apiBase}/orders?from=2026-06-01&to=2026-06-02&limit=1`,
        `https://api.goaffpro.com/orders?from=2026-06-01&to=2026-06-02&limit=1`,
        `https://api.goaffpro.com/v1/orders?from=2026-06-01&to=2026-06-02&limit=1`,
        `${apiBase}/api/admin/orders?from=2026-06-01&to=2026-06-02&limit=1`,
      ];
      let best: any = null;
      for (const u of urls) {
        const r = await tryFetch(u, { "X-Goaffpro-Access-Token": tok });
        best = { ...r, url: u };
        if (r.ok && !r.isHtml) break;
      }
      probes.goaffpro = { ok: best?.ok || false, httpStatus: best?.httpStatus, isHtml: best?.isHtml, testedUrl: best?.url, bodyPreview: best?.bodyPreview };
    } else { probes.goaffpro = { ok: false, error: "missing env" }; }
  } catch (e: any) { probes.goaffpro = { ok: false, error: e.message }; }

  return NextResponse.json({ env, probes });
}
