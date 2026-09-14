import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileBarChart, DollarSign, Coins, Wallet, ShoppingCart, TrendingUp, Download, Users, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchDashboardStats, fetchAllDeposits, fetchAllWithdrawals, fetchAllOrders, fetchAllUserProfiles, type DashboardStats, type DepositRow, type WithdrawalRow, type OrderRow, type UserProfileRow } from '@/lib/supabase/deposits';
import { computeVipLevel } from '@/lib/vip-config';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CombinedTx {
  id: string;
  type: 'Deposit' | 'Withdrawal';
  user_name: string;
  user_email: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

const statusVariant: Record<string, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminReportsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load report stats';
      toast.error(message);
    }
  }, []);

  const loadDeposits = useCallback(async () => {
    try {
      const data = await fetchAllDeposits();
      setDeposits(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load deposits';
      toast.error(message);
    }
  }, []);

  const loadWithdrawals = useCallback(async () => {
    try {
      const data = await fetchAllWithdrawals();
      setWithdrawals(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load withdrawals';
      toast.error(message);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchAllOrders();
      setOrders(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load orders';
      toast.error(message);
    }
  }, []);

  const loadUserProfiles = useCallback(async () => {
    try {
      const data = await fetchAllUserProfiles();
      setUserProfiles(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load user profiles';
      toast.error(message);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await Promise.all([
        loadStats(),
        loadDeposits(),
        loadWithdrawals(),
        loadOrders(),
        loadUserProfiles(),
      ]);
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [loadStats, loadDeposits, loadWithdrawals, loadOrders, loadUserProfiles]);

  // Realtime: refresh report data whenever key tables change.
  useEffect(() => {
    const channel = supabase
      .channel('admin-reports-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, () => {
        loadStats();
        loadDeposits();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, () => {
        loadStats();
        loadWithdrawals();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadStats();
        loadOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStats, loadDeposits, loadWithdrawals, loadOrders]);

  // ---- Derived report values ----
  const approvedDepositsTotal = useMemo(
    () =>
      deposits
        .filter((d) => d.status === 'approved')
        .reduce((sum, d) => sum + Number(d.amount), 0),
    [deposits]
  );

  const approvedWithdrawalsTotal = useMemo(
    () =>
      withdrawals
        .filter((w) => w.status === 'approved')
        .reduce((sum, w) => sum + Number(w.amount), 0),
    [withdrawals]
  );

  const totalRevenue = approvedDepositsTotal - approvedWithdrawalsTotal;
  const totalCommission = stats?.total_commission ?? 0;
  const netBalance = stats?.total_balance ?? 0;
  const totalOrders = stats?.total_orders ?? 0;

  const recentTransactions = useMemo<CombinedTx[]>(() => {
    const depositTxs: CombinedTx[] = deposits.map((d) => ({
      id: d.id,
      type: 'Deposit',
      user_name: d.user_name,
      user_email: d.user_email,
      amount: Number(d.amount),
      status: d.status,
      created_at: d.created_at,
    }));
    const withdrawalTxs: CombinedTx[] = withdrawals.map((w) => ({
      id: w.id,
      type: 'Withdrawal',
      user_name: w.user_name,
      user_email: w.user_email,
      amount: Number(w.amount),
      status: w.status,
      created_at: w.created_at,
    }));
    return [...depositTxs, ...withdrawalTxs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [deposits, withdrawals]);

  const topUsers = useMemo(
    () =>
      [...userProfiles]
        .sort(
          (a, b) => Number(b.lifetime_commission) - Number(a.lifetime_commission)
        )
        .slice(0, 5),
    [userProfiles]
  );

  // Bar chart scaling — proportional heights relative to the larger amount.
  const barMax = Math.max(approvedDepositsTotal, approvedWithdrawalsTotal, 1);
  const depositBarPct = Math.round((approvedDepositsTotal / barMax) * 100);
  const withdrawalBarPct = Math.round((approvedWithdrawalsTotal / barMax) * 100);

  const kpis = [
    {
      label: 'Total Revenue',
      value: `$${formatCurrency(totalRevenue)}`,
      icon: DollarSign,
      tint: 'from-success/15 to-success/5 text-success',
      hint: 'Approved deposits − withdrawals',
    },
    {
      label: 'Total Growth Credit Paid',
      value: `$${formatCurrency(totalCommission)}`,
      icon: Coins,
      tint: 'from-primary/15 to-primary/5 text-primary',
      hint: 'Lifetime commission earned',
    },
    {
      label: 'Net Balance',
      value: `$${formatCurrency(netBalance)}`,
      icon: Wallet,
      tint: 'from-secondary/15 to-secondary/5 text-secondary',
      hint: 'Total platform balance',
    },
    {
      label: 'Total Orders',
      value: totalOrders.toLocaleString('en-US'),
      icon: ShoppingCart,
      tint: 'from-warning/15 to-warning/5 text-warning',
      hint: 'All completed orders',
    },
  ];

  function handleExport() {
    toast.success('Report export started', {
      description: 'Your report is being prepared for download.',
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Financial and operational insights across the platform."
        action={
          <div className="flex items-center gap-2">
            <NexBadge variant="muted" dot>
              Last 30 days
            </NexBadge>
            <NexButton
              variant="outline"
              size="sm"
              onClick={handleExport}
              leftIcon={<Download className="size-4" />}
            >
              Export
            </NexButton>
          </div>
        }
      />

      {/* KPI summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
            >
              <NexCard className="h-full p-5">
                <div className="flex items-start justify-between">
                  <div
                    className={cn(
                      'flex size-11 items-center justify-center rounded-xl bg-gradient-to-br',
                      k.tint
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  {loading && (
                    <NexBadge variant="muted" size="sm">
                      loading
                    </NexBadge>
                  )}
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                  {k.value}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{k.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">{k.hint}</p>
              </NexCard>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Deposit vs Withdrawal bar chart */}
        <NexCard>
          <NexCardHeader>
            <div className="flex items-center justify-between">
              <NexCardTitle>Deposit vs Withdrawal</NexCardTitle>
              <NexBadge variant="default" size="sm">
                Approved Totals
              </NexBadge>
            </div>
          </NexCardHeader>
          <NexCardContent>
            <div className="space-y-5">
              {/* Bars */}
              <div
                className="flex items-end justify-center gap-10 sm:gap-16"
                style={{ height: '13rem' }}
              >
                {/* Deposits bar */}
                <div className="flex h-full w-24 flex-col items-center justify-end sm:w-28">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${depositBarPct}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="flex w-full items-start justify-center rounded-t-xl bg-gradient-to-t from-primary/70 to-primary pt-2"
                  >
                    <ArrowUp className="size-4 text-primary-foreground/90" />
                  </motion.div>
                </div>

                {/* Withdrawals bar */}
                <div className="flex h-full w-24 flex-col items-center justify-end sm:w-28">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${withdrawalBarPct}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="flex w-full items-start justify-center rounded-t-xl bg-gradient-to-t from-danger/70 to-danger pt-2"
                  >
                    <ArrowDown className="size-4 text-danger-foreground/90" />
                  </motion.div>
                </div>
              </div>

              {/* Labels + amounts */}
              <div className="flex justify-center gap-10 sm:gap-16">
                <div className="w-24 text-center sm:w-28">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-primary" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Deposits
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold text-foreground">
                    ${formatCurrency(approvedDepositsTotal)}
                  </p>
                </div>
                <div className="w-24 text-center sm:w-28">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-danger" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Withdrawals
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold text-foreground">
                    ${formatCurrency(approvedWithdrawalsTotal)}
                  </p>
                </div>
              </div>

              {/* Net summary */}
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Net Inflow
                  </span>
                </div>
                <span
                  className={cn(
                    'text-sm font-bold',
                    totalRevenue >= 0 ? 'text-success' : 'text-danger'
                  )}
                >
                  ${formatCurrency(totalRevenue)}
                </span>
              </div>
            </div>
          </NexCardContent>
        </NexCard>

        {/* Top Users by Commission */}
        <NexCard>
          <NexCardHeader>
            <div className="flex items-center justify-between">
              <NexCardTitle>Top Users by Commission</NexCardTitle>
              <NexBadge variant="secondary" size="sm" dot={!loading}>
                {loading ? 'Loading' : 'Live'}
              </NexBadge>
            </div>
          </NexCardHeader>
          <NexCardContent>
            {loading && topUsers.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-xl border border-border/60 p-3"
                  >
                    <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                      <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/70" />
                    </div>
                    <div className="h-6 w-16 animate-pulse rounded-lg bg-muted" />
                  </div>
                ))}
              </div>
            ) : topUsers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No users yet"
                description="Top earners by lifetime commission will appear here."
              />
            ) : (
              <ul className="space-y-2">
                {topUsers.map((user, idx) => {
                  const vipLevel = computeVipLevel(Number(user.total_deposits));
                  return (
                    <motion.li
                      key={user.user_id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3 transition-colors hover:border-primary/20 hover:bg-accent/30"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-bold text-primary">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {user.full_name || 'Unknown'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <NexBadge variant="outline" size="sm">
                          VIP{vipLevel}
                        </NexBadge>
                        <span className="text-sm font-bold text-success">
                          ${formatCurrency(Number(user.lifetime_commission))}
                        </span>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </NexCardContent>
        </NexCard>
      </div>

      {/* Recent Transactions */}
      <NexCard>
        <NexCardHeader>
          <div className="flex items-center justify-between">
            <NexCardTitle>Recent Transactions</NexCardTitle>
            <NexBadge variant="muted" size="sm">
              Last 10
            </NexBadge>
          </div>
        </NexCardHeader>
        <NexCardContent>
          {loading && recentTransactions.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentTransactions.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="No transactions yet"
              description="Recent deposits and withdrawals will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="py-3 pr-4 font-semibold">Type</th>
                    <th className="py-3 pr-4 font-semibold">User</th>
                    <th className="py-3 pr-4 text-right font-semibold">Amount</th>
                    <th className="py-3 pr-4 font-semibold">Status</th>
                    <th className="py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx, idx) => {
                    const isDeposit = tx.type === 'Deposit';
                    return (
                      <motion.tr
                        key={`${tx.type}-${tx.id}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.03 }}
                        className="border-b border-border/50 transition-colors last:border-0 hover:bg-accent/30"
                      >
                        <td className="py-3 pr-4">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold',
                              isDeposit
                                ? 'bg-primary/10 text-primary'
                                : 'bg-danger/10 text-danger'
                            )}
                          >
                            {isDeposit ? (
                              <ArrowUp className="size-3.5" />
                            ) : (
                              <ArrowDown className="size-3.5" />
                            )}
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-foreground">
                            {tx.user_name || 'Unknown'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {tx.user_email}
                          </p>
                        </td>
                        <td
                          className={cn(
                            'py-3 pr-4 text-right font-bold tabular-nums',
                            isDeposit ? 'text-success' : 'text-foreground'
                          )}
                        >
                          ${formatCurrency(tx.amount)}
                        </td>
                        <td className="py-3 pr-4">
                          <NexBadge variant={statusVariant[tx.status]} size="sm" dot>
                            {tx.status}
                          </NexBadge>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {formatDate(tx.created_at)}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </NexCardContent>
      </NexCard>
    </div>
  );
}
