import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

// LeadDyno API 实际返回的数据结构
interface LdTransaction {
  id: number;
  purchase_code: string;
  purchase_amount: string; // 字符串数字，如 "48.18"
  commission_amount?: number | null;
  commission_amount_override?: number | null;
  currency: string;
  cancelled: boolean;
  created_at: string;
  updated_at: string;
  note?: string | null;
  referral_source?: string | null;
  lead?: {
    id: number;
    email?: string;
    first_name?: string;
    last_name?: string;
  } | null;
}

function mapStatus(cancelled: boolean): "PENDING" | "APPROVED" | "DECLINED" {
  return cancelled ? "DECLINED" : "APPROVED";
}

async function tryFetch(url: string, headers: Record<string, string>): Promise<{ ok: boolean; data: any; error?: string }> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) return { ok: false, data: null, error: `HTTP ${res.status}: ${text.slice(0,200)}` };
  // 检查是否是 HTML（说明端点不对）
  if (text.trim().startsWith("<") || text.trim().startsWith("<!DOCTYPE")) {
    return { ok: false, data: null, error: `Got HTML instead of JSON: ${text.slice(0,200)}` };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, data: null, error: `Parse error: ${text.slice(0,200)}` };
  }
}

/**
 * 获取 LeadDyno 凭证：优先从环境变量读取，fallback 到数据库 PlatformConfig 表
 */
async function getLeadDynoCredentials(): Promise<{ token: string; pubKey: string | null }> {
  let token = process.env.LEADDYNO_TOKEN;
  let pubKey = process.env.LEADDYNO_PUBLIC_KEY || null;

  // 如果环境变量没有设置，从数据库读取（用户在 Settings 页面填写的）
  if (!token) {
    const dbConfig = await prisma.platformConfig.findUnique({
      where: { platform: "LEADDYNO" },
    });
    if (dbConfig?.apiKey) {
      token = dbConfig.apiKey;
      pubKey = dbConfig.accountId || null;
    }
  }

  return { token: token || "", pubKey };
}

export async function fetchLeadDynoTransactions(): Promise<{ orders: LdTransaction[]; error?: string }> {
  const { token, pubKey } = await getLeadDynoCredentials();
  if (!token) return { orders: [], error: "LEADDYNO_TOKEN not set (请在设置页面填入 API Token 或设置环境变量)" };

  const year = new Date().getFullYear();
  const all: LdTransaction[] = [];

  // 尝试三种鉴权方式
  const strategies = [
    { name: "Bearer", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
    ...(pubKey ? [{ name: "PublicKey+Key", headers: { Authorization: pubKey, "Content-Type": "application/json" }, useKeyParam: true }] : []),
  ];

  let workingStrategy: typeof strategies[0] | null = null;

  // 先探测哪种鉴权可用
  for (const s of strategies) {
    const testUrl = s.useKeyParam
      ? `https://api.leaddyno.com/v1/purchases?key=${token}&per_page=1`
      : "https://api.leaddyno.com/v1/purchases?per_page=1";
    const result = await tryFetch(testUrl, s.headers);
    if (result.ok) { workingStrategy = s; break; }
  }

  if (!workingStrategy) return { orders: [], error: "LeadDyno: all auth strategies failed" };

  // 拉取全量
  for (let y = 2020; y <= year; y++) {
    const url = workingStrategy.useKeyParam
      ? `https://api.leaddyno.com/v1/purchases?key=${token}&from=${y}-01-01&to=${y}-12-31&per_page=200`
      : `https://api.leaddyno.com/v1/purchases?from=${y}-01-01&to=${y}-12-31&per_page=200`;
    const result = await tryFetch(url, workingStrategy.headers);
    if (!result.ok) return { orders: [], error: `LeadDyno fetch error: ${result.error}` };
    const items = result.data?.purchases || result.data?.transactions || (Array.isArray(result.data) ? result.data : []);
    all.push(...items);
  }

  return { orders: all };
}

export async function syncLeadDynoOrders(): Promise<{ found: number; newCount: number; updatedCount: number; error?: string }> {
  const { orders, error } = await fetchLeadDynoTransactions();
  if (error) return { found: 0, newCount: 0, updatedCount: 0, error };

  let newCount = 0, updatedCount = 0;
  for (const tx of orders) {
    const status = mapStatus(tx.cancelled);
    const platformOrderId = tx.purchase_code || String(tx.id);

    // 佣金：优先用 commission_amount，其次 commission_amount_override，都没有则用 purchase_amount
    const rawCommission = tx.commission_amount ?? tx.commission_amount_override ?? parseFloat(tx.purchase_amount || "0");
    const saleAmount = parseFloat(tx.purchase_amount || "0");

    const usd = await convertToUsd(rawCommission, tx.currency || "USD");
    const rmb = await convertToRmb(usd);
    const needsReview = status === "DECLINED";

    // 从 lead 对象中提取客户信息
    const customerName = tx.lead
      ? [tx.lead.first_name, tx.lead.last_name].filter(Boolean).join(" ") || null
      : null;
    const customerEmail = tx.lead?.email || null;

    const d = {
      platform: "LEADDYNO" as const,
      platformOrderId,
      status, 
      commissionAmount: rawCommission,
      commissionCurrency: tx.currency || "USD",
      commissionUsd: usd, 
      commissionRmb: rmb,
      saleAmount: saleAmount || null,
      saleCurrency: tx.currency || "USD",
      orderDate: new Date(tx.created_at),
      customerName,
      customerEmail,
      productName: null,
      declineReason: tx.cancelled ? "订单已取消" : null,
      needsManualReview: needsReview,
      manualReviewReason: needsReview ? `LeadDyno订单 ${platformOrderId} 被取消，请检查` : null,
      rawData: tx as any,
    };

    const existing = await prisma.order.findFirst({
      where: { platform: "LEADDYNO", platformOrderId },
    });
    if (existing) { await prisma.order.update({ where: { id: existing.id }, data: { ...d, id: existing.id } }); updatedCount++; }
    else { await prisma.order.create({ data: d }); newCount++; }
  }
  return { found: orders.length, newCount, updatedCount };
}
