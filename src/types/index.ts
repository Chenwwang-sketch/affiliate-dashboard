export interface OrderRow {
  id: string;
  platform: string;
  platformOrderId: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  commissionAmount: number;
  commissionCurrency: string;
  commissionUsd: number;
  commissionRmb: number;
  saleAmount: number | null;
  saleCurrency: string | null;
  orderDate: string;
  clickDate: string | null;
  customerName: string | null;
  customerEmail: string | null;
  productName: string | null;
  productSku: string | null;
  orderUrl: string | null;
  declineReason: string | null;
  needsManualReview: boolean;
  manualReviewReason: string | null;
  syncedAt: string;
}

export interface DashboardStats {
  totalOrders: number;
  pendingCount: number;
  approvedCount: number;
  declinedCount: number;
  pendingCommissionUsd: number;
  pendingCommissionRmb: number;
  totalCommissionUsd: number;
  totalCommissionRmb: number;
}

export interface PlatformStats {
  platform: string;
  total: number;
  pending: number;
  approved: number;
  declined: number;
  commissionUsd: number;
}

export interface SyncLogEntry {
  id: string;
  platform: string;
  status: string;
  message: string | null;
  ordersFound: number;
  ordersNew: number;
  ordersUpdated: number;
  startedAt: string;
  finishedAt: string | null;
}

export type Platform = "AWIN" | "IMPACT" | "LEADDYNO" | "GOAFFPRO";

// 各平台特有的表头字段映射
export const PLATFORM_HEADERS: Record<string, string[]> = {
  AWIN: [
    "订单号", "状态", "佣金金额", "销售额", "下单日期", "点击日期",
    "产品名称", "SKU", "广告主", "订单链接"
  ],
  IMPACT: [
    "订单号", "状态", "佣金金额", "销售额", "下单日期", "点击日期",
    "客户名称", "产品名称", "SKU", "品牌", "事件类型", "订单链接"
  ],
  LEADDYNO: [
    "订单号", "状态", "佣金金额", "销售额", "下单日期",
    "客户名称", "客户邮箱", "产品名称", "订单链接"
  ],
  GOAFFPRO: [
    "订单号", "状态", "佣金金额", "销售额", "下单日期",
    "客户名称", "客户邮箱", "产品名称", "优惠券", "订单链接"
  ],
};

export const PLATFORM_LABELS: Record<string, string> = {
  AWIN: "Awin",
  IMPACT: "Impact",
  LEADDYNO: "LeadDyno",
  GOAFFPRO: "GoAffPro",
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  APPROVED: "已批准",
  DECLINED: "已取消",
};

export const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-red-100 text-red-800",
};
