import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/orders/[id]/review - 人工审核订单
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await request.json();
  const { action, declineReason } = body; // action: "APPROVE" | "DECLINE"

  if (!action || !["APPROVE", "DECLINE"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be APPROVE or DECLINE" },
      { status: 400 }
    );
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!order.needsManualReview) {
    return NextResponse.json(
      { error: "This order does not need manual review" },
      { status: 400 }
    );
  }

  // 更新订单状态
  const updateData: any = {
    status: action === "APPROVE" ? "APPROVED" : "DECLINED",
    needsManualReview: true, // 保持标记，表示已被人工处理
    manualReviewReason: order.manualReviewReason
      ? `${order.manualReviewReason} | 已人工${action === "APPROVE" ? "批准" : "拒绝"}`
      : `已人工${action === "APPROVE" ? "批准" : "拒绝"}`,
  };

  if (action === "DECLINE" && declineReason) {
    updateData.declineReason = declineReason;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: updateData,
  });

  // TODO: 调用对应平台的 API 撤销订单
  // await revokeOrderOnPlatform(order.platform, order.platformOrderId);

  return NextResponse.json({
    success: true,
    order: {
      ...updated,
      commissionAmount: Number(updated.commissionAmount),
      commissionUsd: Number(updated.commissionUsd),
      commissionRmb: Number(updated.commissionRmb),
    },
  });
}
