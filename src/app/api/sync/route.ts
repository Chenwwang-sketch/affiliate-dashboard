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

// 共享的同步逻辑
async function runAllSyncs() {
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

  return results;
}

// POST /api/sync - 手动触发全量同步（需要 Authorization）
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAllSyncs();
  return NextResponse.json({ results, syncedAt: new Date().toISOString() });
}

// GET /api/sync - Vercel Cron 触发同步，或查看日志
export async function GET(request: NextRequest) {
  // Vercel Cron Job 会发送 x-vercel-cron 头，自动触发全量同步
  const isVercelCron = request.headers.get("x-vercel-cron");
  if (isVercelCron) {
    const results = await runAllSyncs();
    return NextResponse.json({ results, syncedAt: new Date().toISOString() });
  }

  // 普通 GET 请求：返回最近同步日志
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ logs });
}
