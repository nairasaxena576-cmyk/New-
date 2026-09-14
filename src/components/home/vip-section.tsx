import { motion } from 'framer-motion';
import { Crown, Lock, TrendingUp, Wallet, Check } from 'lucide-react';
import type { VipTier } from '@/lib/home/constants';
import { NexBadge } from '@/components/ui/nex-badge';
import { cn } from '@/lib/utils';

interface VipSectionProps {
  tiers: VipTier[];
  currentLevel: number;
  currentBalance: number;
}

export function VipSection({ tiers, currentLevel, currentBalance }: VipSectionProps) {
  return (
    <section id="vip">
      <div className="mb-3 flex items-center gap-2">
        <Crown className="size-4 text-warning" />
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Growth Programs
        </h2>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Your VIP level is determined automatically by your current available balance.
        Recharge to unlock higher tiers.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiers.map((tier, i) => {
          const isCurrent = tier.level === currentLevel;
          const isUnlocked = currentBalance >= tier.minDeposit;
          return (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              whileHover={{ y: -4 }}
              className={cn(
                'relative overflow-hidden rounded-2xl border p-4 shadow-card transition-all',
                isCurrent ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/20'
              )}
            >
              {/* Gradient header strip */}
              <div className={cn('absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r', tier.gradient)} />

              <div className="flex items-center justify-between">
                <div className={cn('flex size-10 items-center justify-center rounded-xl bg-gradient-to-br text-white', tier.gradient)}>
                  <Crown className="size-5" />
                </div>
                <NexBadge variant={isCurrent ? 'default' : 'muted'} size="sm">
                  {isCurrent ? 'Current' : isUnlocked ? 'Unlocked' : 'Locked'}
                </NexBadge>
              </div>

              <p className={cn('mt-3 text-lg font-bold', tier.accent)}>{tier.name}</p>

              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Daily orders</dt>
                  <dd className="font-semibold text-foreground">{tier.dailyTasks}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Commission</dt>
                  <dd className="font-semibold text-foreground">{tier.commissionRate}%</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Lucky</dt>
                  <dd className="font-semibold text-foreground">5%–50%</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Deposit</dt>
                  <dd className="font-semibold text-foreground">
                    {tier.minDeposit === 0 ? 'Free' : `${tier.minDeposit.toLocaleString()}`}
                  </dd>
                </div>
              </dl>

              {/* Status indicator — display only, not clickable */}
              <div className="mt-4">
                {isCurrent ? (
                  <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2 text-xs font-bold text-primary">
                    <Check className="size-3.5" />
                    Current VIP
                  </div>
                ) : isUnlocked ? (
                  <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-success/10 py-2 text-xs font-bold text-success">
                    <Check className="size-3.5" />
                    Unlocked
                  </div>
                ) : (
                  <div className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-muted py-2 text-xs font-semibold text-muted-foreground">
                    <Lock className="size-3.5" />
                    Locked
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Balance progress summary */}
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wallet className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Current Balance</p>
          <p className="text-sm font-bold text-foreground">
            ${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
          <TrendingUp className="size-4" />
          {tiers.find((t) => t.level === currentLevel)?.name}
        </div>
      </div>
    </section>
  );
}
