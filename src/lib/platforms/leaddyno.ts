import { prisma } from "@/lib/prisma";
import { convertToUsd, convertToRmb } from "@/lib/currency";

// LeadDyno: /v1/purchases, key=? (private), Authorization: (public)
interface LdTransaction {
  id: string;
  email: string;
  name: string;
  order_id: string;
  product_name: string;
  total: number;
  commission: number;
  currency: string;
  status: string;
  created_at: string;
  decline_reason: string | null;
}

function mapStatus(status: string): "PENDING" | "APPROVED" | "DECLINED" {
  switch ((status || "").toLowerCase()) {
    case "pending": return "PENDING";
    case "approved": case "paid": return "APPROVED";
    case "declined": case "refunded": case "cancelled": return "DECLINED";
    default: return "PENDING";
  }
}

export async function fetchLeadDynoTransactions(): Promise<{
  orders: LdTransaction[]; error?: string;
}> {
  const privateKey = process.env.LEADDYNO_TOKEN;
  const publicKey = process.env.LEADDYNO_PUBLIC_KEY;

  if (!privateKey || !publicKey) {
    return { orders: [], error: "LeadDyno keys not configured (need LEADDYNO_TOKEN + LEADDYNO_PUBLIC_KEY)" };
  }

  try {
    const allOrders: LdTransaction[] = [];
    // 按年分批拉取全量历史
    let year = 2020;
    const thisYear = new Date().getFullYear();
    
    while (year <= thisYear) {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      
      const url = `https://api.leaddyno.com/v1/purchases?key=${privateKey}&from=${from}&to=${to}&per_page=200`;
      
      const res = await fetch(url, {
        headers: {
          Authorization: publicKey,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.text();
        return { orders: [], error: `LeadDyno API ${res.status}: ${body.slice(0, 200)}` };
      }

      const text = await res.text();
      try {
        const data = JSON.parse(text);
        const items = data.transactions || data.purchases || (Array.isArray(data) ? data : []);
        allOrders.push(...items);
      } catch {
        return { orders: [], error: `LeadDyno parse error: ${text.slice(0, 200)}` };
      }
      
      year++;
    }

    return { orders: allOrders };
  } catch (err: any) {
    return { orders: [], error: err.message };
  }
}

export async function syncLeadDynoOrders(): Promise<{
  found: number; newCount: number; updatedCount: number; error?: string;
}> {
  const { orders, error } = await fetchLeadDynoTransactions();
  if (error) return { found: 0, newCount: 0, updatedCount: 0, error };

  let newCount = 0, updatedCount = 0;
  for (const tx of orders) {
    const status = mapStatus(tx.status);
    const commissionUsd = await convertToUsd(tx.commission, tx.currency || "USD");
    const commissionRmb = await convertToRmb(commissionUsd);
    const needsManualReview = status === "DECLINED" && !tx.decline_reason;
    const manualReviewReason = needsManualReview ? `LeadDyno订单 ${tx.order_id} 被取消但未提供原因` : null;

    const orderData = {
      platform: "LEADDYNO" as const,
      platformOrderId: tx.order_id || tx.id,
      status, commissionAmount: tx.commission, commissionCurrency: tx.currency || "USD",
      commissionUsd, commissionRmb,
      saleAmount: tx.total || null, saleCurrency: tx.currency || "USD",
      orderDate: new Date(tx.created_at),
      customerName: tx.name || null,
      customerEmail: tx.email || null,
      productName: tx.product_name || null,
      declineReason: tx.decline_reason || null,
      needsManualReview, manualReviewReason,
      rawData: tx as any,
    };

    const existing = await prisma.order.findUnique({
      where: { platform_platformOrderId: { platform: "LEADDYNO", platformOrderId: tx.order_id || tx.id } },
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
