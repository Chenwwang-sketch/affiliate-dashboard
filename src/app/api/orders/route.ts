import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// GET /api/orders - 查询订单列表（分页+筛选+搜索）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const status = searchParams.get("status");
  const platform = searchParams.get("platform");
  const search = searchParams.get("search");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const needsReview = searchParams.get("needsReview");
  const sortBy = searchParams.get("sortBy") || "orderDate";
  const sortOrder = searchParams.get("sortOrder") || "desc";

  // 构建 where 条件
  const where: Prisma.OrderWhereInput = {};

  if (status && status !== "ALL") {
    where.status = status as any;
  }
  if (platform && platform !== "ALL") {
    where.platform = platform as any;
  }
  if (needsReview === "true") {
    where.needsManualReview = true;
  }
  if (startDate || endDate) {
    where.orderDate = {};
    if (startDate) where.orderDate.gte = new Date(startDate);
    if (endDate) where.orderDate.lte = new Date(endDate + "T23:59:59Z");
  }
  if (search) {
    where.OR = [
      { platformOrderId: { contains: search, mode: "insensitive" } },
      { productName: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { productSku: { contains: search, mode: "insensitive" } },
    ];
  }

  // 排序
  const orderBy: Prisma.OrderOrderByWithRelationInput = {};
  const allowedSortFields = ["orderDate", "commissionUsd", "status", "platform", "createdAt"];
  const field = allowedSortFields.includes(sortBy) ? sortBy : "orderDate";
  (orderBy as any)[field] = sortOrder === "asc" ? "asc" : "desc";

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    orders: orders.map((o) => ({
      ...o,
      commissionAmount: Number(o.commissionAmount),
      commissionUsd: Number(o.commissionUsd),
      commissionRmb: Number(o.commissionRmb),
      saleAmount: o.saleAmount ? Number(o.saleAmount) : null,
      orderDate: o.orderDate.toISOString(),
      clickDate: o.clickDate?.toISOString() || null,
      syncedAt: o.syncedAt.toISOString(),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      rawData: o.rawData ?? null,
    })),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  });
}
