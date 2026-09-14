import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Receipt,
  ExternalLink,
  Loader2,
  ArrowLeftRight,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge, NexButton } from '@/components/ui/nex';
import { EmptyState } from '@/components/ui/empty-state';
import {
  fetchAllDeposits,
  approveDepositRpc,
  rejectDepositRpc,
  type DepositRow,
} from '@/lib/supabase/deposits';
import { useAuth } from '@/lib/auth';
import { computeVipLevel } from '@/lib/vip-config';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Tab = 'pending' | 'approved' | 'rejected';

const tabs: { id: Tab; label: string; icon: typeof Clock }[] = [
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'approved', label: 'Approved', icon: CheckCircle2 },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
];

export function AdminFinancePage() {
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
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
      .channel('admin-deposits-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, () => {
        loadDeposits();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDeposits]);

  async function handleAction(deposit: DepositRow, action: 'approved' | 'rejected') {
    setActioning(deposit.id);
    try {
      if (action === 'approved') {
        const result = await approveDepositRpc(deposit.id, adminUser?.id ?? '');
        if (!result) throw new Error('Deposit approval failed — no user ID returned');
      } else {
        await rejectDepositRpc(deposit.id, adminUser?.id ?? '', '');
      }
      toast.success(action === 'approved' ? 'Deposit approved' : 'Deposit rejected', {
        description:
          action === 'approved'
            ? `${deposit.user_name} — ${Number(deposit.amount).toLocaleString()} credited. VIP recalculated.`
            : `${deposit.user_name} — ${Number(deposit.amount).toLocaleString()} rejected.`,
      });
      await loadDeposits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      toast.error('Action failed', { description: msg });
    } finally {
      setActioning(null);
    }
  }

  const filtered = deposits.filter((d) => d.status === activeTab);

  const stats = {
    pending: deposits.filter((d) => d.status === 'pending').length,
    approvedTotal: deposits
      .filter((d) => d.status === 'approved')
      .reduce((sum, d) => sum + Number(d.amount), 0),
    approvedCount: deposits.filter((d) => d.status === 'approved').length,
    rejectedCount: deposits.filter((d) => d.status === 'rejected').length,
  };

  const kpis = [
    { label: 'Pending Requests', value: String(stats.pending), icon: Clock, tint: 'from-warning/10 to-warning/5 text-warning' },
    { label: 'Total Approved', value: `$${stats.approvedTotal.toLocaleString()}`, icon: DollarSign, tint: 'from-success/10 to-success/5 text-success' },
    { label: 'Approved Deposits', value: String(stats.approvedCount), icon: CheckCircle2, tint: 'from-primary/10 to-primary/5 text-primary' },
    { label: 'Rejected', value: String(stats.rejectedCount), icon: XCircle, tint: 'from-danger/10 to-danger/5 text-danger' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & Recharge Approvals"
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
                    <span className={cn('ml-0.5 rounded px-1 text-[10px]', activeTab === t.id ? 'bg-white/20' : 'bg-foreground/10')}>
                      {count}
                    </span>
                  </button>
                );
              })}
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
              icon={Receipt}
              title={`No ${activeTab} deposits`}
              description={activeTab === 'pending' ? 'New deposit requests will appear here for approval.' : 'No deposits in this category.'}
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((deposit) => {
                const vipLevel = computeVipLevel(
                  deposits
                    .filter((d) => d.user_id === deposit.user_id && d.status === 'approved')
                    .reduce((sum, d) => sum + Number(d.amount), 0)
                );
                return (
                  <DepositRowItem
                    key={deposit.id}
                    deposit={deposit}
                    vipLevel={vipLevel}
                    actioning={actioning === deposit.id}
                    onApprove={() => handleAction(deposit, 'approved')}
                    onReject={() => handleAction(deposit, 'rejected')}
                    onPreview={() => setPreviewImage(deposit.screenshot_url)}
                  />
                );
              })}
            </div>
          )}
        </NexCardContent>
      </NexCard>

      {/* Screenshot preview modal */}
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
              <XCircle className="size-4" />
            </button>
            <img src={previewImage} alt="Payment proof" className="max-h-[85vh] w-full rounded-xl object-contain" />
          </motion.div>
        </div>
      )}
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
  const statusVariant: Record<string, 'warning' | 'success' | 'danger'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
  };

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
          <div className="mt-1 flex items-center gap-3 text-xs">
            <span className="font-bold text-foreground">${Number(deposit.amount).toLocaleString()}</span>
            <span className="text-muted-foreground">
              {deposit.method === 'bank' ? 'Bank Transfer' : 'USDT (TRC20)'}
            </span>
            <span className="text-muted-foreground">
              {new Date(deposit.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {deposit.transaction_id && (
              <span className="text-muted-foreground">TX: {deposit.transaction_id.slice(0, 12)}</span>
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
