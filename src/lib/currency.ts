import { prisma } from "@/lib/prisma";

// 实时汇率缓存
let rateCache: { usdToRmb: number; updatedAt: number } | null = null;
const CACHE_TTL = 1000 * 60 * 60; // 1 小时

export async function getUsdToRmbRate(): Promise<number> {
  if (rateCache && Date.now() - rateCache.updatedAt < CACHE_TTL) {
    return rateCache.usdToRmb;
  }

  try {
    // 使用 exchangerate-api.com 免费接口
    const apiKey = process.env.EXCHANGE_RATE_API_KEY || "";
    const url = apiKey
      ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
      : "https://open.er-api.com/v6/latest/USD"; // 免费备用接口

    const res = await fetch(url);
    const data = await res.json();
    const rate = data.rates?.CNY || 7.25;

    rateCache = { usdToRmb: rate, updatedAt: Date.now() };
    return rate;
  } catch {
    // 失败时使用默认汇率
    return 7.25;
  }
}

export async function convertToUsd(amount: number, currency: string): Promise<number> {
  // 简化货币转换：假设非 USD 的币种通过 USD 中转
  const rates: Record<string, number> = {
    USD: 1,
    EUR: 1.08,
    GBP: 1.27,
    AUD: 0.66,
    CAD: 0.73,
  };
  const rate = rates[currency] || 1;
  return amount * rate;
}

export async function convertToRmb(amountUsd: number): Promise<number> {
  const rate = await getUsdToRmbRate();
  return amountUsd * rate;
}
