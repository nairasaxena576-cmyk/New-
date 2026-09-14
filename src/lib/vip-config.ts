export interface VipConfig {
  level: number;
  name: string;
  dailyOrderLimit: number;
  commissionRate: number;
  minDeposit: number;
}

// Default fallback config — used until DB config is loaded
// minDeposit is now the minimum BALANCE required for each VIP tier
export const VIP_LEVELS: VipConfig[] = [
  { level: 0, name: 'VIP0', dailyOrderLimit: 38, commissionRate: 1, minDeposit: 10 },
  { level: 1, name: 'VIP1', dailyOrderLimit: 43, commissionRate: 1.5, minDeposit: 1000 },
  { level: 2, name: 'VIP2', dailyOrderLimit: 51, commissionRate: 2, minDeposit: 3000 },
  { level: 3, name: 'VIP3', dailyOrderLimit: 60, commissionRate: 2.5, minDeposit: 5000 },
];

// Runtime config — replaced by DB-fetched values at app startup
let runtimeConfig: VipConfig[] = VIP_LEVELS;

export function setRuntimeVipConfig(config: VipConfig[]): void {
  if (config.length > 0) {
    runtimeConfig = [...config].sort((a, b) => a.level - b.level);
  }
}

export function getRuntimeVipConfig(): VipConfig[] {
  return runtimeConfig;
}

const VIP_MAP: Record<number, VipConfig> = {};
function getMap(): Record<number, VipConfig> {
  return Object.fromEntries(runtimeConfig.map((v) => [v.level, v]));
}

export function getVipConfig(level: number): VipConfig {
  const map = getMap();
  return map[level] ?? runtimeConfig[0]!;
}

export function getVipName(level: number): string {
  return getVipConfig(level).name;
}

export function getVipDailyOrderLimit(level: number): number {
  return getVipConfig(level).dailyOrderLimit;
}

export function getVipCommissionRate(level: number): number {
  return getVipConfig(level).commissionRate;
}

/**
 * Derive VIP level from the user's CURRENT available balance.
 * Walks tiers from highest to lowest, returning the first whose
 * minDeposit (balance threshold) the balance meets.
 * Balances below $10 default to VIP 0.
 */
export function computeVipLevel(currentBalance: number): number {
  for (let i = runtimeConfig.length - 1; i >= 0; i--) {
    if (currentBalance >= runtimeConfig[i]!.minDeposit) {
      return runtimeConfig[i]!.level;
    }
  }
  return 0;
}

/**
 * Progress to the next VIP tier.
 * Returns null if already at the highest tier.
 */
export function getNextVipTier(level: number): VipConfig | null {
  const next = runtimeConfig.find((v) => v.level === level + 1);
  return next ?? null;
}
