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

// 同步单个平台（含日志记录）
async function syncPlatform(platform: string) {
  const syncer = PLATFORM_SYNCERS[platform as keyof typeof PLATFORM_SYNCERS];
  if (!syncer) return { status: "FAILED", error: "Unknown platform" };

  const log = await prisma.syncLog.create({
    data: { platform: platform as any, status: "RUNNING", ordersFound: 0, ordersNew: 0, ordersUpdated: 0 },
  });

  try {
    const result = await syncer();
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
    return { status: result.error ? "FAILED" : "SUCCESS", ...result };
  } catch (err: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", message: err.message, finishedAt: new Date(), errorJson: { message: err.message } },
    });
    return { status: "FAILED", error: err.message };
  }
}

// POST /api/sync - 手动触发全量同步
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platforms = ["AWIN", "IMPACT", "LEADDYNO", "GOAFFPRO"];
  const results: Record<string, any> = {};
  for (const p of platforms) {
    results[p] = await syncPlatform(p);
  }
  return NextResponse.json({ results, syncedAt: new Date().toISOString() });
}

// GET /api/sync - Vercel Cron 触发同步 / 浏览器触发 / 查看日志
export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get("x-vercel-cron");
  const url = new URL(request.url);
  const shouldRun = isVercelCron || url.searchParams.get("run") === "1";

  if (shouldRun) {
    const platforms = ["AWIN", "IMPACT", "LEADDYNO", "GOAFFPRO"];
    const results: Record<string, any> = {};
    for (const p of platforms) {
      results[p] = await syncPlatform(p);
    }
    return NextResponse.json({ results, syncedAt: new Date().toISOString() });
  }

  // 普通 GET 请求：返回最近同步日志
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ logs });
}
