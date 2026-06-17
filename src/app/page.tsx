"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface DashboardData {
  totalOrders: number;
  pendingCount: number;
  approvedCount: number;
  declinedCount: number;
  pendingCommissionUsd: number;
  pendingCommissionRmb: number;
  totalCommissionUsd: number;
  totalCommissionRmb: number;
  statusBreakdown: Record<string, { count: number; commissionUsd: number; commissionRmb: number }>;
  platformStats: { platform: string; total: number; commissionUsd: number }[];
  dailyStats: { date: string; count: number; commissionUsd: number }[];
  needsReviewCount: number;
  lastSyncLogs?: { platform: string; status: string; startedAt: string }[];
}

const PLATFORM_LABELS: Record<string, string> = {
  AWIN: "Awin",
  IMPACT: "Impact",
  LEADDYNO: "LeadDyno",
  GOAFFPRO: "GoAffPro",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  APPROVED: "#10b981",
  DECLINED: "#ef4444",
};

const PIECHART_COLORS = ["#f59e0b", "#10b981", "#ef4444"];

function formatNum(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/orders/stats");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-gray-500">
        无法加载数据，请确保数据库已配置
      </div>
    );
  }

  const pieData = [
    { name: "待处理", value: data.pendingCount },
    { name: "已批准", value: data.approvedCount },
    { name: "已取消", value: data.declinedCount },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">总览看板</h2>
          <p className="text-sm text-gray-500 mt-1">实时监控所有联盟平台交易数据</p>
        </div>
        {data.needsReviewCount > 0 && (
          <a
            href="/review"
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            {data.needsReviewCount} 条待审核
          </a>
        )}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="总交易数"
          value={data.totalOrders.toLocaleString()}
          icon={TrendingUp}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          label="待处理 (Pending)"
          value={data.pendingCount.toLocaleString()}
          sub={`$${formatNum(data.pendingCommissionUsd)}`}
          icon={Clock}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <StatCard
          label="已批准 (Approved)"
          value={data.approvedCount.toLocaleString()}
          icon={CheckCircle2}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          label="已取消 (Declined)"
          value={data.declinedCount.toLocaleString()}
          icon={XCircle}
          color="text-red-600"
          bg="bg-red-50"
        />
      </div>

      {/* Pending 佣金汇总 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-amber-500" />
            <span className="text-sm text-gray-500">Pending 佣金（美元）</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ${formatNum(data.pendingCommissionUsd)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-amber-500" />
            <span className="text-sm text-gray-500">Pending 佣金（人民币）</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ¥{formatNum(data.pendingCommissionRmb)}
          </p>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 按平台分布 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            各平台交易分布
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.platformStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="platform"
                tickFormatter={(v) => PLATFORM_LABELS[v] || v}
                fontSize={12}
              />
              <YAxis fontSize={12} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  name === "commissionUsd"
                    ? `$${formatNum(value)}`
                    : value.toLocaleString(),
                  name === "commissionUsd" ? "佣金(USD)" : "订单数",
                ]}
                labelFormatter={(label) => PLATFORM_LABELS[label] || label}
              />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="订单数" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 状态占比 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            订单状态占比
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                cx="50%"
                cy="50%"
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIECHART_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 近30天趋势 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          近 30 天交易趋势
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data.dailyStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              fontSize={12}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis fontSize={12} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="订单数"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}
