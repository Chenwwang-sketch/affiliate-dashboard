import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

// GoAffPro: {BASE_URL}/api/admin/orders, X-Goaffpro-Access-Token header
interface GaOrder {
  order_id: string;
  order_number: string;
  total: number;
  commission: number;
  currency: string;
  status: string;
  created_at: string;
  customer_name: string;
  customer_email: string;
  product_names: string;
  rejection_reason: string | null;
  order_url: string | null;
}

function mapStatus(status: string): "PENDING" | "APPROVED" | "DECLINED" {
  switch ((status || "").toLowerCase()) {
    case "pending": return "PENDING";
    case "approved": case "paid": return "APPROVED";
    case "rejected": case "cancelled": case "refunded": return "DECLINED";
    default: return "PENDING";
  }
}

export async function fetchGoAffProOrders(): Promise<{
  orders: GaOrder[]; error?: string;
}> {
  // 优先环境变量，fallback 到数据库
  let token = process.env.GOAFFPRO_TOKEN;
  let baseUrl = process.env.GOAFFPRO_BASE_URL;

  if (!token || !baseUrl) {
    const dbConfig = await prisma.platformConfig.findUnique({
      where: { platform: "GOAFFPRO" },
    });
    if (dbConfig?.apiKey) token = dbConfig.apiKey;
    if (dbConfig?.accountId) baseUrl = dbConfig.accountId;
  }

  if (!token) return { orders: [], error: "GOAFFPRO_TOKEN not configured (请在设置页面填入 API Token 或设置环境变量)" };
  if (!baseUrl) return { orders: [], error: "GOAFFPRO_BASE_URL not configured (请在设置页面填入 Base URL 或设置环境变量)" };

  // 去掉末尾斜杠
  const apiBase = baseUrl.replace(/\/+$/, "");

  // 尝试多种鉴权头 + 端点组合
  const authHeadersList: Record<string, string>[] = [
    { "X-Goaffpro-Access-Token": token },
    { "X-Goaffpro-API-Key": token },
    { "Authorization": `Bearer ${token}` },
    { "x-api-key": token },
  ];

  const apiPaths = [
    `/admin/orders`,
    `/orders`,
    `/api/admin/orders`,
    `/api/orders`,
    `/v1/orders`,
    `/v1/admin/orders`,
  ];

  const apiHosts = [apiBase, "https://api.goaffpro.com"];

  let workingUrl = "";
  let workingHeaders: Record<string, string> = authHeadersList[0];

  // 双层遍历：主机 × 路径 × 鉴权头
  outer:
  for (const host of apiHosts) {
    for (const path of apiPaths) {
      for (const ah of authHeadersList) {
        const testUrl = `${host}${path}?from=2026-06-01&to=2026-06-02&limit=1`;
        try {
          const r = await fetch(testUrl, {
            headers: { ...ah, "Content-Type": "application/json" } as Record<string, string>,
          });
          const text = await r.text();
          if (r.ok && !text.trim().startsWith("<")) {
            workingUrl = `${host}${path}`;
            workingHeaders = ah;
            break outer;
          }
        } catch {}
      }
    }
  }

  if (!workingUrl) {
    return {
      orders: [],
      error: `GoAffPro: 所有端点+鉴权方式均失败。已尝试 ${apiHosts.length * apiPaths.length * authHeadersList.length} 种组合。请确认 GOAFFPRO_BASE_URL 和 GOAFFPRO_TOKEN 是否正确。`,
    };
  }

  try {
    const allOrders: GaOrder[] = [];
    
    // 拉取近 180 天数据，按周分批
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 180);

    let currentStart = new Date(startDate);
    while (currentStart < endDate) {
      const batchEnd = new Date(currentStart);
      batchEnd.setDate(batchEnd.getDate() + 7);
      if (batchEnd > endDate) batchEnd.setTime(endDate.getTime());

      const from = currentStart.toISOString().split("T")[0];
      const to = batchEnd.toISOString().split("T")[0];

      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const url = `${workingUrl}?from=${from}&to=${to}&limit=200&page=${page}`;
        
        const res = await fetch(url, {
          headers: { ...workingHeaders, "Content-Type": "application/json" } as Record<string, string>,
        });

        if (!res.ok) {
          const body = await res.text();
          return { orders: [], error: `GoAffPro API ${res.status}: ${body.slice(0, 200)}` };
        }

        const text = await res.text();
        try {
          const data = JSON.parse(text);
          const items = data.orders || (Array.isArray(data) ? data : []);
          allOrders.push(...items);
          hasMore = items.length >= 200;
          page++;
        } catch {
          return { orders: [], error: `GoAffPro parse error: ${text.slice(0, 200)}` };
        }
      }

      currentStart = new Date(batchEnd);
      currentStart.setDate(currentStart.getDate() + 1);
      if (currentStart > endDate) break;
    }

    return { orders: allOrders };
  } catch (err: any) {
    return { orders: [], error: err.message };
  }
}

export async function syncGoAffProOrders(): Promise<{
  found: number; newCount: number; updatedCount: number; error?: string;
}> {
  const { orders, error } = await fetchGoAffProOrders();
  if (error) return { found: 0, newCount: 0, updatedCount: 0, error };

  let newCount = 0, updatedCount = 0;
  for (const order of orders) {
    const status = mapStatus(order.status);
    const commissionUsd = await convertToUsd(order.commission, order.currency || "USD");
    const commissionRmb = await convertToRmb(commissionUsd);
    const needsManualReview = status === "DECLINED" && !order.rejection_reason;
    const manualReviewReason = needsManualReview ? `GoAffPro订单 ${order.order_number} 被拒绝但未提供原因` : null;

    const orderData = {
      platform: "GOAFFPRO" as const,
      platformOrderId: order.order_number || order.order_id,
      status, commissionAmount: order.commission, commissionCurrency: order.currency || "USD",
      commissionUsd, commissionRmb,
      saleAmount: order.total || null, saleCurrency: order.currency || "USD",
      orderDate: new Date(order.created_at),
      customerName: order.customer_name || null,
      customerEmail: order.customer_email || null,
      productName: order.product_names || null,
      orderUrl: order.order_url || null,
      declineReason: order.rejection_reason || null,
      needsManualReview, manualReviewReason,
      rawData: order as any,
    };

    const existing = await prisma.order.findFirst({
      where: { platform: "GOAFFPRO", platformOrderId: order.order_number || order.order_id },
    });

    if (existing) {
      await prisma.order.update({ where: { id: existing.id }, data: { ...orderData, id: existing.id } });
      updatedCount++;
    } else {
      await prisma.order.create({ data: orderData });
      newCount++;
    }
  }
  return { found: orders.length, newCount, updatedCount };
}
