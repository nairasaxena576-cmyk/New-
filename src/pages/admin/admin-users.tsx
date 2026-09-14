import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Crown, ChevronLeft, ChevronRight, Wallet, Coins, Calendar, Loader2, Settings2, Ticket } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge } from '@/components/ui/nex';
import { NexInput } from '@/components/ui/nex-input';
import { NexButton } from '@/components/ui/nex-button';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchAllUserProfiles, type UserProfileRow } from '@/lib/supabase/deposits';
import { ManageUserModal } from '@/components/admin/manage-user-modal';
import { supabase } from '@/lib/supabase/client';
import { computeVipLevel } from '@/lib/vip-config';
import { ManageBalanceModal } from '@/components/admin/manage-balance-modal';
import { ReferralInfoModal } from '@/components/admin/referral-info-modal';
import { cn } from '@/lib/utils';
import { isSameEtDay } from '@/lib/timezone';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

type VipFilter = 'all' | 0 | 1 | 2 | 3;

const vipFilters: { id: VipFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 0, label: 'VIP0' },
  { id: 1, label: 'VIP1' },
  { id: 2, label: 'VIP2' },
  { id: 3, label: 'VIP3' },
];

const vipBadgeVariant: Record<number, 'muted' | 'default' | 'secondary' | 'warning'> = {
  0: 'muted',
  1: 'default',
  2: 'secondary',
  3: 'warning',
};

function formatCurrency(value: number): string {
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getActiveStatus(user: UserProfileRow): { label: string; variant: 'success' | 'muted' } {
  const isToday = isSameEtDay(user.last_order_date);
  if (user.completed_today > 0 || isToday) {
    return { label: 'Active', variant: 'success' };
  }
  return { label: 'Inactive', variant: 'muted' };
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vipFilter, setVipFilter] = useState<VipFilter>('all');
  const [page, setPage] = useState(1);
  const [balanceUser, setBalanceUser] = useState<UserProfileRow | null>(null);
  const [referralUser, setReferralUser] = useState<UserProfileRow | null>(null);
  const [manageUser, setManageUser] = useState<UserProfileRow | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const rows = await fetchAllUserProfiles();
      setUsers(rows);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Realtime subscription to user_profiles
  useEffect(() => {
    const channel = supabase
      .channel('admin-user-profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => {
        loadUsers();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadUsers]);

  // Filter users by search query and VIP level
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (vipFilter === 'all') return true;
      return computeVipLevel(Number(u.balance)) === vipFilter;
    });
  }, [users, search, vipFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Clamp page when the filtered set shrinks
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // KPI summary
  const stats = useMemo(() => {
    const total = users.length;
    const totalBalance = users.reduce((sum, u) => sum + Number(u.balance), 0);
    const totalDeposits = users.reduce((sum, u) => sum + Number(u.total_deposits), 0);
    const vipCounts = [0, 0, 0, 0];
    users.forEach((u) => {
      vipCounts[computeVipLevel(Number(u.balance))]! += 1;
    });
    return { total, totalBalance, totalDeposits, vipCounts };
  }, [users]);

  const kpis = [
    { label: 'Total Users', value: String(stats.total), icon: Users, tint: 'from-primary/10 to-primary/5 text-primary' },
    { label: 'Total Balance', value: formatCurrency(stats.totalBalance), icon: Wallet, tint: 'from-success/10 to-success/5 text-success' },
    { label: 'Total Deposits', value: formatCurrency(stats.totalDeposits), icon: Coins, tint: 'from-warning/10 to-warning/5 text-warning' },
    { label: 'VIP Members', value: String(stats.vipCounts[1] + stats.vipCounts[2] + stats.vipCounts[3]), icon: Crown, tint: 'from-secondary/10 to-secondary/5 text-secondary' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        subtitle="View, search, and manage all platform users."
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
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <NexCardTitle>Users</NexCardTitle>
              <NexBadge variant="muted">{filtered.length} shown</NexBadge>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Search */}
              <NexInput
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, email, or user ID"
                leftIcon={<Search />}
                containerClassName="sm:max-w-sm"
              />

              {/* VIP filter pills */}
              <div className="flex flex-wrap gap-2">
                {vipFilters.map((f) => (
                  <button
                    key={String(f.id)}
                    onClick={() => {
                      setVipFilter(f.id);
                      setPage(1);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                      vipFilter === f.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {f.id !== 'all' && <Crown className="size-3.5" />}
                    {f.label}
                    {f.id !== 'all' && (
                      <span
                        className={cn(
                          'ml-0.5 rounded px-1 text-[10px]',
                          vipFilter === f.id ? 'bg-white/20' : 'bg-foreground/10'
                        )}
                      >
                        {stats.vipCounts[f.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </NexCardHeader>

        <NexCardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search || vipFilter !== 'all' ? 'No matching users' : 'No users yet'}
              description={
                search || vipFilter !== 'all'
                  ? 'Try adjusting your search or VIP filter.'
                  : 'Registered users will appear here.'
              }
            />
          ) : (
            <>
              {/* Desktop table (sm+) */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-3">User</th>
                      <th className="px-3 py-3">VIP</th>
                      <th className="px-3 py-3 text-right">Balance</th>
                      <th className="px-3 py-3 text-right">Deposits</th>
                      <th className="px-3 py-3 text-right">Commission</th>
                      <th className="px-3 py-3 text-center">Today</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Joined</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((user, i) => {
                      const vipLevel = computeVipLevel(Number(user.balance));
                      const status = getActiveStatus(user);
                      return (
                        <motion.tr
                          key={user.user_id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.03 }}
                          className="border-b border-border/60 transition-colors hover:bg-muted/30"
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">
                                  {user.full_name || 'Unknown'}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <NexBadge variant={vipBadgeVariant[vipLevel]} size="sm">
                              <Crown className="size-3" />
                              VIP{vipLevel}
                            </NexBadge>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-foreground">
                            {formatCurrency(user.balance)}
                          </td>
                          <td className="px-3 py-3 text-right text-foreground">
                            {formatCurrency(user.total_deposits)}
                          </td>
                          <td className="px-3 py-3 text-right text-foreground">
                            {formatCurrency(user.lifetime_commission)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-semibold text-foreground">{user.completed_today}</span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col gap-1">
                              <NexBadge variant={status.variant} size="sm" dot>
                                {status.label}
                              </NexBadge>
                              {(user.start_access_enabled === false) && (
                                <NexBadge variant="danger" size="sm">
                                  Start Blocked
                                </NexBadge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="size-3.5" />
                              {formatDate(user.created_at)}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <NexButton
                                variant="outline"
                                size="sm"
                                onClick={() => setReferralUser(user)}
                                leftIcon={<Ticket className="size-3.5" />}
                              >
                                Referral
                              </NexButton>
                              <NexButton
                                variant="outline"
                                size="sm"
                                onClick={() => setBalanceUser(user)}
                                leftIcon={<Wallet className="size-3.5" />}
                              >
                                Balance
                              </NexButton>
                              <NexButton
                                variant="outline"
                                size="sm"
                                onClick={() => setManageUser(user)}
                                leftIcon={<Settings2 className="size-3.5" />}
                              >
                                Manage
                              </NexButton>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {paginated.map((user, i) => {
                  const vipLevel = computeVipLevel(user.total_deposits);
                  const status = getActiveStatus(user);
                  return (
                    <motion.div
                      key={user.user_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                      className="rounded-xl border border-border bg-muted/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                            {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                              {user.full_name || 'Unknown'}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                        <NexBadge variant={vipBadgeVariant[vipLevel]} size="sm">
                          <Crown className="size-3" />
                          VIP{vipLevel}
                        </NexBadge>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Balance</p>
                          <p className="font-semibold text-foreground">{formatCurrency(user.balance)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Deposits</p>
                          <p className="font-semibold text-foreground">{formatCurrency(user.total_deposits)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Commission</p>
                          <p className="font-semibold text-foreground">{formatCurrency(user.lifetime_commission)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Today</p>
                          <p className="font-semibold text-foreground">{user.completed_today}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                        <div className="flex items-center gap-2">
                          <NexBadge variant={status.variant} size="sm" dot>
                            {status.label}
                          </NexBadge>
                          {(user.start_access_enabled === false) && (
                            <NexBadge variant="danger" size="sm">
                              Start Blocked
                            </NexBadge>
                          )}
                        </div>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="size-3.5" />
                          {formatDate(user.created_at)}
                        </span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <NexButton
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setReferralUser(user)}
                          leftIcon={<Ticket className="size-3.5" />}
                        >
                          Referral
                        </NexButton>
                        <NexButton
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setBalanceUser(user)}
                          leftIcon={<Wallet className="size-3.5" />}
                        >
                          Balance
                        </NexButton>
                      </div>
                      <div className="mt-2">
                        <NexButton
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setManageUser(user)}
                          leftIcon={<Settings2 className="size-3.5" />}
                        >
                          Manage User
                        </NexButton>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} · {filtered.length} {filtered.length === 1 ? 'user' : 'users'}
                </p>
                <div className="flex items-center gap-2">
                  <NexButton
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    leftIcon={<ChevronLeft className="size-4" />}
                  >
                    Prev
                  </NexButton>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .map((p, idx, arr) => (
                        <span key={p} className="flex items-center">
                          {idx > 0 && arr[idx - 1] !== p - 1 && (
                            <span className="px-1 text-xs text-muted-foreground">…</span>
                          )}
                          <button
                            onClick={() => setPage(p)}
                            className={cn(
                              'flex size-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors',
                              p === page
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-accent'
                            )}
                          >
                            {p}
                          </button>
                        </span>
                      ))}
                  </div>
                  <NexButton
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    rightIcon={<ChevronRight className="size-4" />}
                  >
                    Next
                  </NexButton>
                </div>
              </div>
            </>
          )}
        </NexCardContent>
      </NexCard>

      <ManageBalanceModal
        open={balanceUser !== null}
        onOpenChange={(open) => !open && setBalanceUser(null)}
        user={balanceUser}
        onAdjusted={loadUsers}
      />

      <ReferralInfoModal
        open={referralUser !== null}
        onOpenChange={(open) => !open && setReferralUser(null)}
        user={referralUser}
      />

      <ManageUserModal
        open={manageUser !== null}
        onOpenChange={(open) => !open && setManageUser(null)}
        user={manageUser}
        onUpdated={loadUsers}
      />
    </div>
  );
}
