import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Copy, Info, Loader2, ShieldCheck, UploadCloud, Wallet, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexTextarea } from '@/components/ui/nex-textarea';
import { useAuth } from '@/lib/auth';
import { useCopyToClipboard } from '@/lib/hooks/use-copy';
import { fetchActiveWallets, type WalletRow } from '@/lib/supabase/wallets';
import { insertDeposit, type DepositRow } from '@/lib/supabase/deposits';
import { cn } from '@/lib/utils';

const statusStyles: Record<DepositRow['status'], { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

function WalletAddress({ wallet }: { wallet: WalletRow }) {
  const { copiedKey, copy } = useCopyToClipboard();
  const copied = copiedKey === wallet.id;
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wallet address</p>
        <button
          type="button"
          onClick={() => copy(wallet.wallet_address, wallet.id)}
          className={cn(
            'flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors active:scale-95',
            copied ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-card text-foreground hover:bg-accent'
          )}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-3 break-all font-mono text-sm font-semibold leading-6 text-foreground">{wallet.wallet_address}</p>
    </div>
  );
}

export function RechargePage() {
  const navigate = useNavigate();
  const { user, deposits } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [note, setNote] = useState('');
  const [fileName, setFileName] = useState('');
  const [filePreview, setFilePreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetchActiveWallets()
      .then((rows) => {
        if (!active) return;
        setWallets(rows);
        setSelectedWalletId((current) => current || rows[0]?.id || '');
      })
      .catch(() => toast.error('Unable to load payment wallets'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) ?? null,
    [wallets, selectedWalletId]
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      toast.error('Choose a PNG or JPG image up to 10MB.');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setFilePreview(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  }

  function clearFile() {
    setFileName('');
    setFilePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submitDeposit() {
    const numericAmount = Number(amount);
    if (!user || !selectedWallet) return;
    if (!numericAmount || numericAmount < 1) {
      toast.error('Enter a deposit amount of at least $1.');
      return;
    }
    if (!filePreview) {
      toast.error('Upload your payment screenshot first.');
      return;
    }
    setSubmitting(true);
    try {
      await insertDeposit({
        user_id: user.id,
        user_email: user.email,
        user_name: user.fullName,
        amount: numericAmount,
        method: `${selectedWallet.token_name} — ${selectedWallet.network}`,
        screenshot_url: filePreview,
        transaction_id: transactionId.trim(),
        note: [selectedWallet.id, note.trim()].filter(Boolean).join(' | '),
      });
      toast.success('Deposit request submitted', { description: 'Our finance team will review it shortly.' });
      setAmount('');
      setTransactionId('');
      setNote('');
      clearFile();
    } catch (error) {
      toast.error('Deposit submission failed', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recharge"
        subtitle="Deposit crypto safely into your Hawksem account."
        action={<NexButton variant="outline" size="sm" leftIcon={<ArrowLeft className="size-4" />} onClick={() => navigate('/home')}>Back</NexButton>}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-gradient-to-br from-primary via-primary to-secondary p-5 shadow-pop sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/75">Current balance</p>
            <p className="mt-1 text-3xl font-bold text-white">${(user?.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white">VIP{user?.vipLevel ?? 0}</span>
            <span className="flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white"><ShieldCheck className="size-3.5" /> Secure deposit</span>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <NexCard className="flex min-h-72 items-center justify-center"><Loader2 className="size-7 animate-spin text-primary" /></NexCard>
      ) : wallets.length === 0 ? (
        <NexCard className="p-8 text-center">
          <Wallet className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-bold text-foreground">No payment methods available</h2>
          <p className="mt-2 text-sm text-muted-foreground">The admin has not enabled a crypto wallet yet. Please check back later.</p>
        </NexCard>
      ) : (
        <>
          <NexCard className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">1</span><h2 className="text-base font-bold text-foreground">Select cryptocurrency</h2></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  type="button"
                  onClick={() => setSelectedWalletId(wallet.id)}
                  className={cn('rounded-2xl border p-4 text-left transition-all', selectedWalletId === wallet.id ? 'border-primary bg-primary/5 ring-1 ring-primary/25' : 'border-border hover:border-primary/30')}
                >
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-foreground">{wallet.display_name || wallet.token_name}</span>{selectedWalletId === wallet.id && <Check className="size-5 text-primary" />}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{wallet.token_name} · {wallet.network}</p>
                </button>
              ))}
            </div>
          </NexCard>

          {selectedWallet && (
            <NexCard className="p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deposit {selectedWallet.token_name}</p><h2 className="mt-1 text-xl font-bold text-foreground">{selectedWallet.network}</h2></div>
                <NexBadge variant="success" dot>Active network</NexBadge>
              </div>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4"><p className="text-sm font-bold text-foreground">Send only {selectedWallet.token_name} on {selectedWallet.network} to this address.</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Sending a different token or using another network can permanently lose your funds.</p></div>
                  <WalletAddress wallet={selectedWallet} />
                  {selectedWallet.contract_address && <div className="rounded-2xl border border-border bg-muted/30 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contract address</p><p className="mt-2 break-all font-mono text-xs text-foreground">{selectedWallet.contract_address}</p></div>}
                  <div className="rounded-2xl border border-border bg-primary/5 p-4"><div className="flex items-start gap-3"><Info className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-sm leading-relaxed text-foreground">{selectedWallet.instructions || `Confirm the network in your wallet before sending ${selectedWallet.token_name}. Keep your transaction hash for verification.`}</p></div></div>
                </div>
                <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-white p-4">
                  {selectedWallet.qr_image_url ? <img src={selectedWallet.qr_image_url} alt={`${selectedWallet.token_name} ${selectedWallet.network} deposit QR`} className="w-full max-w-[240px] object-contain" /> : <div className="flex aspect-square w-full max-w-[240px] items-center justify-center rounded-xl bg-muted p-8 text-center text-sm text-muted-foreground">QR code not configured</div>}
                  <p className="mt-3 text-center text-xs font-semibold text-slate-600">Scan to deposit on {selectedWallet.network}</p>
                </div>
              </div>
            </NexCard>
          )}

          <NexCard className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">2</span><h2 className="text-base font-bold text-foreground">Submit deposit proof</h2></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><label className="text-sm font-semibold text-foreground">Deposit amount (USD)</label><NexInput type="number" min="1" step="0.01" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-sm font-semibold text-foreground">Transaction ID / TX hash</label><NexInput placeholder="Paste transaction hash" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className="font-mono text-xs" /></div>
            </div>
            <div className="mt-4 space-y-1.5"><label className="text-sm font-semibold text-foreground">Payment screenshot</label><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleFileChange} className="hidden" />{filePreview ? <div className="relative overflow-hidden rounded-2xl border border-border"><img src={filePreview} alt="Payment screenshot preview" className="max-h-72 w-full object-cover" /><div className="flex items-center justify-between gap-3 border-t border-border bg-card p-3"><span className="truncate text-sm text-foreground">{fileName}</span><button type="button" onClick={clearFile} className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-danger/10 hover:text-danger"><X className="size-4" /></button></div></div> : <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-5 py-8 text-center hover:border-primary/40 hover:bg-primary/5"><UploadCloud className="size-8 text-primary" /><span className="text-sm font-semibold text-foreground">Upload payment screenshot</span><span className="text-xs text-muted-foreground">PNG or JPG, up to 10MB</span></button>}</div>
            <div className="mt-4 space-y-1.5"><label className="text-sm font-semibold text-foreground">Additional note <span className="font-normal text-muted-foreground">(optional)</span></label><NexTextarea rows={3} placeholder="Add information for the finance team" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <NexButton className="mt-5 w-full" size="lg" onClick={submitDeposit} isLoading={submitting} leftIcon={!submitting ? <UploadCloud className="size-5" /> : undefined}>{submitting ? 'Submitting…' : 'Submit Deposit Request'}</NexButton>
          </NexCard>

          <NexCard className="overflow-hidden"><div className="border-b border-border p-5"><h2 className="font-bold text-foreground">Deposit history</h2><p className="mt-1 text-xs text-muted-foreground">Your submitted requests and review status</p></div><div className="divide-y divide-border">{deposits.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No deposit requests yet.</p> : deposits.map((deposit) => { const status = statusStyles[deposit.status]; return <div key={deposit.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold text-foreground">${Number(deposit.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p><p className="mt-1 text-xs text-muted-foreground">{deposit.method} · {new Date(deposit.created_at).toLocaleString()}</p></div><NexBadge variant={status.variant} dot>{status.label}</NexBadge></div>; })}</div></NexCard>
        </>
      )}
    </div>
  );
}
