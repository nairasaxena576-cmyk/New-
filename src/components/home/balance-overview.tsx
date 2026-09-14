import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Coins,
  CalendarDays,
  Crown,
  Eye,
  EyeOff,
  RefreshCw,
  Wallet,
  Banknote,
  Rocket,
  Headphones,
  type LucideIcon,
} from 'lucide-react';
import { useCounter } from '@/lib/hooks/use-counter';
import { cn } from '@/lib/utils';

interface BalanceOverviewProps {
  balance: number;
  lifetimeCommission: number;
  todayCommission: number;
  vipLevel: number;
}

function AnimatedValue({
  value,
  prefix = '',
  decimals = 0,
  className,
}: {
  value: number;
  prefix?: string;
  decimals?: number;
  className?: string;
}) {
  const { value: animated, ref } = useCounter(value, { decimals });
  return (
    <span ref={ref} className={className}>
      {prefix}
      {animated.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

const quickActions: {
  label: string;
  icon: LucideIcon;
  href: string;
  tint: string;
  ring: string;
}[] = [
  { label: 'Recharge', icon: Wallet, href: '/recharge', tint: 'bg-violet-100 text-violet-600', ring: 'hover:border-violet-300' },
  { label: 'Withdrawal', icon: Banknote, href: '/withdrawal', tint: 'bg-teal-100 text-teal-600', ring: 'hover:border-teal-300' },
  { label: 'Start', icon: Rocket, href: '/start', tint: 'bg-pink-100 text-pink-600', ring: 'hover:border-pink-300' },
  { label: 'Service', icon: Headphones, href: '/service', tint: 'bg-amber-100 text-amber-600', ring: 'hover:border-amber-300' },
];

export function BalanceOverview({
  balance,
  lifetimeCommission,
  todayCommission,
  vipLevel,
}: BalanceOverviewProps) {
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }

  const trendPct = useMemo(() => {
    if (lifetimeCommission <= 0) return 0;
    const pct = (todayCommission / lifetimeCommission) * 100;
    return Math.min(Math.round(pct * 10) / 10, 100);
  }, [lifetimeCommission, todayCommission]);

  const stats = [
    {
      icon: Coins,
      label: 'Lifetime Growth Credit',
      value: lifetimeCommission,
      prefix: '$',
      decimals: 2,
      tint: 'bg-violet-50 text-violet-600',
    },
    {
      icon: CalendarDays,
      label: "Today's Growth Credit",
      value: todayCommission,
      prefix: '$',
      decimals: 2,
      tint: 'bg-teal-50 text-teal-600',
    },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* Balance card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="lg:col-span-3"
      >
        <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-violet-600 to-purple-700 p-6 shadow-lg sm:p-8">
          <div className="absolute -right-16 -top-16 size-52 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 left-8 size-40 rounded-full bg-pink-400/15 blur-3xl" />

          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  Wallet
                </span>
                <span className="flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  <Crown className="size-3.5" />
                  VIP{vipLevel}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setHidden((h) => !h)}
                  className="flex size-8 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25"
                  aria-label={hidden ? 'Show balance' : 'Hide balance'}
                >
                  {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <button
                  onClick={handleRefresh}
                  className="flex size-8 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25"
                  aria-label="Refresh balance"
                >
                  <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                </button>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-medium text-white/70">Current Balance</p>
              <div className="mt-1 text-4xl font-bold tracking-tight text-white sm:text-5xl">
                {hidden ? '••••••' : <AnimatedValue value={balance} prefix="$" decimals={2} />}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {stats.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <div className={cn('flex size-7 items-center justify-center rounded-lg', row.tint)}>
                        <Icon className="size-3.5" />
                      </div>
                      <p className="text-[11px] font-medium leading-tight text-white/70">
                        {row.label}
                      </p>
                    </div>
                    <p className="mt-2 text-lg font-bold text-white sm:text-xl">
                      {hidden ? '••••' : <AnimatedValue value={row.value} prefix={row.prefix} decimals={row.decimals} />}
                    </p>
                  </div>
                );
              })}
            </div>

            {trendPct > 0 && (
              <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-white/80">
                <TrendingUp className="size-3.5" />
                <span>+{trendPct}% growth today</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="lg:col-span-2"
      >
        <div className="flex h-full flex-col rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm font-bold text-slate-800">Quick Actions</p>
          <div className="grid flex-1 grid-cols-2 gap-3">
            {quickActions.map((action, i) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(action.href)}
                  className={cn(
                    'flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 transition-all duration-200 hover:shadow-sm',
                    action.ring
                  )}
                >
                  <div className={cn('flex size-12 items-center justify-center rounded-xl', action.tint)}>
                    <Icon className="size-6" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{action.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
