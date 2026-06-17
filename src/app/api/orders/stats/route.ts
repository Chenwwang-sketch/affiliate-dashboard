import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/orders/stats - 获取统计概览数据
export async function GET() {
  const [
    totalCount,
    statusCounts,
    pendingAgg,
    platformStats,
    dailyStats,
  ] = await Promise.all([
    // 总订单数
    prisma.order.count(),

    // 各状态数量
    prisma.order.groupBy({
      by: ["status"],
      _count: { id: true },
      _sum: { commissionUsd: true, commissionRmb: true },
    }),

    // Pending 佣金汇总
    prisma.order.aggregate({
      where: { status: "PENDING" },
      _sum: { commissionUsd: true, commissionRmb: true },
    }),

    // 按平台统计
    prisma.order.groupBy({
      by: ["platform"],
      _count: { id: true },
      _sum: { commissionUsd: true },
    }),

    // 近30天每日统计
    prisma.order.groupBy({
      by: ["orderDate"],
      where: {
        orderDate: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      _count: { id: true },
      _sum: { commissionUsd: true },
      orderBy: { orderDate: "asc" },
    }),
  ]);

  const statusMap: Record<string, { count: number; commissionUsd: number; commissionRmb: number }> = {
    PENDING: { count: 0, commissionUsd: 0, commissionRmb: 0 },
    APPROVED: { count: 0, commissionUsd: 0, commissionRmb: 0 },
    DECLINED: { count: 0, commissionUsd: 0, commissionRmb: 0 },
  };

  for (const s of statusCounts) {
    statusMap[s.status] = {
      count: s._count.id,
      commissionUsd: Number(s._sum.commissionUsd || 0),
      commissionRmb: Number(s._sum.commissionRmb || 0),
    };
  }

  // 需要人工审核数量
  const needsReviewCount = await prisma.order.count({
    where: { needsManualReview: true },
  });

  return NextResponse.json({
    totalOrders: totalCount,
    pendingCount: statusMap.PENDING.count,
    approvedCount: statusMap.APPROVED.count,
    declinedCount: statusMap.DECLINED.count,
    pendingCommissionUsd: Number(pendingAgg._sum.commissionUsd || 0),
    pendingCommissionRmb: Number(pendingAgg._sum.commissionRmb || 0),
    totalCommissionUsd:
      statusMap.PENDING.commissionUsd +
      statusMap.APPROVED.commissionUsd +
      statusMap.DECLINED.commissionUsd,
    totalCommissionRmb:
      statusMap.PENDING.commissionRmb +
      statusMap.APPROVED.commissionRmb +
      statusMap.DECLINED.commissionRmb,
    statusBreakdown: statusMap,
    platformStats: platformStats.map((p) => ({
      platform: p.platform,
      total: p._count.id,
      commissionUsd: Number(p._sum.commissionUsd || 0),
    })),
    dailyStats: dailyStats.map((d) => ({
      date: d.orderDate.toISOString().split("T")[0],
      count: d._count.id,
      commissionUsd: Number(d._sum.commissionUsd || 0),
    })),
    needsReviewCount,
  });
}
