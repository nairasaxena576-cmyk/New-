import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote,
  ArrowDownToLine,
  Wallet,
  Check,
  Clock,
  XCircle,
  CheckCircle2,
  Loader2,
  Building2,
  Coins,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardDescription, NexCardContent, NexBadge } from '@/components/ui/nex';
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
import { useAuth } from '@/lib/auth';
import { fetchWithdrawals, insertWithdrawal, type WithdrawalRow } from '@/lib/supabase/deposits';
import { cn } from '@/lib/utils';

type Method = 'bank' | 'usdt' | 'usdc' | 'btc';

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

const cryptoOptions: { id: Method; label: string; network: string }[] = [
  { id: 'usdt', label: 'USDT', network: 'TRC20' },
  { id: 'usdc', label: 'USDC', network: 'ERC20' },
  { id: 'btc', label: 'BTC', network: 'Bitcoin' },
];

const MIN_WITHDRAWAL = 1;

function formatAmount(amount: number): string {
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function WithdrawalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('bank');
  const [walletAddress, setWalletAddress] = useState('');
  const [accountName, setAccountName] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const rows = await fetchWithdrawals(user.id);
        setWithdrawals(rows);
      } catch {
        // keep empty
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const balance = user?.balance ?? 0;
  const withdrawAmount = parseFloat(amount) || 0;
  const insufficientBalance = withdrawAmount > balance;
  const belowMinimum = withdrawAmount > 0 && withdrawAmount < MIN_WITHDRAWAL;
  const isCrypto = method !== 'bank';
  const isValid =
    withdrawAmount >= MIN_WITHDRAWAL &&
    withdrawAmount <= balance &&
    walletAddress.trim().length > 0;

  async function handleSubmit() {
    if (!user) return;
    if (withdrawAmount < MIN_WITHDRAWAL) {
      toast.error('Amount too low', { description: `Minimum withdrawal is ${formatAmount(MIN_WITHDRAWAL)}.` });
      return;
    }
    if (insufficientBalance) {
      toast.error('Insufficient balance', { description: `Your balance is ${formatAmount(balance)}.` });
      return;
    }
    if (!walletAddress.trim()) {
      toast.error('Wallet/address required', { description: 'Please enter your destination wallet address.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const crypto = cryptoOptions.find((c) => c.id === method);
      await insertWithdrawal({
        user_id: user.id,
        user_email: user.email,
        user_name: user.fullName,
        amount: withdrawAmount,
        method,
        account_info: walletAddress.trim(),
        note,
        currency: isCrypto ? method.toUpperCase() : 'USD',
        network: isCrypto ? crypto?.network ?? '' : '',
        wallet_address: walletAddress.trim(),
        account_name: accountName.trim(),
      });
      setShowSuccess(true);
      const rows = await fetchWithdrawals(user.id);
      setWithdrawals(rows);
      // Update local balance immediately
    } catch (err) {
      toast.error('Submission failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setShowSuccess(false);
    setAmount('');
    setMethod('bank');
    setWalletAddress('');
    setAccountName('');
    setNote('');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Withdrawal"
        subtitle="Withdraw your earnings to your bank account or crypto wallet."
      />

      {/* Balance Card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-secondary p-5 shadow-pop sm:p-6">
          <div className="absolute -right-12 -top-12 size-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">Available Balance</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {formatAmount(balance)}
              </p>
            </div>
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
              <Wallet className="size-7 text-white" />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Withdrawal Form */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }} className="lg:col-span-3">
          <NexCard>
            <NexCardHeader>
              <NexCardTitle>Withdraw funds</NexCardTitle>
              <NexCardDescription>
                Enter the amount you'd like to withdraw. Funds are reserved immediately and released after review.
              </NexCardDescription>
            </NexCardHeader>
            <NexCardContent className="space-y-5">
              {/* Amount */}
              <div className="space-y-1.5">
                <label htmlFor="amount" className="text-sm font-semibold text-foreground">
                  Amount (USD)
                </label>
                <NexInput
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  leftIcon={<span className="text-base font-bold">$</span>}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={MIN_WITHDRAWAL}
                />
                {belowMinimum && (
                  <p className="text-xs font-medium text-danger">Minimum withdrawal is {formatAmount(MIN_WITHDRAWAL)}</p>
                )}
                {withdrawAmount > 0 && insufficientBalance && (
                  <p className="text-xs font-medium text-danger">Insufficient balance</p>
                )}
                {withdrawAmount > 0 && !insufficientBalance && !belowMinimum && (
                  <p className="text-xs text-muted-foreground">
                    You will receive {formatAmount(withdrawAmount)}
                  </p>
                )}
              </div>

              {/* Method */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Payment Method</label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {([
                    { id: 'bank' as Method, label: 'Bank Transfer', icon: Building2, desc: '1–3 business days' },
                    { id: 'usdt' as Method, label: 'USDT', icon: Coins, desc: 'TRC20 network' },
                    { id: 'usdc' as Method, label: 'USDC', icon: Coins, desc: 'ERC20 network' },
                    { id: 'btc' as Method, label: 'BTC', icon: Coins, desc: 'Bitcoin network' },
                  ]).map((m) => {
                    const Icon = m.icon;
                    const isSelected = method === m.id;
                    return (
                      <motion.button
                        key={m.id}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setMethod(m.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all',
                          isSelected ? 'border-primary ring-1 ring-primary/30 shadow-card' : 'border-border hover:border-primary/20'
                        )}
                      >
                        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white', isSelected ? 'from-primary to-secondary' : 'from-muted-foreground/20 to-muted-foreground/10')}>
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground">{m.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{m.desc}</p>
                        </div>
                        <div className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all', isSelected ? 'border-primary bg-primary' : 'border-border')}>
                          {isSelected && <Check className="size-3 text-primary-foreground" />}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Wallet Address */}
              <div className="space-y-1.5">
                <label htmlFor="wallet" className="text-sm font-semibold text-foreground">
                  {method === 'bank' ? 'Bank Account Number' : `${method.toUpperCase()} Wallet Address`}
                </label>
                <NexInput
                  id="wallet"
                  type="text"
                  placeholder={method === 'bank' ? 'e.g. 0000 4582 Checking' : `e.g. ${method === 'btc' ? 'bc1q...' : 'Txxxxxxxxxxxxxxxxxx'}`}
                  leftIcon={<Banknote className="size-[18px]" />}
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                />
              </div>

              {/* Account Name */}
              <div className="space-y-1.5">
                <label htmlFor="acct-name" className="text-sm font-semibold text-foreground">
                  Account / Name {method !== 'bank' && <span className="font-normal text-muted-foreground">(optional)</span>}
                </label>
                <NexInput
                  id="acct-name"
                  type="text"
                  placeholder={method === 'bank' ? 'e.g. John Doe' : 'e.g. John Doe (exchange name)'}
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label htmlFor="note" className="text-sm font-semibold text-foreground">
                  Optional Note <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <NexTextarea
                  id="note"
                  placeholder="Add any note for the finance team…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Submit */}
              <NexButton
                size="lg"
                className="w-full"
                isLoading={isSubmitting}
                disabled={!isValid}
                onClick={handleSubmit}
                leftIcon={!isSubmitting ? <ArrowDownToLine className="size-5" /> : undefined}
              >
                {isSubmitting ? 'Submitting…' : 'Request Withdrawal'}
              </NexButton>
            </NexCardContent>
          </NexCard>
        </motion.div>

        {/* Info + History */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="space-y-5 lg:col-span-2">
          {/* Info */}
          <NexCard className="border-primary/20 bg-primary/5 p-5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Info className="size-4" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Important Notices</h3>
            </div>
            <ul className="mt-3 space-y-2">
              {[
                'Withdrawals are reviewed manually by our finance team.',
                'Funds are reserved immediately upon submission.',
                `Minimum withdrawal amount is ${formatAmount(MIN_WITHDRAWAL)}.`,
                'If rejected, the reserved amount is returned to your balance.',
                'Incorrect wallet info may result in delayed or lost funds.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </NexCard>

          {/* History */}
          <NexCard className="overflow-hidden">
            <div className="border-b border-border p-5">
              <h3 className="text-sm font-bold tracking-tight text-foreground">Withdrawal History</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Your recent withdrawal requests</p>
            </div>
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : withdrawals.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="No withdrawals yet"
                description="Your withdrawal requests will appear here."
              />
            ) : (
              <div className="divide-y divide-border">
                {withdrawals.slice(0, 8).map((w) => {
                  const status = statusConfig[w.status] ?? statusConfig.pending;
                  const methodLabel = w.method === 'bank' ? 'Bank Transfer' : (w.currency || w.method).toUpperCase();
                  return (
                    <div key={w.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">
                          {formatAmount(Number(w.amount))}
                        </span>
                        <NexBadge variant={status.variant} size="sm" dot>{status.label}</NexBadge>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{methodLabel}{w.network ? ` · ${w.network}` : ''}</span>
                        <span>{new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      {w.status === 'approved' && w.tx_hash && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
                          <CheckCircle2 className="size-3" />
                          <span className="truncate">Tx: {w.tx_hash}</span>
                        </div>
                      )}
                      {w.status === 'rejected' && w.rejection_reason && (
                        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
                          <XCircle className="mt-0.5 size-3 shrink-0" />
                          <span className="truncate">{w.rejection_reason}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </NexCard>
        </motion.div>
      </div>

      {/* Success Modal */}
      <NexModal open={showSuccess} onOpenChange={setShowSuccess}>
        <NexModalContent className="max-w-md" hideClose>
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
              className="mb-5 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-warning to-warning/70 text-white shadow-[0_8px_24px_-4px_hsl(var(--warning)/0.5)]"
            >
              <Clock className="size-9" />
            </motion.div>
            <NexModalTitle>Withdrawal Submitted!</NexModalTitle>
            <NexModalDescription className="mt-2">
              Your withdrawal request for{' '}
              <span className="font-bold text-foreground">
                {formatAmount(withdrawAmount)}
              </span>{' '}
              has been received. Funds are reserved and pending verification.
            </NexModalDescription>
            <div className="mt-5 w-full rounded-xl bg-warning/10 p-4">
              <div className="flex items-center justify-center gap-2">
                <Clock className="size-4 text-warning" />
                <span className="text-sm font-bold text-warning">Pending Verification</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Approval usually takes 1–3 business days.
              </p>
            </div>
          </div>
          <NexModalFooter className="mt-2">
            <NexButton variant="outline" onClick={handleReset}>
              New Withdrawal
            </NexButton>
            <NexButton onClick={() => navigate('/home')}>
              Back to Home
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </div>
  );
}
