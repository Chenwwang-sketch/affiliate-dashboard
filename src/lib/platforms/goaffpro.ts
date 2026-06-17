import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

interface GoAffProOrder {
  order_id: string;
  order_number: string;
  total: number;
  commission: number;
  currency: string;
  status: string; // "pending" | "approved" | "rejected" | "cancelled"
  created_at: string;
  customer_name: string;
  customer_email: string;
  product_names: string;
  coupon_code: string | null;
  order_url: string | null;
  rejection_reason: string | null;
  affiliate_id: string;
}

function mapStatus(status: string): "PENDING" | "APPROVED" | "DECLINED" {
  switch (status.toLowerCase()) {
    case "pending":
      return "PENDING";
    case "approved":
    case "paid":
      return "APPROVED";
    case "rejected":
    case "cancelled":
    case "refunded":
      return "DECLINED";
    default:
      return "PENDING";
  }
}

export async function fetchGoAffProOrders(): Promise<{
  orders: GoAffProOrder[];
  error?: string;
}> {
  const apiKey = process.env.GOAFFPRO_API_KEY;
  const affiliateId = process.env.GOAFFPRO_AFFILIATE_ID;

  if (!apiKey) {
    return { orders: [], error: "GoAffPro API key not configured" };
  }

  try {
    const allOrders: GoAffProOrder[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.goaffpro.com/v1/orders?page=${page}&limit=200`;
      if (affiliateId) url + `&affiliate_id=${affiliateId}`;

      const res = await fetch(url, {
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        return { orders: [], error: `GoAffPro API error: ${res.status}` };
      }

      const data = await res.json();
      // GoAffPro 返回: { orders: [...], has_more: boolean }
      const orders = data.orders || [];
      allOrders.push(...orders);

      if (!data.has_more) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return { orders: allOrders };
  } catch (err: any) {
    return { orders: [], error: err.message };
  }
}

export async function syncGoAffProOrders(): Promise<{
  found: number;
  newCount: number;
  updatedCount: number;
  error?: string;
}> {
  const { orders, error } = await fetchGoAffProOrders();

  if (error) {
    return { found: 0, newCount: 0, updatedCount: 0, error };
  }

  let newCount = 0;
  let updatedCount = 0;

  for (const order of orders) {
    const status = mapStatus(order.status);
    const commissionUsd = await convertToUsd(
      order.commission,
      order.currency || "USD"
    );
    const commissionRmb = await convertToRmb(commissionUsd);

    const needsManualReview =
      status === "DECLINED" && !order.rejection_reason;
    const manualReviewReason = needsManualReview
      ? `GoAffPro订单 ${order.order_number} 被拒绝但未提供原因，需人工确认`
      : null;

    const data = {
      platform: "GOAFFPRO" as const,
      platformOrderId: order.order_number || order.order_id,
      status,
      commissionAmount: order.commission,
      commissionCurrency: order.currency || "USD",
      commissionUsd,
      commissionRmb,
      saleAmount: order.total || null,
      saleCurrency: order.currency || "USD",
      orderDate: new Date(order.created_at),
      clickDate: null,
      customerName: order.customer_name || null,
      customerEmail: order.customer_email || null,
      productName: order.product_names || null,
      orderUrl: order.order_url || null,
      declineReason: order.rejection_reason || null,
      needsManualReview,
      manualReviewReason,
      rawData: order as any,
    };

    const existing = await prisma.order.findUnique({
      where: {
        platform_platformOrderId: {
          platform: "GOAFFPRO",
          platformOrderId: order.order_number || order.order_id,
        },
      },
    });

    if (existing) {
      await prisma.order.update({
        where: { id: existing.id },
        data: { ...data, id: existing.id },
      });
      updatedCount++;
    } else {
      await prisma.order.create({ data });
      newCount++;
    }
  }

  return { found: orders.length, newCount, updatedCount };
}
