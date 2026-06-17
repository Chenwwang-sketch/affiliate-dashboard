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
  const token = process.env.GOAFFPRO_TOKEN;
  const baseUrl = process.env.GOAFFPRO_BASE_URL;

  if (!token) return { orders: [], error: "GOAFFPRO_TOKEN not configured" };
  if (!baseUrl) return { orders: [], error: "GOAFFPRO_BASE_URL not configured" };

  // 去掉末尾斜杠
  const apiBase = baseUrl.replace(/\/+$/, "");

  try {
    const allOrders: GaOrder[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${apiBase}/api/admin/orders?from=2020-01-01&to=${new Date().toISOString().slice(0, 10)}&limit=200&page=${page}`;
      
      const res = await fetch(url, {
        headers: {
          "X-Goaffpro-Access-Token": token,
          "Content-Type": "application/json",
        },
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
        hasMore = items.length === 200;
        page++;
      } catch {
        return { orders: [], error: `GoAffPro parse error: ${text.slice(0, 200)}` };
      }
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

    const existing = await prisma.order.findUnique({
      where: { platform_platformOrderId: { platform: "GOAFFPRO", platformOrderId: order.order_number || order.order_id } },
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
