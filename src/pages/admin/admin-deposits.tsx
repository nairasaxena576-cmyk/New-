import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  Receipt,
  ExternalLink,
  Search,
  Loader2,
  AlertTriangle,
  ArrowLeftRight,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import {
  NexModal,
  NexModalContent,
  NexModalHeader,
  NexModalFooter,
  NexModalTitle,
  NexModalDescription,
} from '@/components/ui/nex-modal';
import { EmptyState } from '@/components/ui/empty-state';
import {
  fetchAllDeposits,
  updateDepositStatus,
  approveDepositRpc,
  rejectDepositRpc,
  logActivity,
  type DepositRow,
} from '@/lib/supabase/deposits';
import { useAuth } from '@/lib/auth';
import { computeVipLevel } from '@/lib/vip-config';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Tab = 'pending' | 'approved' | 'rejected';

interface ConfirmAction {
  type: 'approve' | 'reject';
  deposit: DepositRow;
}

const tabs: { id: Tab; label: string; icon: typeof Clock }[] = [
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'approved', label: 'Approved', icon: CheckCircle2 },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
];

const statusVariant: Record<DepositRow['status'], 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

function methodLabel(method: string): string {
  if (method === 'bank') return 'Bank Transfer';
  if (method === 'usdt' || method === 'crypto') return 'USDT (TRC20)';
  return method.charAt(0).toUpperCase() + method.slice(1);
}

export function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { user: adminUser } = useAuth();

  const loadDeposits = useCallback(async () => {
    try {
      const rows = await fetchAllDeposits();
      setDeposits(rows);
    } catch {
      toast.error('Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeposits();
  }, [loadDeposits]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-deposits-page-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, () => {
        loadDeposits();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDeposits]);

  const requestConfirm = useCallback((type: 'approve' | 'reject', deposit: DepositRow) => {
    setConfirmAction({ type, deposit });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!confirmAction) return;
    const { type, deposit } = confirmAction;
    setActioning(deposit.id);
    try {
      if (type === 'approve') {
        const result = await approveDepositRpc(deposit.id, adminUser?.id ?? '');
        if (!result) throw new Error('Deposit approval failed — no user ID returned');
        await logActivity(
          'admin',
          'approve_deposit',
          'deposit',
          deposit.id,
          `Approved ${methodLabel(deposit.method)} deposit of ${Number(deposit.amount).toLocaleString()} for ${deposit.user_name} (${deposit.user_email})`
        );
        toast.success('Deposit approved', {
          description: `${deposit.user_name} — ${Number(deposit.amount).toLocaleString()} credited. VIP recalculated.`,
        });
      } else {
        await rejectDepositRpc(deposit.id, adminUser?.id ?? '', rejectReason);
        await logActivity(
          'admin',
          'reject_deposit',
          'deposit',
          deposit.id,
          `Rejected ${methodLabel(deposit.method)} deposit of ${Number(deposit.amount).toLocaleString()} for ${deposit.user_name} (${deposit.user_email})`
        );
        toast.success('Deposit rejected', {
          description: `${deposit.user_name} — ${Number(deposit.amount).toLocaleString()} rejected.`,
        });
      }
      await loadDeposits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      toast.error('Action failed', { description: msg });
    } finally {
      setActioning(null);
      setConfirmAction(null);
      setRejectReason('');
    }
  }, [confirmAction, loadDeposits, adminUser, rejectReason]);

  // Pre-compute VIP level per user (sum of approved deposits)
  const vipByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of deposits) {
      if (d.status !== 'approved') continue;
      map.set(d.user_id, (map.get(d.user_id) ?? 0) + Number(d.amount));
    }
    const result = new Map<string, number>();
    for (const [uid, total] of map) {
      result.set(uid, computeVipLevel(total));
    }
    return result;
  }, [deposits]);

  const stats = useMemo(() => {
    const pending = deposits.filter((d) => d.status === 'pending');
    const approved = deposits.filter((d) => d.status === 'approved');
    const rejected = deposits.filter((d) => d.status === 'rejected');
    return {
      pendingCount: pending.length,
      pendingTotal: pending.reduce((sum, d) => sum + Number(d.amount), 0),
      approvedTotal: approved.reduce((sum, d) => sum + Number(d.amount), 0),
      rejectedCount: rejected.length,
    };
  }, [deposits]);

  const kpis = [
    {
      label: 'Pending Requests',
      value: String(stats.pendingCount),
      icon: Clock,
      tint: 'from-warning/10 to-warning/5 text-warning',
    },
    {
      label: 'Pending Total',
      value: `$${stats.pendingTotal.toLocaleString()}`,
      icon: Wallet,
      tint: 'from-warning/10 to-warning/5 text-warning',
    },
    {
      label: 'Total Approved',
      value: `$${stats.approvedTotal.toLocaleString()}`,
      icon: CheckCircle2,
      tint: 'from-success/10 to-success/5 text-success',
    },
    {
      label: 'Rejected',
      value: String(stats.rejectedCount),
      icon: XCircle,
      tint: 'from-danger/10 to-danger/5 text-danger',
    },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deposits.filter((d) => {
      if (d.status !== activeTab) return false;
      if (!q) return true;
      return (
        d.user_name.toLowerCase().includes(q) ||
        d.user_email.toLowerCase().includes(q)
      );
    });
  }, [deposits, activeTab, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deposit Approvals"
        subtitle="Review and approve user deposit requests. VIP levels update automatically."
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
            <NexCardTitle>Deposit Requests</NexCardTitle>
            <div className="flex flex-wrap gap-2">
              {tabs.map((t) => {
                const Icon = t.icon;
                const count = deposits.filter((d) => d.status === t.id).length;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                      activeTab === t.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t.label}
                    <span
                      className={cn(
                        'ml-0.5 rounded px-1 text-[10px]',
                        activeTab === t.id ? 'bg-white/20' : 'bg-foreground/10'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </NexCardHeader>
        <NexCardContent>
          {/* Search */}
          <div className="mb-4 max-w-sm">
            <NexInput
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search />}
            />
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={search ? 'No matching deposits' : `No ${activeTab} deposits`}
              description={
                search
                  ? 'Try a different name or email.'
                  : activeTab === 'pending'
                    ? 'New deposit requests will appear here for approval.'
                    : 'No deposits in this category.'
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((deposit) => (
                <DepositRowItem
                  key={deposit.id}
                  deposit={deposit}
                  vipLevel={vipByUser.get(deposit.user_id) ?? computeVipLevel(0)}
                  actioning={actioning === deposit.id}
                  onApprove={() => requestConfirm('approve', deposit)}
                  onReject={() => requestConfirm('reject', deposit)}
                  onPreview={() => setPreviewImage(deposit.screenshot_url)}
                />
              ))}
            </div>
          )}
        </NexCardContent>
      </NexCard>

      {/* Screenshot preview overlay */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/70 p-5 backdrop-blur-md"
          onClick={() => setPreviewImage(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-card p-2 shadow-pop"
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg bg-slate-900/60 text-white transition-colors hover:bg-slate-900/80"
            >
              <X className="size-4" />
            </button>
            <img src={previewImage} alt="Payment proof" className="max-h-[85vh] w-full rounded-xl object-contain" />
          </motion.div>
        </div>
      )}

      {/* Confirmation dialog */}
      <NexModal open={confirmAction !== null} onOpenChange={(open) => { if (!open) { setConfirmAction(null); setRejectReason(''); } }}>
        <NexModalContent>
          <NexModalHeader>
            <NexModalTitle className="flex items-center gap-2">
              {confirmAction?.type === 'approve' ? (
                <>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success">
                    <CheckCircle2 className="size-4" />
                  </span>
                  Approve Deposit?
                </>
              ) : (
                <>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-danger/10 text-danger">
                    <AlertTriangle className="size-4" />
                  </span>
                  Reject Deposit?
                </>
              )}
            </NexModalTitle>
            <NexModalDescription>
              {confirmAction?.type === 'approve'
                ? 'This will credit the user balance and recalculate VIP level. This action cannot be undone.'
                : 'This will mark the deposit as rejected. The user will need to submit a new request.'}
            </NexModalDescription>
          </NexModalHeader>

          {confirmAction && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {confirmAction.deposit.user_name || 'Unknown'}
                </span>
                <NexBadge variant={statusVariant[confirmAction.deposit.status]} size="sm" dot>
                  {confirmAction.deposit.status}
                </NexBadge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{confirmAction.deposit.user_email}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-bold text-foreground">
                    ${Number(confirmAction.deposit.amount).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="font-semibold text-foreground">
                    {methodLabel(confirmAction.deposit.method)}
                  </p>
                </div>
                {confirmAction.deposit.transaction_id && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Transaction ID</p>
                    <p className="truncate font-mono text-xs text-foreground">
                      {confirmAction.deposit.transaction_id}
                    </p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-semibold text-foreground">
                    {new Date(confirmAction.deposit.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {confirmAction?.type === 'reject' && (
            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Rejection Reason (optional)
              </label>
              <NexInput
                placeholder="e.g. Invalid transaction proof"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          )}

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setConfirmAction(null)} disabled={actioning !== null}>
              Cancel
            </NexButton>
            <NexButton
              variant={confirmAction?.type === 'approve' ? 'success' : 'danger'}
              onClick={handleConfirm}
              isLoading={actioning !== null}
              leftIcon={
                confirmAction?.type === 'approve' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />
              }
            >
              {confirmAction?.type === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </div>
  );
}

function DepositRowItem({
  deposit,
  vipLevel,
  actioning,
  onApprove,
  onReject,
  onPreview,
}: {
  deposit: DepositRow;
  vipLevel: number;
  actioning: boolean;
  onApprove: () => void;
  onReject: () => void;
  onPreview: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      {/* Left: user + deposit info */}
      <div className="flex items-center gap-3">
        {/* Screenshot thumbnail */}
        {deposit.screenshot_url ? (
          <button
            onClick={onPreview}
            className="group relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
          >
            <img src={deposit.screenshot_url} alt="Proof" className="size-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/0 transition-colors group-hover:bg-slate-900/40">
              <ExternalLink className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </button>
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Receipt className="size-5" />
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{deposit.user_name || 'Unknown'}</span>
            <NexBadge variant={statusVariant[deposit.status]} size="sm" dot>
              {deposit.status}
            </NexBadge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{deposit.user_email}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-bold text-foreground">${Number(deposit.amount).toLocaleString()}</span>
            <span className="text-muted-foreground">{methodLabel(deposit.method)}</span>
            <span className="text-muted-foreground">
              {new Date(deposit.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {deposit.transaction_id && (
              <span className="font-mono text-muted-foreground">TX: {deposit.transaction_id.slice(0, 12)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: VIP + actions */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground">
          <ArrowLeftRight className="size-3.5 text-primary" />
          VIP{vipLevel}
        </div>

        {deposit.status === 'pending' && (
          <div className="flex gap-2">
            <NexButton
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={actioning}
              leftIcon={actioning ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
            >
              Reject
            </NexButton>
            <NexButton
              variant="success"
              size="sm"
              onClick={onApprove}
              disabled={actioning}
              leftIcon={actioning ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            >
              Approve
            </NexButton>
          </div>
        )}
      </div>
    </motion.div>
  );
}
