import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, Search, ChevronLeft, ChevronRight, Wallet, ArrowDownToLine, Package, Users, Crown, Megaphone, Loader2, Activity, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge } from '@/components/ui/nex';
import { NexInput } from '@/components/ui/nex-input';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchActivityLogs, type ActivityLogRow } from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'muted' | 'outline';

const PAGE_SIZE = 20;

interface TargetConfig {
  icon: LucideIcon;
  tint: string;
  bubble: string;
  label: string;
}

const TARGET_CONFIG: Record<string, TargetConfig> = {
  deposit: {
    icon: Wallet,
    tint: 'from-primary/10 to-primary/5 text-primary',
    bubble: 'bg-primary/10 text-primary border-primary/20',
    label: 'Deposit',
  },
  withdrawal: {
    icon: ArrowDownToLine,
    tint: 'from-warning/10 to-warning/5 text-warning',
    bubble: 'bg-warning/15 text-warning border-warning/20',
    label: 'Withdrawal',
  },
  product: {
    icon: Package,
    tint: 'from-secondary/10 to-secondary/5 text-secondary',
    bubble: 'bg-secondary/10 text-secondary border-secondary/20',
    label: 'Product',
  },
  user: {
    icon: Users,
    tint: 'from-success/10 to-success/5 text-success',
    bubble: 'bg-success/10 text-success border-success/20',
    label: 'User',
  },
  vip: {
    icon: Crown,
    tint: 'from-warning/10 to-warning/5 text-warning',
    bubble: 'bg-warning/15 text-warning border-warning/20',
    label: 'VIP',
  },
  announcement: {
    icon: Megaphone,
    tint: 'from-primary/10 to-primary/5 text-primary',
    bubble: 'bg-primary/10 text-primary border-primary/20',
    label: 'Announcement',
  },
};

const FALLBACK_CONFIG: TargetConfig = {
  icon: ScrollText,
  tint: 'from-muted to-muted/50 text-muted-foreground',
  bubble: 'bg-muted text-muted-foreground border-border',
  label: 'Other',
};

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'withdrawal', label: 'Withdrawal' },
  { id: 'product', label: 'Product' },
  { id: 'user', label: 'User' },
  { id: 'vip', label: 'VIP' },
  { id: 'announcement', label: 'Announcement' },
] as const;

type TargetFilter = (typeof FILTER_TABS)[number]['id'];

function getTargetConfig(targetType: string): TargetConfig {
  return TARGET_CONFIG[targetType] ?? FALLBACK_CONFIG;
}

function actionVariant(action: string): BadgeVariant {
  const a = action.toLowerCase();
  if (a.startsWith('approve')) return 'success';
  if (a.startsWith('reject')) return 'danger';
  if (a.startsWith('create')) return 'default';
  if (a.startsWith('update')) return 'secondary';
  if (a.startsWith('delete')) return 'danger';
  if (a.startsWith('toggle')) return 'warning';
  return 'muted';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [search, setSearch] = useState('');
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      const rows = await fetchActivityLogs(100);
      setLogs(rows);
    } catch {
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-activity-logs-page-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
        loadLogs();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLogs]);

  // Reset to first page whenever the filter or search changes
  useEffect(() => {
    setPage(1);
  }, [search, targetFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (targetFilter !== 'all' && log.target_type !== targetFilter) return false;
      if (!q) return true;
      return (
        log.actor.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.target_type.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q)
      );
    });
  }, [logs, search, targetFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  const kpis = useMemo(() => {
    const count = (type: string) => logs.filter((l) => l.target_type === type).length;
    return [
      {
        label: 'Total Logs',
        value: String(logs.length),
        icon: Activity,
        tint: 'from-primary/10 to-primary/5 text-primary',
      },
      {
        label: 'Deposits',
        value: String(count('deposit')),
        icon: Wallet,
        tint: 'from-success/10 to-success/5 text-success',
      },
      {
        label: 'Withdrawals',
        value: String(count('withdrawal')),
        icon: ArrowDownToLine,
        tint: 'from-warning/10 to-warning/5 text-warning',
      },
      {
        label: 'Users',
        value: String(count('user')),
        icon: Users,
        tint: 'from-secondary/10 to-secondary/5 text-secondary',
      },
    ];
  }, [logs]);

  const tabCount = (id: TargetFilter) =>
    id === 'all' ? logs.length : logs.filter((l) => l.target_type === id).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Logs"
        subtitle="A realtime audit trail of every administrative action across the platform."
        action={<NexBadge variant="success" dot>Realtime</NexBadge>}
      />

      {/* KPIs */}
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
              <NexCard className="p-5">
                <div className={cn('flex size-11 items-center justify-center rounded-xl bg-gradient-to-br', k.tint)}>
                  <Icon className="size-5" />
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">{k.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{k.label}</p>
              </NexCard>
            </motion.div>
          );
        })}
      </div>

      <NexCard>
        <NexCardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <NexCardTitle className="flex items-center gap-2">
              <ScrollText className="size-4 text-primary" />
              Audit Timeline
            </NexCardTitle>
            <div className="flex flex-wrap gap-2">
              {FILTER_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTargetFilter(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    targetFilter === t.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      'ml-0.5 rounded px-1 text-[10px]',
                      targetFilter === t.id ? 'bg-white/20' : 'bg-foreground/10'
                    )}
                  >
                    {tabCount(t.id)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </NexCardHeader>
        <NexCardContent>
          {/* Search */}
          <div className="mb-5 max-w-sm">
            <NexInput
              placeholder="Search actor, action, type, details…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search />}
            />
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : pageItems.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title={search || targetFilter !== 'all' ? 'No matching logs' : 'No activity yet'}
              description={
                search || targetFilter !== 'all'
                  ? 'Try adjusting your search or filter.'
                  : 'Administrative actions will appear here in realtime.'
              }
            />
          ) : (
            <>
              {/* Timeline */}
              <div className="relative">
                {/* connecting line */}
                <div className="absolute left-[21px] top-3 bottom-3 w-px bg-border" aria-hidden />
                <ul className="space-y-1">
                  {pageItems.map((log, i) => {
                    const cfg = getTargetConfig(log.target_type);
                    const Icon = cfg.icon;
                    return (
                      <motion.li
                        key={log.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                        className="relative flex gap-4 pb-5 last:pb-0"
                      >
                        {/* icon bubble */}
                        <div
                          className={cn(
                            'relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border shadow-sm',
                            cfg.bubble
                          )}
                        >
                          <Icon className="size-5" />
                        </div>

                        {/* content */}
                        <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {log.actor || 'system'}
                            </span>
                            <NexBadge variant={actionVariant(log.action)} size="sm">
                              {log.action}
                            </NexBadge>
                            <NexBadge variant="outline" size="sm">
                              {cfg.label}
                            </NexBadge>
                          </div>

                          {log.details && (
                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                              {log.details}
                            </p>
                          )}

                          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <span className="text-foreground/60">Target</span>
                              <span className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
                                {log.target_id || '—'}
                              </span>
                            </span>
                            <span className="text-foreground/20">•</span>
                            <span title={absoluteTime(log.created_at)} className="font-medium">
                              {relativeTime(log.created_at)}
                            </span>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>

              {/* Pagination */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  {filtered.length === 0
                    ? 'No results'
                    : `Showing ${startIdx + 1}–${Math.min(startIdx + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="min-w-[5.5rem] text-center text-xs font-semibold text-foreground">
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </NexCardContent>
      </NexCard>
    </div>
  );
}
