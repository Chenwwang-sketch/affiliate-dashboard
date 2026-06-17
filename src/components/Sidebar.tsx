"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListOrdered,
  AlertTriangle,
  Settings,
  BarChart3,
  RefreshCw,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/",
    label: "总览看板",
    icon: LayoutDashboard,
  },
  {
    href: "/transactions",
    label: "交易明细",
    icon: ListOrdered,
  },
  {
    href: "/review",
    label: "人工审核",
    icon: AlertTriangle,
  },
  {
    href: "/settings",
    label: "系统设置",
    icon: Settings,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<Record<string, any> | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      setSyncResult(data.results || data);
      if (data.results) {
        const hasNew = Object.values(data.results).some((r: any) => r.newCount > 0);
        if (hasNew) window.location.reload();
      }
    } catch {
      setSyncResult({ error: "网络错误" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-gray-100">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-900">Affiliate</h1>
          <p className="text-xs text-gray-500">数据看板</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Sync Status */}
      <div className="p-3 border-t border-gray-100 space-y-2">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-500 hover:text-primary hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
          {syncing ? "同步中..." : "手动触发同步"}
        </button>
        {syncResult && !syncing && (
          <div className="text-xs space-y-0.5">
            {Object.entries(syncResult).map(([platform, result]: [string, any]) => {
              if (platform === "results") return null;
              const ok = result?.status === "SUCCESS" || result?.newCount > 0;
              return (
                <div key={platform} className="flex items-center gap-1 text-gray-500">
                  {ok ? (
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  <span>{platform}</span>
                  {result?.newCount > 0 && (
                    <span className="text-emerald-600">+{result.newCount}</span>
                  )}
                  {result?.error && (
                    <span className="text-red-400 truncate">{result.error}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
