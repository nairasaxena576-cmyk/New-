import { motion } from 'framer-motion';
import {
  Wallet,
  Crown,
  CheckCircle2,
  Clock,
  Coins,
  TrendingUp,
  AlertTriangle,
  Snowflake,
} from 'lucide-react';
import { AnimatedNumber } from '@/components/start/animated-number';
import { cn } from '@/lib/utils';
import { getRemainingTasks } from '@/lib/start/helpers';

interface StatusCardProps {
  balance: number;
  frozenAmount: number;
  vipLevel: number;
  completedToday: number;
  dailyLimit: number;
  todayCommission: number;
  lifetimeCommission: number;
}

interface Metric {
  icon: typeof Wallet;
  label: string;
  value: number;
  prefix?: string;
  decimals?: number;
  suffix?: string;
  tint: string;
  delay: number;
}

export function StatusCard({
  balance,
  frozenAmount,
  vipLevel,
  completedToday,
  dailyLimit,
  todayCommission,
  lifetimeCommission,
}: StatusCardProps) {
  const remaining = getRemainingTasks(completedToday, dailyLimit);
  const hasFrozen = frozenAmount > 0;
  const isNegative = balance < 0;

  const metrics: Metric[] = [
    {
      icon: Wallet,
      label: 'Available Balance',
      value: balance,
      prefix: '$',
      decimals: 2,
      tint: isNegative ? 'from-danger to-danger' : 'from-primary to-secondary',
      delay: 0,
    },
    {
      icon: Snowflake,
      label: 'Frozen Amount',
      value: frozenAmount,
      prefix: '$',
      decimals: 2,
      tint: hasFrozen ? 'from-danger to-danger' : 'from-secondary to-secondary',
      delay: 0.03,
    },
    {
      icon: Crown,
      label: 'VIP Level',
      value: vipLevel,
      prefix: 'VIP',
      tint: 'from-warning to-warning',
      delay: 0.05,
    },
    {
      icon: CheckCircle2,
      label: "Today's Completed",
      value: completedToday,
      tint: 'from-success to-success',
      delay: 0.1,
    },
    {
      icon: Clock,
      label: 'Remaining Orders',
      value: remaining,
      tint: 'from-secondary to-primary',
      delay: 0.15,
    },
    {
      icon: Coins,
      label: "Today's Growth Credit",
      value: todayCommission,
      prefix: '$',
      decimals: 2,
      tint: 'from-success to-primary',
      delay: 0.2,
    },
    {
      icon: TrendingUp,
      label: 'Lifetime Growth Credit',
      value: lifetimeCommission,
      prefix: '$',
      decimals: 2,
      tint: 'from-primary to-secondary',
      delay: 0.25,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: m.delay }}
            >
              <div className="relative h-full overflow-hidden rounded-[18px] border border-border bg-card p-4 shadow-card sm:p-5">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm sm:size-10',
                      m.tint
                    )}
                  >
                    <Icon className="size-4 sm:size-5" />
                  </div>
                  <span className="text-[11px] font-semibold leading-tight text-muted-foreground sm:text-xs">
                    {m.label}
                  </span>
                </div>
                <p
                  className={cn(
                    'mt-3 text-xl font-bold tracking-tight sm:text-2xl',
                    (m.label === 'Frozen Amount' && hasFrozen) ||
                    (m.label === 'Available Balance' && isNegative)
                      ? 'text-danger'
                      : 'text-foreground'
                  )}
                >
                  <AnimatedNumber
                    value={m.value}
                    prefix={m.prefix}
                    suffix={m.suffix}
                    decimals={m.decimals ?? 0}
                  />
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {hasFrozen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
            <AlertTriangle className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-danger">
              {isNegative ? 'Negative Balance' : 'Pending Order'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isNegative
                ? `Deposit $${Math.abs(balance).toFixed(2)} to continue your pending order.`
                : 'You have a pending order waiting to be completed.'}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

interface TaskProgressProps {
  completed: number;
  total: number;
}

export function TaskProgress({ completed, total }: TaskProgressProps) {
  const percent = total > 0 ? Math.min((completed / total) * 100, 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="rounded-[18px] border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-foreground">
            Today's Tasks
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Keep going to maximize your daily commission
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold tracking-tight text-primary">
            {completed}
          </span>
          <span className="text-base font-semibold text-muted-foreground">
            {' '}
            / {total}
          </span>
        </div>
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="relative h-full rounded-full bg-gradient-to-r from-primary to-secondary"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="absolute inset-0 rounded-full bg-white/25"
            animate={{ x: ['-100%', '200%'] }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              ease: 'easeInOut',
              repeatDelay: 0.4,
            }}
          />
        </motion.div>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">Completed Orders</span>
        <span className="font-semibold text-foreground">
          {percent.toFixed(0)}%
        </span>
      </div>
    </motion.div>
  );
}
