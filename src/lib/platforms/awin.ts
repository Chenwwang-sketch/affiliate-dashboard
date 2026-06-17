import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

interface AwinTransaction {
  id: string;
  url: string;
  advertiserId: string;
  publisherId: string;
  commissionSharingPublisherId: string;
  commissionSharingSelectedRatePublisherId: string;
  siteName: string;
  commissionStatus: string; // "pending" | "approved" | "declined"
  commissionAmount: { amount: number; currency: string };
  saleAmount: { amount: number; currency: string };
  advertiserName: string;
  orderRef: string;
  transactionDate: string;
  transactionQueryTime: string;
  clickDate: string;
  declineReason: string | null;
  productName: string | null;
}

function mapStatus(status: string): "PENDING" | "APPROVED" | "DECLINED" {
  switch (status.toLowerCase()) {
    case "pending":
    case "open":
      return "PENDING";
    case "approved":
    case "confirmed":
      return "APPROVED";
    case "declined":
    case "cancelled":
      return "DECLINED";
    default:
      return "PENDING";
  }
}

export async function fetchAwinOrders(): Promise<{
  orders: AwinTransaction[];
  error?: string;
}> {
  const apiKey = process.env.AWIN_API_KEY;
  const publisherId = process.env.AWIN_PUBLISHER_ID;

  if (!apiKey) {
    return { orders: [], error: "Awin API key not configured" };
  }

  try {
    const allOrders: AwinTransaction[] = [];
    // Awin API 分页获取所有历史订单
    let startDate = new Date("2000-01-01");
    const endDate = new Date();

    // Awin 按时间范围分批获取
    while (startDate < endDate) {
      const batchEnd = new Date(startDate);
      batchEnd.setFullYear(batchEnd.getFullYear() + 1);
      if (batchEnd > endDate) batchEnd.setTime(endDate.getTime());

      const url = new URL("https://api.awin.com/publishers/" + publisherId + "/transactions/");
      url.searchParams.set("startDate", startDate.toISOString().split("T")[0] + "T00:00:00");
      url.searchParams.set("endDate", batchEnd.toISOString().split("T")[0] + "T23:59:59");
      url.searchParams.set("timezone", "UTC");

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        return { orders: [], error: `Awin API error: ${res.status}` };
      }

      const data = await res.json();
      // Awin 返回格式: [{...}, {...}]
      const batch = Array.isArray(data) ? data : [];
      allOrders.push(...batch);

      startDate = batchEnd;
    }

    return { orders: allOrders };
  } catch (err: any) {
    return { orders: [], error: err.message };
  }
}

export async function syncAwinOrders(): Promise<{
  found: number;
  newCount: number;
  updatedCount: number;
  error?: string;
}> {
  const { orders, error } = await fetchAwinOrders();

  if (error) {
    return { found: 0, newCount: 0, updatedCount: 0, error };
  }

  let newCount = 0;
  let updatedCount = 0;

  for (const order of orders) {
    const status = mapStatus(order.commissionStatus);
    const commissionUsd = await convertToUsd(
      order.commissionAmount.amount,
      order.commissionAmount.currency
    );
    const commissionRmb = await convertToRmb(commissionUsd);

    // 判断是否需要人工审核：declined 但没有取消原因
    const needsManualReview =
      status === "DECLINED" && !order.declineReason && !order.declineReason;
    const manualReviewReason = needsManualReview
      ? `Awin订单 ${order.orderRef} 被取消但未提供取消原因，需人工确认`
      : null;

    const data = {
      platform: "AWIN" as const,
      platformOrderId: order.orderRef || order.id,
      status,
      commissionAmount: order.commissionAmount.amount,
      commissionCurrency: order.commissionAmount.currency,
      commissionUsd,
      commissionRmb,
      saleAmount: order.saleAmount?.amount || null,
      saleCurrency: order.saleAmount?.currency || null,
      orderDate: new Date(order.transactionDate),
      clickDate: order.clickDate ? new Date(order.clickDate) : null,
      productName: order.productName || order.advertiserName,
      orderUrl: order.url || null,
      declineReason: order.declineReason || null,
      needsManualReview,
      manualReviewReason,
      rawData: order as any,
    };

    const existing = await prisma.order.findUnique({
      where: {
        platform_platformOrderId: {
          platform: "AWIN",
          platformOrderId: order.orderRef || order.id,
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
