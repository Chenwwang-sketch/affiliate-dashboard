import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAwinOrders } from "@/lib/platforms/awin";
import { syncImpactOrders } from "@/lib/platforms/impact";
import { syncLeadDynoOrders } from "@/lib/platforms/leaddyno";
import { syncGoAffProOrders } from "@/lib/platforms/goaffpro";

const PLATFORM_SYNCERS: Record<string, () => Promise<{
  found: number;
  newCount: number;
  updatedCount: number;
  error?: string;
}>> = {
  awin: syncAwinOrders,
  impact: syncImpactOrders,
  leaddyno: syncLeadDynoOrders,
  goaffpro: syncGoAffProOrders,
};

export async function POST(
  request: NextRequest,
  { params }: { params: { platform: string } }
) {
  const platform = params.platform?.toLowerCase();
  const syncer = PLATFORM_SYNCERS[platform || ""];

  if (!syncer) {
    return NextResponse.json(
      { error: "Invalid platform" },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platformUpper = platform!.toUpperCase() as any;
  const log = await prisma.syncLog.create({
    data: {
      platform: platformUpper,
      status: "RUNNING",
      ordersFound: 0,
      ordersNew: 0,
      ordersUpdated: 0,
    },
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
      },
    });

    return NextResponse.json({ ...result, status: result.error ? "FAILED" : "SUCCESS" });
  } catch (err: any) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        message: err.message,
        finishedAt: new Date(),
      },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
