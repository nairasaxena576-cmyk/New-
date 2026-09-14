import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Users,
  DollarSign,
  Clock,
  ArrowDownToLine,
  CheckCircle2,
  ShoppingCart,
  Coins,
  Megaphone,
  Activity,
  ArrowUpRight,
  Package,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import {
  NexCard,
  NexCardHeader,
  NexCardTitle,
  NexCardContent,
  NexBadge,
} from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { supabase } from '@/lib/supabase/client';
import {
  fetchDashboardStats,
  fetchActivityLogs,
  type DashboardStats,
  type ActivityLogRow,
} from '@/lib/supabase/deposits';

interface KpiConfig {
  key: keyof DashboardStats;
  label: string;
  icon: React.ElementType;
  tint: string;
  isCurrency: boolean;
}

const kpis: KpiConfig[] = [
  {
    key: 'total_users',
    label: 'Total Users',
    icon: Users,
    tint: 'from-primary/15 to-primary/5 text-primary',
    isCurrency: false,
  },
  {
    key: 'total_balance',
    label: 'Total Platform Balance',
    icon: DollarSign,
    tint: 'from-success/15 to-success/5 text-success',
    isCurrency: true,
  },
  {
    key: 'pending_deposits',
    label: 'Pending Deposits',
    icon: Clock,
    tint: 'from-warning/15 to-warning/5 text-warning',
    isCurrency: false,
  },
  {
    key: 'pending_withdrawals',
    label: 'Pending Withdrawals',
    icon: ArrowDownToLine,
    tint: 'from-warning/15 to-warning/5 text-warning',
    isCurrency: false,
  },
  {
    key: 'total_deposits_approved',
    label: 'Approved Deposits Total',
    icon: CheckCircle2,
    tint: 'from-success/15 to-success/5 text-success',
    isCurrency: true,
  },
  {
    key: 'total_withdrawals_approved',
    label: 'Approved Withdrawals Total',
    icon: ArrowDownToLine,
    tint: 'from-danger/15 to-danger/5 text-danger',
    isCurrency: true,
  },
  {
    key: 'total_orders',
    label: 'Total Orders',
    icon: ShoppingCart,
    tint: 'from-secondary/15 to-secondary/5 text-secondary',
    isCurrency: false,
  },
  {
    key: 'total_commission',
    label: 'Total Growth Credit',
    icon: Coins,
    tint: 'from-primary/15 to-primary/5 text-primary',
    isCurrency: true,
  },
];

const quickActions = [
  {
    to: '/admin/deposits',
    label: 'Manage Deposits',
    description: 'Review pending deposit requests',
    icon: ArrowDownToLine,
    tint: 'from-warning/15 to-warning/5 text-warning',
  },
  {
    to: '/admin/withdrawals',
    label: 'Manage Withdrawals',
    description: 'Approve or reject withdrawals',
    icon: ArrowUpRight,
    tint: 'from-danger/15 to-danger/5 text-danger',
  },
  {
    to: '/admin/products',
    label: 'Manage Services',
    description: 'Organize your digital service offering',
    icon: Package,
    tint: 'from-primary/15 to-primary/5 text-primary',
  },
];

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard stats';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const data = await fetchActivityLogs(8);
      setActivity(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load activity logs';
      toast.error(message);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadActivity();
  }, [loadStats, loadActivity]);

  // Realtime: refresh stats whenever key tables change.
  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deposits' },
        () => {
          loadStats();
          loadActivity();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawals' },
        () => {
          loadStats();
          loadActivity();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadStats();
          loadActivity();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        () => {
          loadStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStats, loadActivity]);

  const activeAnnouncements = stats?.active_announcements ?? 0;
  const totalProducts = stats?.total_products ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Platform overview and operational metrics."
        action={<NexBadge variant="success" dot>Live</NexBadge>}
      />

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          const raw = stats ? stats[k.key] : null;
          const displayValue =
            raw === null || raw === undefined
              ? '—'
              : k.isCurrency
                ? `$${formatCurrency(Number(raw))}`
                : Number(raw).toLocaleString('en-US');
          return (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <NexCard className="h-full p-5">
                <div className="flex items-start justify-between">
                  <div
                    className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${k.tint}`}
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
                  {displayValue}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{k.label}</p>
              </NexCard>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent activity */}
        <NexCard className="lg:col-span-2">
          <NexCardHeader>
            <div className="flex items-center justify-between">
              <NexCardTitle>Recent Activity</NexCardTitle>
              <NexBadge variant="muted" dot={!activityLoading}>
                {activityLoading ? 'Loading' : 'Live'}
              </NexBadge>
            </div>
          </NexCardHeader>
          <NexCardContent>
            {activityLoading && activity.length === 0 ? (
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
                  </div>
                ))}
              </div>
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
                  <Activity className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground">
                  Admin actions will appear here in real time.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {activity.map((row, idx) => (
                  <motion.li
                    key={row.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3 transition-colors hover:border-primary/20 hover:bg-accent/30"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                      <Activity className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        <span className="text-primary">{row.actor}</span>
                        <span className="text-muted-foreground"> · {row.action}</span>
                      </p>
                      {row.details && (
                        <p className="truncate text-xs text-muted-foreground">
                          {row.details}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(row.created_at)}
                    </span>
                  </motion.li>
                ))}
              </ul>
            )}
          </NexCardContent>
        </NexCard>

        {/* Quick actions + secondary stats */}
        <div className="space-y-4">
          <NexCard>
            <NexCardHeader>
              <NexCardTitle>Quick Actions</NexCardTitle>
            </NexCardHeader>
            <NexCardContent className="space-y-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.to} to={action.to} className="block">
                    <div className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-sm">
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${action.tint}`}
                      >
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {action.label}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {action.description}
                        </p>
                      </div>
                      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                    </div>
                  </Link>
                );
              })}
              <NexButton asChild variant="outline" className="w-full" leftIcon={<Megaphone className="size-4" />}>
                <Link to="/admin/settings">Announcements &amp; Settings</Link>
              </NexButton>
            </NexCardContent>
          </NexCard>

          <NexCard>
            <NexCardHeader>
              <NexCardTitle>Content</NexCardTitle>
            </NexCardHeader>
            <NexCardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-warning/15 to-warning/5 text-warning">
                    <Megaphone className="size-4" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Active Announcements</span>
                </div>
                <NexBadge variant="warning">{activeAnnouncements}</NexBadge>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                    <Package className="size-4" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Total Services</span>
                </div>
                <NexBadge variant="default">{totalProducts}</NexBadge>
              </div>
            </NexCardContent>
          </NexCard>
        </div>
      </div>
    </div>
  );
}
