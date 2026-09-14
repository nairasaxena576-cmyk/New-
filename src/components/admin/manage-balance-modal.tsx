import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  PlusCircle,
  MinusCircle,
  Crown,
  Shield,
  AlertTriangle,
  Loader2,
  ArrowDownRight,
  ArrowUpRight,
  History,
} from 'lucide-react';
import {
  NexModal,
  NexModalContent,
  NexModalHeader,
  NexModalFooter,
  NexModalTitle,
  NexModalDescription,
} from '@/components/ui/nex-modal';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexBadge } from '@/components/ui/nex';
import { computeVipLevel } from '@/lib/vip-config';
import {
  fetchBalanceTransactions,
  adminAdjustBalance,
  type BalanceTransactionRow,
  type UserProfileRow,
} from '@/lib/supabase/deposits';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ManageBalanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfileRow | null;
  onAdjusted: () => void;
}

function formatCurrency(value: number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ManageBalanceModal({ open, onOpenChange, user, onAdjusted }: ManageBalanceModalProps) {
  const [adjustmentType, setAdjustmentType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transactions, setTransactions] = useState<BalanceTransactionRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const rows = await fetchBalanceTransactions(user.user_id, 15);
      setTransactions(rows);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      loadHistory();
      setAdjustmentType('credit');
      setAmount('');
      setReason('');
      setReference('');
      setShowConfirm(false);
    }
  }, [open, user, loadHistory]);

  if (!user) return null;

  const vipLevel = computeVipLevel(user.total_deposits);
  const numericAmount = parseFloat(amount) || 0;
  const currentBalance = Number(user.balance);
  const newBalance =
    adjustmentType === 'credit'
      ? currentBalance + numericAmount
      : currentBalance - numericAmount;

  function handleSubmit() {
    if (numericAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (adjustmentType === 'debit' && newBalance < 0) {
      toast.error('Cannot debit below zero');
      return;
    }
    if (!reason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setShowConfirm(true);
  }

  async function handleConfirm() {
    if (!user) return;
    setSubmitting(true);
    try {
      await adminAdjustBalance({
        customerId: user.user_id,
        adjustmentType,
        amount: numericAmount,
        reason: reason.trim(),
        reference: reference.trim(),
      });
      toast.success('Balance adjusted', {
        description: `${user.full_name || user.email} — new balance: ${formatCurrency(newBalance)}`,
      });
      setShowConfirm(false);
      setAmount('');
      setReason('');
      setReference('');
      onAdjusted();
      await loadHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      toast.error('Adjustment failed', { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <NexModal open={open} onOpenChange={onOpenChange}>
      <NexModalContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-h-[92vh]">
        {/* Header — sticky, never scrolls away */}
        <NexModalHeader className="shrink-0 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
          <NexModalTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="size-4" />
            </span>
            Manage Balance
          </NexModalTitle>
          <NexModalDescription>
            Adjust a customer's wallet balance. Every change is permanently recorded.
          </NexModalDescription>
        </NexModalHeader>

        {/* Scrollable content area */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] px-5 pb-4 sm:px-6 sm:pb-5">
          {/* Customer info */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {user.full_name || 'Unknown'}
                </p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <NexBadge variant="muted" size="sm">
                <Crown className="size-3" />
                VIP{vipLevel}
              </NexBadge>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-background px-3 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">Current Balance</span>
              <span className="text-lg font-bold text-foreground">
                {formatCurrency(currentBalance)}
              </span>
            </div>
          </div>

          {/* Adjustment type toggle */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setAdjustmentType('credit')}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border-2 p-3.5 text-left transition-all',
                adjustmentType === 'credit'
                  ? 'border-success bg-success/5'
                  : 'border-border bg-muted/20 hover:border-success/30'
              )}
            >
              <PlusCircle className={cn('size-5', adjustmentType === 'credit' ? 'text-success' : 'text-muted-foreground')} />
              <div>
                <p className="text-sm font-semibold text-foreground">Add Funds</p>
                <p className="text-xs text-muted-foreground">Credit to wallet</p>
              </div>
            </button>
            <button
              onClick={() => setAdjustmentType('debit')}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border-2 p-3.5 text-left transition-all',
                adjustmentType === 'debit'
                  ? 'border-danger bg-danger/5'
                  : 'border-border bg-muted/20 hover:border-danger/30'
              )}
            >
              <MinusCircle className={cn('size-5', adjustmentType === 'debit' ? 'text-danger' : 'text-muted-foreground')} />
              <div>
                <p className="text-sm font-semibold text-foreground">Remove Funds</p>
                <p className="text-xs text-muted-foreground">Debit from wallet</p>
              </div>
            </button>
          </div>

          {/* Fields */}
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Amount (USD)</label>
              <NexInput
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                leftIcon={<Wallet className="size-4" />}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Reason / Note</label>
              <NexInput
                placeholder="e.g. Verified customer deposit"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Reference / Transaction ID (optional)
              </label>
              <NexInput
                placeholder="e.g. TX123456"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          {/* Preview */}
          {numericAmount > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Balance</span>
                <span className="font-semibold text-foreground">{formatCurrency(currentBalance)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {adjustmentType === 'credit' ? (
                    <ArrowUpRight className="size-4 text-success" />
                  ) : (
                    <ArrowDownRight className="size-4 text-danger" />
                  )}
                  Adjustment
                </span>
                <span className={cn('font-bold', adjustmentType === 'credit' ? 'text-success' : 'text-danger')}>
                  {adjustmentType === 'credit' ? '+' : '-'}{formatCurrency(numericAmount)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5 text-sm">
                <span className="font-semibold text-foreground">New Balance</span>
                <span className={cn('font-bold', newBalance < 0 ? 'text-danger' : 'text-foreground')}>
                  {formatCurrency(newBalance)}
                </span>
              </div>
            </div>
          )}

          {/* Balance History */}
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold text-foreground">Balance History</h4>
            </div>
            {loadingHistory ? (
              <div className="flex h-20 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No balance adjustments yet.</p>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 rounded-lg bg-background px-3 py-2 text-xs"
                  >
                    <div
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg',
                        tx.adjustment_type === 'credit' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                      )}
                    >
                      {tx.adjustment_type === 'credit' ? (
                        <ArrowUpRight className="size-3.5" />
                      ) : (
                        <ArrowDownRight className="size-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{tx.reason}</p>
                      <p className="text-muted-foreground">
                        {formatDate(tx.created_at)} · {tx.admin_id ? 'Admin' : 'System'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          'font-bold',
                          tx.adjustment_type === 'credit' ? 'text-success' : 'text-danger'
                        )}
                      >
                        {tx.adjustment_type === 'credit' ? '+' : ''}
                        {formatCurrency(Number(tx.adjustment_amount))}
                      </p>
                      <p className="text-muted-foreground">{formatCurrency(Number(tx.new_balance))}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer — always visible */}
        <div className="shrink-0 border-t border-border bg-card px-5 py-3 sm:px-6 sm:py-4">
          <NexModalFooter>
            <NexButton variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Close
            </NexButton>
            <NexButton
              variant={adjustmentType === 'credit' ? 'success' : 'danger'}
              onClick={handleSubmit}
              disabled={submitting || numericAmount <= 0}
              leftIcon={
                adjustmentType === 'credit' ? <PlusCircle className="size-4" /> : <MinusCircle className="size-4" />
              }
            >
              {adjustmentType === 'credit' ? 'Add Funds' : 'Remove Funds'}
            </NexButton>
          </NexModalFooter>
        </div>
      </NexModalContent>

      {/* Confirmation sub-modal */}
      <NexModal open={showConfirm} onOpenChange={setShowConfirm}>
        <NexModalContent className="max-w-md">
          <NexModalHeader>
            <NexModalTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Shield className="size-4" />
              </span>
              Confirm Balance Adjustment
            </NexModalTitle>
            <NexModalDescription>
              This action is permanent and will be recorded in the audit log.
            </NexModalDescription>
          </NexModalHeader>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{user.full_name || 'Unknown'}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Balance</span>
                <span className="font-semibold text-foreground">{formatCurrency(currentBalance)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {adjustmentType === 'credit' ? (
                    <ArrowUpRight className="size-4 text-success" />
                  ) : (
                    <ArrowDownRight className="size-4 text-danger" />
                  )}
                  Adjustment
                </span>
                <span className={cn('font-bold', adjustmentType === 'credit' ? 'text-success' : 'text-danger')}>
                  {adjustmentType === 'credit' ? '+' : '-'}{formatCurrency(numericAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="font-semibold text-foreground">New Balance</span>
                <span className="font-bold text-foreground">{formatCurrency(newBalance)}</span>
              </div>
              {reason.trim() && (
                <div className="border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">Reason</span>
                  <p className="text-sm text-foreground">{reason}</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/5 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>This will immediately update the customer's balance across all pages.</span>
          </div>

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setShowConfirm(false)} disabled={submitting}>
              Cancel
            </NexButton>
            <NexButton
              variant={adjustmentType === 'credit' ? 'success' : 'danger'}
              onClick={handleConfirm}
              isLoading={submitting}
            >
              Confirm Adjustment
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </NexModal>
  );
}
