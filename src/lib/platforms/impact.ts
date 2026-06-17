import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

// Impact: Mediapartners/{SID}/Actions, Basic Auth
interface ImpactAction {
  Id: string;
  State: string;
  Amount: string;
  Currency: string;
  Payout: string;
  OrderId: string;
  CustomerName: string;
  CustomerEmail: string;
  EventDate: string;
  ClickDate: string;
  RejectionReason: string | null;
  Sku: string;
  ProductName: string;
  ActionTrackerName: string;
}

function mapStatus(state: string): "PENDING" | "APPROVED" | "DECLINED" {
  switch (state.toUpperCase()) {
    case "PENDING": return "PENDING";
    case "APPROVED": case "LOCKED": return "APPROVED";
    case "REVERSED": case "REJECTED": return "DECLINED";
    default: return "PENDING";
  }
}

export async function fetchImpactActions(): Promise<{ orders: ImpactAction[]; error?: string }> {
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN || process.env.IMPACT_TOKEN;
  if (!accountSid || !authToken) return { orders: [], error: "Impact credentials not configured" };

  try {
    const allActions: ImpactAction[] = [];
    let page = 1, hasMore = true;
    while (hasMore) {
      const url = `https://api.impact.com/Mediapartners/${accountSid}/Actions?Page=${page}&PageSize=500`;
      const res = await fetch(url, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        const body = await res.text();
        return { orders: [], error: `Impact API ${res.status}: ${body.slice(0, 200)}` };
      }
      const data = await res.json();
      const actions = data.Actions || [];
      allActions.push(...actions);
      hasMore = actions.length === 500;
      page++;
    }
    return { orders: allActions };
  } catch (err: any) {
    return { orders: [], error: err.message };
  }
}

export async function syncImpactOrders(): Promise<{
  found: number; newCount: number; updatedCount: number; error?: string;
}> {
  const { orders, error } = await fetchImpactActions();
  if (error) return { found: 0, newCount: 0, updatedCount: 0, error };

  let newCount = 0, updatedCount = 0;
  for (const action of orders) {
    const status = mapStatus(action.State);
    const commissionAmount = parseFloat(action.Payout || action.Amount);
    const commissionUsd = await convertToUsd(commissionAmount, action.Currency);
    const commissionRmb = await convertToRmb(commissionUsd);
    const needsManualReview = status === "DECLINED" && !action.RejectionReason;
    const manualReviewReason = needsManualReview ? `Impact订单 ${action.OrderId} 被拒绝但未提供原因` : null;

    const orderData = {
      platform: "IMPACT" as const,
      platformOrderId: action.OrderId || action.Id,
      status, commissionAmount, commissionCurrency: action.Currency,
      commissionUsd, commissionRmb,
      saleAmount: parseFloat(action.Amount), saleCurrency: action.Currency,
      orderDate: new Date(action.EventDate),
      clickDate: action.ClickDate ? new Date(action.ClickDate) : null,
      customerName: action.CustomerName || null,
      customerEmail: action.CustomerEmail || null,
      productName: action.ProductName || action.ActionTrackerName,
      productSku: action.Sku || null,
      declineReason: action.RejectionReason || null,
      needsManualReview, manualReviewReason,
      rawData: action as any,
    };

    const existing = await prisma.order.findUnique({
      where: { platform_platformOrderId: { platform: "IMPACT", platformOrderId: action.OrderId || action.Id } },
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
