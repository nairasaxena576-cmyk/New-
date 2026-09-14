import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownToLine,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Loader2,
  AlertTriangle,
  Building2,
  Coins,
  Hash,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexTextarea } from '@/components/ui/nex-textarea';
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
  fetchAllWithdrawals,
  approveWithdrawalRpc,
  rejectWithdrawalRpc,
  type WithdrawalRow,
} from '@/lib/supabase/deposits';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Tab = 'pending' | 'approved' | 'rejected';

const tabs: { id: Tab; label: string; icon: typeof Clock }[] = [
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'approved', label: 'Approved', icon: CheckCircle2 },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
];

const statusVariant: Record<WithdrawalRow['status'], 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

function formatAmount(amount: number): string {
  return `$${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMethod(w: WithdrawalRow): string {
  if (w.method === 'bank') return 'Bank Transfer';
  const currency = w.currency || w.method.toUpperCase();
  return `${currency}${w.network ? ` (${w.network})` : ''}`;
}

export function AdminWithdrawalsPage() {
  const { user: adminUser } = useAuth();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'approve' | 'reject'; withdrawal: WithdrawalRow } | null>(null);
  const [txHash, setTxHash] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const loadWithdrawals = useCallback(async () => {
    try {
      const rows = await fetchAllWithdrawals();
      setWithdrawals(rows);
    } catch {
      toast.error('Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-withdrawals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, () => {
        loadWithdrawals();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadWithdrawals]);

  async function handleConfirm() {
    if (!confirmAction) return;
    const { type, withdrawal } = confirmAction;
    setActioning(withdrawal.id);
    setConfirmAction(null);
    try {
      if (type === 'approve') {
        await approveWithdrawalRpc(withdrawal.id, adminUser?.id ?? '', txHash.trim(), adminNote.trim());
        toast.success('Withdrawal approved', {
          description: `${withdrawal.user_name} — ${formatAmount(withdrawal.amount)} approved and paid out.`,
        });
      } else {
        if (!rejectReason.trim()) {
          toast.error('Rejection reason required');
          setConfirmAction({ type: 'reject', withdrawal });
          return;
        }
        await rejectWithdrawalRpc(withdrawal.id, adminUser?.id ?? '', rejectReason.trim());
        toast.success('Withdrawal rejected', {
          description: `${withdrawal.user_name} — ${formatAmount(withdrawal.amount)} rejected. Funds returned to balance.`,
        });
      }
      setTxHash('');
      setAdminNote('');
      setRejectReason('');
      await loadWithdrawals();
    } catch (err) {
      toast.error('Action failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setActioning(null);
    }
  }

  const counts = {
    pending: withdrawals.filter((w) => w.status === 'pending').length,
    approved: withdrawals.filter((w) => w.status === 'approved').length,
    rejected: withdrawals.filter((w) => w.status === 'rejected').length,
  };

  const filtered = withdrawals.filter((w) => {
    const matchesTab = w.status === activeTab;
    if (!matchesTab) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      w.user_name.toLowerCase().includes(q) ||
      w.user_email.toLowerCase().includes(q)
    );
  });

  const pendingTotal = withdrawals
    .filter((w) => w.status === 'pending')
    .reduce((sum, w) => sum + Number(w.amount), 0);
  const approvedTotal = withdrawals
    .filter((w) => w.status === 'approved')
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const kpis = [
    { label: 'Pending Requests', value: String(counts.pending), icon: Clock, tint: 'from-warning/10 to-warning/5 text-warning' },
    { label: 'Pending Amount', value: formatAmount(pendingTotal), icon: ArrowDownToLine, tint: 'from-primary/10 to-primary/5 text-primary' },
    { label: 'Total Approved', value: formatAmount(approvedTotal), icon: CheckCircle2, tint: 'from-success/10 to-success/5 text-success' },
    { label: 'Rejected', value: String(counts.rejected), icon: XCircle, tint: 'from-danger/10 to-danger/5 text-danger' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Withdrawal Approvals"
        subtitle="Review and process user withdrawal requests. Funds return to balance when rejected."
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
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
            <NexCardTitle>Withdrawal Requests</NexCardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <NexInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email..."
                leftIcon={<Search />}
                containerClassName="w-full sm:w-64"
                className="h-9 text-xs"
              />
              <div className="flex flex-wrap gap-2">
                {tabs.map((t) => {
                  const Icon = t.icon;
                  const count = counts[t.id];
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
                      <span className={cn('ml-0.5 rounded px-1 text-[10px]', activeTab === t.id ? 'bg-white/20' : 'bg-foreground/10')}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </NexCardHeader>
        <NexCardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ArrowDownToLine}
              title={search.trim() ? 'No matching withdrawals' : `No ${activeTab} withdrawals`}
              description={
                search.trim()
                  ? 'Try a different search term.'
                  : activeTab === 'pending'
                    ? 'New withdrawal requests will appear here for approval.'
                    : 'No withdrawals in this category.'
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((withdrawal) => (
                <WithdrawalRowItem
                  key={withdrawal.id}
                  withdrawal={withdrawal}
                  actioning={actioning === withdrawal.id}
                  onApprove={() => {
                    setTxHash('');
                    setAdminNote('');
                    setConfirmAction({ type: 'approve', withdrawal });
                  }}
                  onReject={() => {
                    setRejectReason('');
                    setConfirmAction({ type: 'reject', withdrawal });
                  }}
                />
              ))}
            </div>
          )}
        </NexCardContent>
      </NexCard>

      {/* Approval/Rejection modal */}
      <NexModal
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setTxHash('');
            setAdminNote('');
            setRejectReason('');
          }
        }}
      >
        <NexModalContent className="max-w-lg">
          <NexModalHeader>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  confirmAction?.type === 'approve'
                    ? 'bg-success/10 text-success'
                    : 'bg-danger/10 text-danger'
                )}
              >
                <AlertTriangle className="size-5" />
              </div>
              <div className="space-y-1.5">
                <NexModalTitle>
                  {confirmAction?.type === 'approve' ? 'Approve withdrawal?' : 'Reject withdrawal?'}
                </NexModalTitle>
                <NexModalDescription>
                  {confirmAction?.type === 'approve'
                    ? 'Confirm that this withdrawal has been paid out. This will deduct the amount from the customer balance.'
                    : 'The reserved amount will be returned to the customer balance.'}
                </NexModalDescription>
              </div>
            </div>
          </NexModalHeader>

          {confirmAction && (
            <>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Customer</dt>
                    <dd className="mt-0.5 font-semibold text-foreground">{confirmAction.withdrawal.user_name || 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd className="mt-0.5 truncate font-medium text-foreground">{confirmAction.withdrawal.user_email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Amount</dt>
                    <dd className="mt-0.5 font-bold text-foreground">{formatAmount(confirmAction.withdrawal.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Method</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{formatMethod(confirmAction.withdrawal)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Wallet / Account</dt>
                    <dd className="mt-0.5 break-all font-medium text-foreground">
                      {confirmAction.withdrawal.wallet_address || confirmAction.withdrawal.account_info || '—'}
                    </dd>
                  </div>
                  {confirmAction.withdrawal.account_name && (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Account Name</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{confirmAction.withdrawal.account_name}</dd>
                    </div>
                  )}
                  {confirmAction.withdrawal.note && (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Customer Note</dt>
                      <dd className="mt-0.5 font-medium text-foreground">{confirmAction.withdrawal.note}</dd>
                    </div>
                  )}
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Date</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {new Date(confirmAction.withdrawal.created_at).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Approve fields */}
              {confirmAction.type === 'approve' && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                      Transaction ID / Tx Hash
                    </label>
                    <NexInput
                      placeholder="e.g. 0xabc123... or TX123456"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      leftIcon={<Hash className="size-4" />}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                      Admin Note (optional)
                    </label>
                    <NexTextarea
                      rows={2}
                      placeholder="Internal note about this approval..."
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Reject fields */}
              {confirmAction.type === 'reject' && (
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    Rejection Reason <span className="text-danger">*</span>
                  </label>
                  <NexTextarea
                    rows={3}
                    placeholder="Explain why this withdrawal is being rejected..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <NexModalFooter>
            <NexButton
              variant="outline"
              onClick={() => {
                setConfirmAction(null);
                setTxHash('');
                setAdminNote('');
                setRejectReason('');
              }}
            >
              Cancel
            </NexButton>
            {confirmAction?.type === 'approve' ? (
              <NexButton
                variant="success"
                leftIcon={<CheckCircle2 className="size-4" />}
                onClick={handleConfirm}
                disabled={!!actioning}
              >
                Approve withdrawal
              </NexButton>
            ) : (
              <NexButton
                variant="danger"
                leftIcon={<XCircle className="size-4" />}
                onClick={handleConfirm}
                disabled={!!actioning || !rejectReason.trim()}
              >
                Reject withdrawal
              </NexButton>
            )}
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </div>
  );
}

function WithdrawalRowItem({
  withdrawal,
  actioning,
  onApprove,
  onReject,
}: {
  withdrawal: WithdrawalRow;
  actioning: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isCrypto = withdrawal.method !== 'bank';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex size-14 shrink-0 items-center justify-center rounded-lg',
          isCrypto ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}>
          {isCrypto ? <Coins className="size-5" /> : <Building2 className="size-5" />}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{withdrawal.user_name || 'Unknown'}</span>
            <NexBadge variant={statusVariant[withdrawal.status]} size="sm" dot>
              {withdrawal.status}
            </NexBadge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{withdrawal.user_email}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-bold text-foreground">{formatAmount(withdrawal.amount)}</span>
            <span className="text-muted-foreground">{formatMethod(withdrawal)}</span>
            <span className="text-muted-foreground">
              {new Date(withdrawal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 break-all text-xs text-muted-foreground">
            <Wallet className="size-3 shrink-0" />
            <span className="font-medium text-foreground/70">Wallet:</span>{' '}
            {withdrawal.wallet_address || withdrawal.account_info || '—'}
          </p>
          {withdrawal.status === 'approved' && withdrawal.tx_hash && (
            <p className="mt-1 flex items-center gap-1.5 break-all text-xs text-success">
              <Hash className="size-3 shrink-0" />
              <span className="font-medium">Tx:</span> {withdrawal.tx_hash}
            </p>
          )}
          {withdrawal.status === 'rejected' && withdrawal.rejection_reason && (
            <p className="mt-1 flex items-start gap-1.5 break-all text-xs text-danger">
              <XCircle className="mt-0.5 size-3 shrink-0" />
              <span className="font-medium">Reason:</span> {withdrawal.rejection_reason}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 lg:self-center">
        {withdrawal.status === 'pending' && (
          <>
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
          </>
        )}
        {withdrawal.status !== 'pending' && withdrawal.reviewed_at && (
          <span className="text-xs text-muted-foreground">
            Reviewed {new Date(withdrawal.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </motion.div>
  );
}
