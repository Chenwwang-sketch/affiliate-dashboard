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

  const all: LdTransaction[] = [];

  // 尝试鉴权方式
  const strategies = [
    { name: "Bearer", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
    ...(pubKey ? [{ name: "PublicKey+Key", headers: { Authorization: pubKey, "Content-Type": "application/json" }, useKeyParam: true }] : []),
  ];

  let workingStrategy: typeof strategies[0] | null = null;

  for (const s of strategies) {
    const testUrl = s.useKeyParam
      ? `https://api.leaddyno.com/v1/purchases?key=${token}&per_page=1`
      : "https://api.leaddyno.com/v1/purchases?per_page=1";
    const result = await tryFetch(testUrl, s.headers);
    if (result.ok) { workingStrategy = s; break; }
  }

  if (!workingStrategy) return { orders: [], error: "LeadDyno: all auth strategies failed" };

  // 拉取最近 180 天数据，按周分批避免翻页兼容问题
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 180);

  let currentStart = new Date(startDate);
  while (currentStart < endDate) {
    const batchEnd = new Date(currentStart);
    batchEnd.setDate(batchEnd.getDate() + 7); // 每次拉 7 天
    if (batchEnd > endDate) batchEnd.setTime(endDate.getTime());

    const from = currentStart.toISOString().split("T")[0];
    const to = batchEnd.toISOString().split("T")[0];

    // 不用 page 参数，LeadDyno API 部分版本不支持分页或限制最大 per_page
    // 用周为单位 + per_page=500 确保单次请求不超限
    const url = workingStrategy.useKeyParam
      ? `https://api.leaddyno.com/v1/purchases?key=${token}&from=${from}&to=${to}&per_page=500`
      : `https://api.leaddyno.com/v1/purchases?from=${from}&to=${to}&per_page=500`;

    const result = await tryFetch(url, workingStrategy.headers);
    if (!result.ok) return { orders: [], error: `LeadDyno fetch error (${from}~${to}): ${result.error}` };

    const items: LdTransaction[] = result.data?.purchases || result.data?.transactions || (Array.isArray(result.data) ? result.data : []);
    all.push(...items);

    // 如果本周返回了 500 条，说明可能被截断，缩小范围到按天拉
    if (items.length >= 500 && batchEnd.getTime() - currentStart.getTime() > 86400000) {
      // 放弃这周结果，改为按天逐日拉取
      all.splice(all.length - items.length, items.length);
      for (let d = new Date(currentStart); d < batchEnd; d.setDate(d.getDate() + 1)) {
        const dayEnd = new Date(d);
        dayEnd.setDate(dayEnd.getDate() + 1);
        if (dayEnd > endDate) dayEnd.setTime(endDate.getTime());
        const dayUrl = workingStrategy.useKeyParam
          ? `https://api.leaddyno.com/v1/purchases?key=${token}&from=${d.toISOString().split("T")[0]}&to=${dayEnd.toISOString().split("T")[0]}&per_page=500`
          : `https://api.leaddyno.com/v1/purchases?from=${d.toISOString().split("T")[0]}&to=${dayEnd.toISOString().split("T")[0]}&per_page=500`;
        const dayResult = await tryFetch(dayUrl, workingStrategy.headers);
        if (dayResult.ok) {
          const dayItems: LdTransaction[] = dayResult.data?.purchases || dayResult.data?.transactions || (Array.isArray(dayResult.data) ? dayResult.data : []);
          all.push(...dayItems);
        }
      }
    }

    currentStart = new Date(batchEnd);
    currentStart.setDate(currentStart.getDate() + 1);
    if (currentStart > endDate) break;
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
