import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAwinOrders } from "@/lib/platforms/awin";
import { syncImpactOrders } from "@/lib/platforms/impact";
import { syncLeadDynoOrders } from "@/lib/platforms/leaddyno";
import { syncGoAffProOrders } from "@/lib/platforms/goaffpro";

const PLATFORM_SYNCERS = {
  AWIN: syncAwinOrders,
  IMPACT: syncImpactOrders,
  LEADDYNO: syncLeadDynoOrders,
  GOAFFPRO: syncGoAffProOrders,
};

// POST /api/sync - 全量同步所有平台
export async function POST(request: NextRequest) {
  // 验证 Cron Secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platforms = ["AWIN", "IMPACT", "LEADDYNO", "GOAFFPRO"] as const;
  const results: Record<string, any> = {};

  for (const platform of platforms) {
    const log = await prisma.syncLog.create({
      data: {
        platform,
        status: "RUNNING",
        ordersFound: 0,
        ordersNew: 0,
        ordersUpdated: 0,
      },
    });

    try {
      const result = await PLATFORM_SYNCERS[platform]();

      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: result.error ? "FAILED" : "SUCCESS",
          message: result.error || null,
          ordersFound: result.found,
          ordersNew: result.newCount,
          ordersUpdated: result.updatedCount,
          finishedAt: new Date(),
          errorJson: result.error ? { message: result.error } : undefined,
        },
      });

      results[platform] = {
        status: result.error ? "FAILED" : "SUCCESS",
        ...result,
      };
    } catch (err: any) {
      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          message: err.message,
          finishedAt: new Date(),
          errorJson: { message: err.message },
        },
      });

      results[platform] = { status: "FAILED", error: err.message };
    }
  }

  return NextResponse.json({ results, syncedAt: new Date().toISOString() });
}

// GET /api/sync - 获取最近同步日志
export async function GET() {
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ logs });
}
