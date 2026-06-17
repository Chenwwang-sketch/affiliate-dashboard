"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Filter, ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  OrderRow,
  PLATFORM_HEADERS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export default function TransactionsPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, pageSize: 20, totalCount: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchOrders = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (platformFilter !== "ALL") params.set("platform", platformFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      setOrders(data.orders);
      setPagination(data.pagination);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, platformFilter, searchQuery, startDate, endDate]);

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  // 动态表头：根据选中平台，合并所有平台表头
  const visibleHeaders = () => {
    let headers = PLATFORM_HEADERS["AWIN"]; // 默认
    if (platformFilter !== "ALL") {
      headers = PLATFORM_HEADERS[platformFilter] || PLATFORM_HEADERS["AWIN"];
    } else {
      // 所有平台：并集
      const allHeaders = new Set<string>();
      Object.values(PLATFORM_HEADERS).forEach((h) => h.forEach((x) => allHeaders.add(x)));
      headers = Array.from(allHeaders);
    }
    // 如果有 declined 状态订单，确保「取消原因」列存在
    if (statusFilter === "DECLINED" || orders.some((o) => o.status === "DECLINED")) {
      if (!headers.includes("取消原因")) headers.push("取消原因");
    }
    return headers;
  };

  const exportCSV = () => {
    const headers = ["平台", "平台订单号", "状态", "佣金(USD)", "佣金(RMB)", "销售额", "下单日期", "产品名称", "客户名称", "取消原因"];
    const rows = orders.map((o) => [
      PLATFORM_LABELS[o.platform] || o.platform,
      o.platformOrderId,
      STATUS_LABELS[o.status] || o.status,
      formatCurrency(o.commissionUsd, "USD"),
      formatCurrency(o.commissionRmb, "RMB"),
      o.saleAmount ? formatCurrency(o.saleAmount) : "",
      formatDate(o.orderDate),
      o.productName || "",
      o.customerName || "",
      o.declineReason || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">交易明细</h2>
          <p className="text-sm text-gray-500 mt-1">
            共 {pagination.totalCount.toLocaleString()} 条记录
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          导出 CSV
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 搜索 */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索订单号/产品/客户..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* 状态下拉 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">全部状态</option>
            <option value="PENDING">待处理</option>
            <option value="APPROVED">已批准</option>
            <option value="DECLINED">已取消</option>
          </select>

          {/* 平台下拉 */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">全部平台</option>
            <option value="AWIN">Awin</option>
            <option value="IMPACT">Impact</option>
            <option value="LEADDYNO">LeadDyno</option>
            <option value="GOAFFPRO">GoAffPro</option>
          </select>

          {/* 日期 */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {visibleHeaders().map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    加载中...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isDeclined = order.status === "DECLINED";
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                          {PLATFORM_LABELS[order.platform] || order.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                        {order.platformOrderId}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex text-xs px-2 py-0.5 rounded-full font-medium",
                            STATUS_COLORS[order.status]
                          )}
                        >
                          {STATUS_LABELS[order.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="font-medium text-gray-900">
                          {formatCurrency(order.commissionUsd, "USD")}
                        </span>
                        <br />
                        <span className="text-xs text-gray-400">
                          {formatCurrency(order.commissionRmb, "RMB")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {order.saleAmount
                          ? formatCurrency(order.saleAmount, order.saleCurrency || "USD")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(order.orderDate)}
                      </td>
                      {order.clickDate && (
                        <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                          {formatDate(order.clickDate)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                        {order.productName || "-"}
                      </td>
                      {order.productSku && (
                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                          {order.productSku}
                        </td>
                      )}
                      {order.customerName && (
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {order.customerName}
                        </td>
                      )}
                      {order.customerEmail && (
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {order.customerEmail}
                        </td>
                      )}
                      {isDeclined && (
                        <td className="px-4 py-3 text-sm">
                          {order.declineReason ? (
                            <span className="text-red-600">{order.declineReason}</span>
                          ) : (
                            <span className="text-amber-500 italic">未提供原因</span>
                          )}
                        </td>
                      )}
                      {order.orderUrl && (
                        <td className="px-4 py-3">
                          <a
                            href={order.orderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary text-xs hover:underline"
                          >
                            查看
                          </a>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-500">
              第 {pagination.page} 页，共 {pagination.totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchOrders(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => fetchOrders(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
