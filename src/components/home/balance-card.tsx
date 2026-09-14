import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Eye, EyeOff, TrendingUp, Coins, CalendarDays, Crown } from 'lucide-react';
import { useCounter } from '@/lib/hooks/use-counter';
import { cn } from '@/lib/utils';

interface BalanceCardProps {
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

export function BalanceCard({
  balance,
  lifetimeCommission,
  todayCommission,
  vipLevel,
}: BalanceCardProps) {
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 900);
  }

  const rows = [
    {
      icon: Coins,
      label: 'Lifetime Growth Credit',
      value: lifetimeCommission,
      prefix: '$',
      decimals: 2,
      tint: 'bg-primary/15 text-primary',
    },
    {
      icon: CalendarDays,
      label: "Today's Growth Credit",
      value: todayCommission,
      prefix: '$',
      decimals: 2,
      tint: 'bg-success/15 text-success',
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-secondary p-5 shadow-pop sm:p-6">
      {/* Decorative elements */}
      <div className="absolute -right-12 -top-12 size-44 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-16 left-10 size-36 rounded-full bg-white/5 blur-2xl" />

      <div className="relative">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              Wallet
            </span>
            <span className="flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
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

        {/* Balance */}
        <div className="mt-5">
          <p className="text-sm font-medium text-white/70">Current Balance</p>
          <AnimatePresence mode="wait">
            {hidden ? (
              <motion.p
                key="hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl"
              >
                ••••••
              </motion.p>
            ) : (
              <motion.div
                key="visible"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl"
              >
                <AnimatedValue value={balance} prefix="$" decimals={2} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Commission rows */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div
                key={row.label}
                className="rounded-xl bg-white/10 p-3 backdrop-blur-sm"
              >
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

        {/* Trend indicator */}
        <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-white/80">
          <TrendingUp className="size-3.5" />
          <span>+12.5% from last week</span>
        </div>
      </div>
    </div>
  );
}
