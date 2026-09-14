import { motion } from 'framer-motion';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useCounter } from '@/lib/hooks/use-counter';
import type { HomeStat } from '@/lib/home/constants';
import { cn } from '@/lib/utils';

const iconMap: Record<string, LucideIcon> = {
  ClipboardList,
  CheckCircle2,
  Clock,
  Wallet,
};

interface StatisticsSectionProps {
  stats: HomeStat[];
}

function formatValue(stat: HomeStat, value: number): string {
  const decimals = stat.prefix === '$' ? 2 : 0;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function StatCard({ stat, index }: { stat: HomeStat; index: number }) {
  const Icon = iconMap[stat.icon] ?? ClipboardList;
  const { value, ref } = useCounter(stat.value, {
    decimals: stat.prefix === '$' ? 2 : 0,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/20"
    >
      <div className={cn('flex size-10 items-center justify-center rounded-xl bg-gradient-to-br', stat.tint)}>
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        <span ref={ref}>
          {stat.prefix}
          {formatValue(stat, value)}
          {stat.suffix}
        </span>
      </p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{stat.label}</p>
    </motion.div>
  );
}

export function StatisticsSection({ stats }: StatisticsSectionProps) {
  return (
    <section>
      <h2 className="mb-3 text-base font-bold tracking-tight text-foreground">
        Statistics
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <StatCard key={stat.id} stat={stat} index={i} />
        ))}
      </div>
    </section>
  );
}
