"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { OrderRow, PLATFORM_LABELS, STATUS_LABELS } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function ReviewPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>({});
  const [showDeclineInput, setShowDeclineInput] = useState<string | null>(null);

  const fetchReviewOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders?needsReview=true&pageSize=100");
      const data = await res.json();
      setOrders(data.orders);
    } catch (err) {
      console.error("Failed to fetch review orders:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviewOrders();
  }, [fetchReviewOrders]);

  const handleAction = async (orderId: string, action: "APPROVE" | "DECLINE") => {
    setActionLoading(orderId);
    try {
      const body: any = { action };
      if (action === "DECLINE" && declineReasons[orderId]) {
        body.declineReason = declineReasons[orderId];
      }
      const res = await fetch(`/api/orders/${orderId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // 从列表中移除
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        alert("操作失败，请重试");
      }
    } catch {
      alert("网络错误，请重试");
    } finally {
      setActionLoading(null);
      setShowDeclineInput(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">人工审核</h2>
          <p className="text-sm text-gray-500 mt-1">
            这些订单状态为「已取消」但未提供取消原因，需要您手动审批
          </p>
        </div>
        <button
          onClick={fetchReviewOrders}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 提示条 */}
      {orders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              共 {orders.length} 条订单需要人工审核
            </p>
            <p className="text-xs text-amber-600 mt-1">
              这些订单在平台侧已被取消，但由于 API 未返回取消原因，需要您在本页面手动确认批准或拒绝。
            </p>
          </div>
        </div>
      )}

      {/* 审核列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">平台</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">订单号</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">佣金</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">下单日期</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">产品</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">标记原因</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    加载中...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-gray-500">所有订单已处理完毕 🎉</p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                        {PLATFORM_LABELS[order.platform] || order.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">
                      {order.platformOrderId}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(order.commissionUsd, "USD")}
                      </span>
                      <br />
                      <span className="text-xs text-gray-400">
                        {formatCurrency(order.commissionRmb, "RMB")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(order.orderDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate">
                      {order.productName || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                        {order.manualReviewReason || "需人工审核"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {showDeclineInput === order.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="填写取消原因..."
                            value={declineReasons[order.id] || ""}
                            onChange={(e) =>
                              setDeclineReasons((prev) => ({
                                ...prev,
                                [order.id]: e.target.value,
                              }))
                            }
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-red-200"
                            autoFocus
                          />
                          <button
                            onClick={() => handleAction(order.id, "DECLINE")}
                            disabled={actionLoading === order.id}
                            className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 disabled:opacity-50"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setShowDeclineInput(null)}
                            className="px-3 py-1.5 border border-gray-200 text-xs rounded-lg hover:bg-gray-100"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAction(order.id, "APPROVE")}
                            disabled={actionLoading === order.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle className="w-3 h-3" />
                            {actionLoading === order.id ? "处理中..." : "批准"}
                          </button>
                          <button
                            onClick={() => setShowDeclineInput(order.id)}
                            disabled={actionLoading === order.id}
                            className="flex items-center gap-1 px-3 py-1.5 border border-red-200 text-red-600 text-xs rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            <XCircle className="w-3 h-3" />
                            拒绝
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
