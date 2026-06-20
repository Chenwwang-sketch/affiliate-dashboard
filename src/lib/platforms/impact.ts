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
  // 优先环境变量，fallback 到数据库
  let accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authTokens = [
    process.env.IMPACT_AUTH_TOKEN,
    process.env.IMPACT_TOKEN,
  ].filter(Boolean) as string[];

  if (!accountSid || authTokens.length === 0) {
    const dbConfig = await prisma.platformConfig.findUnique({
      where: { platform: "IMPACT" },
    });
    if (dbConfig?.apiKey) accountSid = dbConfig.apiKey;
    if (dbConfig?.apiSecret) authTokens.push(dbConfig.apiSecret);
  }

  if (!accountSid || authTokens.length === 0) return { orders: [], error: "Impact credentials not configured (请在设置页面填入 Account SID 和 Auth Token 或设置环境变量)" };

  // 尝试每个 token 直到成功
  let workingToken = "";
  for (const tok of authTokens) {
    try {
      const testUrl = `https://api.impact.com/Mediapartners/${accountSid}/Actions?Page=1&PageSize=1`;
      const testRes = await fetch(testUrl, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${tok}`).toString("base64"),
          Accept: "application/json",
        },
      });
      if (testRes.ok) { workingToken = tok; break; }
    } catch {}
  }

  if (!workingToken) return { orders: [], error: "Impact: 所有 Auth Token 均返回 401，请检查 Vercel 中的 IMPACT_AUTH_TOKEN 或 IMPACT_TOKEN" };

  try {
    const allActions: ImpactAction[] = [];
    let page = 1, hasMore = true;
    while (hasMore) {
      const url = `https://api.impact.com/Mediapartners/${accountSid}/Actions?Page=${page}&PageSize=500`;
      const res = await fetch(url, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${workingToken}`).toString("base64"),
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

    const existing = await prisma.order.findFirst({
      where: { platform: "IMPACT", platformOrderId: action.OrderId || action.Id },
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
