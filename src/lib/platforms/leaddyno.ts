import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

interface LeadDynoPurchase {
  id: string;
  email: string;
  name: string;
  order_id: string;
  product_name: string;
  total: number;
  commission: number;
  currency: string;
  status: string; // "pending" | "approved" | "declined" | "refunded"
  created_at: string;
  click_created_at: string;
  decline_reason: string | null;
  order_url: string | null;
}

function mapStatus(status: string): "PENDING" | "APPROVED" | "DECLINED" {
  switch (status.toLowerCase()) {
    case "pending":
      return "PENDING";
    case "approved":
    case "paid":
      return "APPROVED";
    case "declined":
    case "refunded":
    case "cancelled":
      return "DECLINED";
    default:
      return "PENDING";
  }
}

export async function fetchLeadDynoPurchases(): Promise<{
  orders: LeadDynoPurchase[];
  error?: string;
}> {
  const apiKey = process.env.LEADDYNO_TOKEN;
  const companySlug = process.env.LEADDYNO_PUBLIC_KEY;

  if (!apiKey || !companySlug) {
    return { orders: [], error: "LeadDyno API credentials not configured" };
  }

  try {
    const allPurchases: LeadDynoPurchase[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.leaddyno.com/v1/purchases?page=${page}&per_page=200`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        return { orders: [], error: `LeadDyno API error: ${res.status}` };
      }

      const data = await res.json();
      // LeadDyno 返回格式: { purchases: [...], total_pages: N }
      const purchases = data.purchases || [];
      allPurchases.push(...purchases);

      if (page >= (data.total_pages || 1)) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return { orders: allPurchases };
  } catch (err: any) {
    return { orders: [], error: err.message };
  }
}

export async function syncLeadDynoOrders(): Promise<{
  found: number;
  newCount: number;
  updatedCount: number;
  error?: string;
}> {
  const { orders, error } = await fetchLeadDynoPurchases();

  if (error) {
    return { found: 0, newCount: 0, updatedCount: 0, error };
  }

  let newCount = 0;
  let updatedCount = 0;

  for (const purchase of orders) {
    const status = mapStatus(purchase.status);
    const commissionUsd = await convertToUsd(
      purchase.commission,
      purchase.currency || "USD"
    );
    const commissionRmb = await convertToRmb(commissionUsd);

    const needsManualReview =
      status === "DECLINED" && !purchase.decline_reason;
    const manualReviewReason = needsManualReview
      ? `LeadDyno订单 ${purchase.order_id} 被取消但未提供原因，需人工确认`
      : null;

    const data = {
      platform: "LEADDYNO" as const,
      platformOrderId: purchase.order_id || purchase.id,
      status,
      commissionAmount: purchase.commission,
      commissionCurrency: purchase.currency || "USD",
      commissionUsd,
      commissionRmb,
      saleAmount: purchase.total || null,
      saleCurrency: purchase.currency || "USD",
      orderDate: new Date(purchase.created_at),
      clickDate: purchase.click_created_at
        ? new Date(purchase.click_created_at)
        : null,
      customerName: purchase.name || null,
      customerEmail: purchase.email || null,
      productName: purchase.product_name || null,
      orderUrl: purchase.order_url || null,
      declineReason: purchase.decline_reason || null,
      needsManualReview,
      manualReviewReason,
      rawData: purchase as any,
    };

    const existing = await prisma.order.findUnique({
      where: {
        platform_platformOrderId: {
          platform: "LEADDYNO",
          platformOrderId: purchase.order_id || purchase.id,
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
