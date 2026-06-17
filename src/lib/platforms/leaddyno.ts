import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

interface LdTransaction {
  id: string; email: string; name: string; order_id: string;
  product_name: string; total: number; commission: number; currency: string;
  status: string; created_at: string; decline_reason: string | null;
}

function mapStatus(s: string): "PENDING" | "APPROVED" | "DECLINED" {
  switch ((s||"").toLowerCase()) {
    case "pending": return "PENDING";
    case "approved": case "paid": return "APPROVED";
    case "declined": case "refunded": case "cancelled": return "DECLINED";
    default: return "PENDING";
  }
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

export async function fetchLeadDynoTransactions(): Promise<{ orders: LdTransaction[]; error?: string }> {
  const token = process.env.LEADDYNO_TOKEN;
  const pubKey = process.env.LEADDYNO_PUBLIC_KEY;
  if (!token) return { orders: [], error: "LEADDYNO_TOKEN not set" };

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
    const status = mapStatus(tx.status);
    const usd = await convertToUsd(tx.commission, tx.currency || "USD");
    const rmb = await convertToRmb(usd);
    const needsReview = status === "DECLINED" && !tx.decline_reason;

    const d = {
      platform: "LEADDYNO" as const,
      platformOrderId: tx.order_id || tx.id,
      status, commissionAmount: tx.commission, commissionCurrency: tx.currency || "USD",
      commissionUsd: usd, commissionRmb: rmb,
      saleAmount: tx.total || null, saleCurrency: tx.currency || "USD",
      orderDate: new Date(tx.created_at),
      customerName: tx.name || null, customerEmail: tx.email || null,
      productName: tx.product_name || null,
      declineReason: tx.decline_reason || null,
      needsManualReview: needsReview,
      manualReviewReason: needsReview ? `LeadDyno订单 ${tx.order_id} 被取消但未提供原因` : null,
      rawData: tx as any,
    };

    const existing = await prisma.order.findUnique({
      where: { platform_platformOrderId: { platform: "LEADDYNO", platformOrderId: tx.order_id || tx.id } },
    });
    if (existing) { await prisma.order.update({ where: { id: existing.id }, data: { ...d, id: existing.id } }); updatedCount++; }
    else { await prisma.order.create({ data: d }); newCount++; }
  }
  return { found: orders.length, newCount, updatedCount };
}
