import { NextResponse } from "next/server";

// GET /api/debug - 测试各平台连接状态
export async function GET() {
  const results: Record<string, any> = {};

  // Awin
  try {
    const awinToken = process.env.AWIN_TOKEN;
    const awinPubId = process.env.AWIN_PUBLISHER_ID;
    if (!awinToken) {
      results.AWIN = { status: "NO_KEY", error: "AWIN_TOKEN 未配置" };
    } else if (!awinPubId) {
      results.AWIN = { status: "NO_KEY", error: "AWIN_PUBLISHER_ID 未配置" };
    } else {
      const res = await fetch(
        `https://api.awin.com/publishers/${awinPubId}/transactions/?startDate=2024-01-01T00:00:00&endDate=2024-01-02T00:00:00&timezone=UTC`,
        {
          headers: {
            Authorization: `Bearer ${awinToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      const text = await res.text();
      results.AWIN = {
        status: res.ok ? "OK" : "ERROR",
        httpStatus: res.status,
        bodyPreview: text.slice(0, 300),
        env: { hasToken: !!awinToken, hasPubId: !!awinPubId },
      };
    }
  } catch (e: any) {
    results.AWIN = { status: "EXCEPTION", error: e.message };
  }

  // Impact
  try {
    const sid = process.env.IMPACT_ACCOUNT_SID;
    const token = process.env.IMPACT_AUTH_TOKEN;
    if (!sid || !token) {
      results.IMPACT = { status: "NO_KEY", error: "IMPACT_ACCOUNT_SID 或 IMPACT_AUTH_TOKEN 未配置" };
    } else {
      const res = await fetch(
        `https://api.impact.com/Advertisers/${sid}/Actions?Page=1&PageSize=1`,
        {
          headers: {
            Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
            Accept: "application/json",
          },
        }
      );
      const text = await res.text();
      results.IMPACT = {
        status: res.ok ? "OK" : "ERROR",
        httpStatus: res.status,
        bodyPreview: text.slice(0, 300),
        env: { hasSid: !!sid, hasToken: !!token },
      };
    }
  } catch (e: any) {
    results.IMPACT = { status: "EXCEPTION", error: e.message };
  }

  // LeadDyno
  try {
    const token = process.env.LEADDYNO_TOKEN;
    if (!token) {
      results.LEADDYNO = { status: "NO_KEY", error: "LEADDYNO_TOKEN 未配置" };
    } else {
      const res = await fetch("https://api.leaddyno.com/v1/purchases?page=1&per_page=1", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const text = await res.text();
      results.LEADDYNO = {
        status: res.ok ? "OK" : "ERROR",
        httpStatus: res.status,
        bodyPreview: text.slice(0, 300),
        env: { hasToken: !!token },
      };
    }
  } catch (e: any) {
    results.LEADDYNO = { status: "EXCEPTION", error: e.message };
  }

  // GoAffPro
  try {
    const token = process.env.GOAFFPRO_TOKEN;
    if (!token) {
      results.GOAFFPRO = { status: "NO_KEY", error: "GOAFFPRO_TOKEN 未配置" };
    } else {
      const baseUrl = process.env.GOAFFPRO_BASE_URL || "https://api.goaffpro.com";
      const res = await fetch(`${baseUrl}/v1/orders?page=1&limit=1`, {
        headers: {
          "X-Api-Key": token,
          "Content-Type": "application/json",
        },
      });
      const text = await res.text();
      results.GOAFFPRO = {
        status: res.ok ? "OK" : "ERROR",
        httpStatus: res.status,
        bodyPreview: text.slice(0, 300),
        env: { hasToken: !!token, baseUrl },
      };
    }
  } catch (e: any) {
    results.GOAFFPRO = { status: "EXCEPTION", error: e.message };
  }

  // 环境变量检查
  results.ENV_CHECK = {
    AWIN_TOKEN: process.env.AWIN_TOKEN ? "已设置 (" + process.env.AWIN_TOKEN.slice(0, 4) + "...)" : "未设置",
    AWIN_PUBLISHER_ID: process.env.AWIN_PUBLISHER_ID || "未设置",
    IMPACT_ACCOUNT_SID: process.env.IMPACT_ACCOUNT_SID || "未设置",
    IMPACT_AUTH_TOKEN: process.env.IMPACT_AUTH_TOKEN ? "已设置" : "未设置",
    LEADDYNO_TOKEN: process.env.LEADDYNO_TOKEN ? "已设置" : "未设置",
    LEADDYNO_PUBLIC_KEY: process.env.LEADDYNO_PUBLIC_KEY || "未设置",
    GOAFFPRO_TOKEN: process.env.GOAFFPRO_TOKEN ? "已设置" : "未设置",
    GOAFFPRO_BASE_URL: process.env.GOAFFPRO_BASE_URL || "未设置",
    DATABASE_URL: process.env.DATABASE_URL ? "已设置" : "未设置",
  };

  return NextResponse.json(results);
}
