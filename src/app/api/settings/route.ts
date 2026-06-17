import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/settings - 获取所有平台配置（隐藏 API Key）
export async function GET() {
  const configs = await prisma.platformConfig.findMany();

  return NextResponse.json({
    configs: configs.map((c) => ({
      id: c.id,
      platform: c.platform,
      apiKey: c.apiKey ? "••••" + c.apiKey.slice(-4) : null,
      accountId: c.accountId || null,
      isActive: c.isActive,
      additionalConfig: c.additionalConfig,
      hasApiSecret: !!c.apiSecret,
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

// PUT /api/settings - 更新平台配置
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { platform, apiKey, apiSecret, accountId, additionalConfig, isActive } = body;

  if (!platform) {
    return NextResponse.json({ error: "Platform is required" }, { status: 400 });
  }

  const updateData: any = {};
  if (apiKey !== undefined) updateData.apiKey = apiKey;
  if (apiSecret !== undefined) updateData.apiSecret = apiSecret;
  if (accountId !== undefined) updateData.accountId = accountId;
  if (additionalConfig !== undefined) updateData.additionalConfig = additionalConfig;
  if (isActive !== undefined) updateData.isActive = isActive;

  const config = await prisma.platformConfig.upsert({
    where: { platform: platform as any },
    update: updateData,
    create: {
      platform: platform as any,
      apiKey: apiKey || "",
      apiSecret: apiSecret || null,
      accountId: accountId || null,
      additionalConfig: additionalConfig || null,
      isActive: isActive !== undefined ? isActive : true,
    },
  });

  return NextResponse.json({
    success: true,
    config: {
      ...config,
      apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : null,
      hasApiSecret: !!config.apiSecret,
    },
  });
}
