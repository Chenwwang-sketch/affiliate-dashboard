import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

interface ImpactAction {
  Id: string;
  ActionTrackerId: string;
  ActionTrackerName: string;
  CampaignId: string;
  CampaignName: string;
  State: string; // "PENDING" | "APPROVED" | "REVERSED" | "LOCKED"
  Amount: string;
  Currency: string;
  Payout: string;
  OrderId: string;
  CustomerName: string;
  CustomerEmail: string;
  EventDate: string;
  ClickDate: string;
  LockingDate: string | null;
  RejectionReason: string | null;
  Sku: string;
  ProductName: string;
  BrandName: string;
  SubId1: string | null;
}

function mapStatus(state: string): "PENDING" | "APPROVED" | "DECLINED" {
  switch (state.toUpperCase()) {
    case "PENDING":
      return "PENDING";
    case "APPROVED":
    case "LOCKED":
      return "APPROVED";
    case "REVERSED":
    case "REJECTED":
      return "DECLINED";
    default:
      return "PENDING";
  }
}

export async function fetchImpactActions(): Promise<{
  orders: ImpactAction[];
  error?: string;
}> {
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return { orders: [], error: "Impact API credentials not configured" };
  }

  try {
    const allActions: ImpactAction[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(
        `https://api.impact.com/Advertisers/${accountSid}/Actions`
      );
      url.searchParams.set("Page", String(page));
      url.searchParams.set("PageSize", "500");

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return { orders: [], error: `Impact API error: ${res.status}` };
      }

      const data = await res.json();
      const actions = data.Actions || [];
      allActions.push(...actions);

      if (actions.length < 500) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return { orders: allActions };
  } catch (err: any) {
    return { orders: [], error: err.message };
  }
}

export async function syncImpactOrders(): Promise<{
  found: number;
  newCount: number;
  updatedCount: number;
  error?: string;
}> {
  const { orders, error } = await fetchImpactActions();

  if (error) {
    return { found: 0, newCount: 0, updatedCount: 0, error };
  }

  let newCount = 0;
  let updatedCount = 0;

  for (const action of orders) {
    const status = mapStatus(action.State);
    const commissionAmount = parseFloat(action.Payout || action.Amount);
    const saleAmount = parseFloat(action.Amount);
    const commissionUsd = await convertToUsd(commissionAmount, action.Currency);
    const commissionRmb = await convertToRmb(commissionUsd);

    const needsManualReview =
      status === "DECLINED" && !action.RejectionReason;
    const manualReviewReason = needsManualReview
      ? `Impact订单 ${action.OrderId} 被拒绝但未提供原因，需人工确认`
      : null;

    const data = {
      platform: "IMPACT" as const,
      platformOrderId: action.OrderId || action.Id,
      status,
      commissionAmount,
      commissionCurrency: action.Currency,
      commissionUsd,
      commissionRmb,
      saleAmount,
      saleCurrency: action.Currency,
      orderDate: new Date(action.EventDate),
      clickDate: action.ClickDate ? new Date(action.ClickDate) : null,
      customerName: action.CustomerName || null,
      customerEmail: action.CustomerEmail || null,
      productName: action.ProductName || action.ActionTrackerName,
      productSku: action.Sku || null,
      orderUrl: null,
      declineReason: action.RejectionReason || null,
      needsManualReview,
      manualReviewReason,
      rawData: action as any,
    };

    const existing = await prisma.order.findUnique({
      where: {
        platform_platformOrderId: {
          platform: "IMPACT",
          platformOrderId: action.OrderId || action.Id,
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
