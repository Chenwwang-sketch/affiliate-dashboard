"use client";

import { useEffect, useState } from "react";
import { Save, Key, Globe, CheckCircle2, XCircle, RefreshCw, Clock } from "lucide-react";

interface PlatformConfig {
  id: string;
  platform: string;
  apiKey: string | null;
  accountId: string | null;
  isActive: boolean;
  hasApiSecret: boolean;
  updatedAt: string;
}

const PLATFORM_INFO: Record<string, { label: string; color: string; fields: { key: string; label: string; type: string; placeholder: string }[] }> = {
  AWIN: {
    label: "Awin",
    color: "bg-indigo-500",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "输入 Awin Publisher API Token" },
      { key: "accountId", label: "Publisher ID", type: "text", placeholder: "输入 Publisher ID" },
    ],
  },
  IMPACT: {
    label: "Impact",
    color: "bg-blue-500",
    fields: [
      { key: "apiKey", label: "Account SID", type: "text", placeholder: "输入 Impact Account SID" },
      { key: "apiSecret", label: "Auth Token", type: "password", placeholder: "输入 Impact Auth Token" },
      { key: "accountId", label: "Campaign ID", type: "text", placeholder: "输入 Campaign ID（可选）" },
    ],
  },
  LEADDYNO: {
    label: "LeadDyno",
    color: "bg-emerald-500",
    fields: [
      { key: "apiKey", label: "API Token", type: "password", placeholder: "输入 LeadDyno API Token" },
      { key: "accountId", label: "Public Key", type: "text", placeholder: "输入 Public Key" },
    ],
  },
  GOAFFPRO: {
    label: "GoAffPro",
    color: "bg-purple-500",
    fields: [
      { key: "apiKey", label: "API Token", type: "password", placeholder: "输入 GoAffPro API Token" },
      { key: "accountId", label: "Base URL", type: "text", placeholder: "输入 API Base URL（可选）" },
    ],
  },
};

export default function SettingsPage() {
  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  useEffect(() => {
    fetchConfigs();
    fetchSyncLogs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setConfigs(data.configs);
      // 初始化表单数据
      const init: Record<string, Record<string, string>> = {};
      data.configs.forEach((c: PlatformConfig) => {
        init[c.platform] = { accountId: c.accountId || "" };
      });
      setFormData(init);
    } catch (err) {
      console.error("Failed to fetch configs:", err);
    }
  };

  const fetchSyncLogs = async () => {
    try {
      const res = await fetch("/api/sync");
      const data = await res.json();
      setSyncLogs(data.logs || []);
    } catch {}
  };

  const handleSave = async (platform: string) => {
    setSaving(platform);
    try {
      const payload: any = { platform };
      const fields = PLATFORM_INFO[platform]?.fields || [];
      for (const field of fields) {
        const value = formData[platform]?.[field.key];
        if (value) {
          payload[field.key === "apiSecret" ? "apiSecret" : field.key === "accountId" ? "accountId" : "apiKey"] = value;
        }
      }
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await fetchConfigs();
      alert("保存成功");
    } catch {
      alert("保存失败");
    } finally {
      setSaving(null);
    }
  };

  const handleSync = async (platform: string) => {
    try {
      const res = await fetch(`/api/sync/${platform.toLowerCase()}`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        alert(`同步失败: ${data.error}`);
      } else {
        alert(`同步完成！发现 ${data.found} 条，新增 ${data.newCount} 条，更新 ${data.updatedCount} 条`);
        fetchSyncLogs();
      }
    } catch {
      alert("同步失败");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">系统设置</h2>
        <p className="text-sm text-gray-500 mt-1">配置各平台 API 密钥与同步参数</p>
      </div>

      {/* 平台配置 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(PLATFORM_INFO).map(([platform, info]) => {
          const config = configs.find((c) => c.platform === platform);
          return (
            <div
              key={platform}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              {/* 平台头部 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 ${info.color} rounded-lg flex items-center justify-center`}>
                    <Globe className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{info.label}</h3>
                    <p className="text-xs text-gray-400">{platform}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  config?.isActive
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-gray-100 text-gray-400"
                }`}>
                  {config?.isActive ? "已配置" : "未配置"}
                </span>
              </div>

              {/* 配置表单 */}
              <div className="p-5 space-y-4">
                {info.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      value={formData[platform]?.[field.key] || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          [platform]: { ...prev[platform], [field.key]: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                    {config && field.key === "apiKey" && config.apiKey && (
                      <p className="text-xs text-gray-400 mt-1">
                        当前: {config.apiKey}
                      </p>
                    )}
                  </div>
                ))}

                {/* 操作按钮 */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleSave(platform)}
                    disabled={saving === platform}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {saving === platform ? "保存中..." : "保存配置"}
                  </button>
                  <button
                    onClick={() => handleSync(platform)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    测试同步
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 同步日志 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">最近同步日志</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">平台</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">状态</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">发现</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">新增</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">更新</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">时间</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">信息</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {syncLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    暂无同步记录
                  </td>
                </tr>
              ) : (
                syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {PLATFORM_INFO[log.platform]?.label || log.platform}
                    </td>
                    <td className="px-4 py-3">
                      {log.status === "SUCCESS" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" /> 成功
                        </span>
                      ) : log.status === "RUNNING" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                          <RefreshCw className="w-3 h-3 animate-spin" /> 同步中
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="w-3 h-3" /> 失败
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.ordersFound}</td>
                    <td className="px-4 py-3 text-sm text-emerald-600">{log.ordersNew}</td>
                    <td className="px-4 py-3 text-sm text-blue-600">{log.ordersUpdated}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.startedAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[200px] truncate">
                      {log.message || "-"}
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
