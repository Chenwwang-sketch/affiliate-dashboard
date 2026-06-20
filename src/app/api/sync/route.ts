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

// 后台异步同步单个平台
async function syncPlatformBackground(platform: string) {
  const syncer = PLATFORM_SYNCERS[platform as keyof typeof PLATFORM_SYNCERS];
  if (!syncer) return;

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
  } catch (err: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", message: err.message, finishedAt: new Date(), errorJson: { message: err.message } },
    });
  }
}

// 后台异步同步所有平台
async function syncAllBackground() {
  const platforms = ["AWIN", "IMPACT", "LEADDYNO", "GOAFFPRO"];
  for (const platform of platforms) {
    await syncPlatformBackground(platform);
  }
}

// POST /api/sync - 手动触发全量同步
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 后台异步执行
  syncAllBackground().catch(console.error);
  return NextResponse.json({ message: "全平台同步已启动（后台执行）", platforms: ["AWIN", "IMPACT", "LEADDYNO", "GOAFFPRO"] });
}

// GET /api/sync - Vercel Cron 触发同步 / 浏览器触发 / 查看日志
export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get("x-vercel-cron");
  const url = new URL(request.url);
  const shouldRun = isVercelCron || url.searchParams.get("run") === "1";

  if (shouldRun) {
    // 后台异步执行所有平台同步
    syncAllBackground().catch(console.error);
    return NextResponse.json({ message: "全平台同步已启动（后台执行）", syncedAt: new Date().toISOString() });
  }

  // 普通 GET 请求：返回最近同步日志
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ logs });
}
