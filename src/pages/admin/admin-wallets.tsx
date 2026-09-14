import { useEffect, useState, useCallback, useRef, type ChangeEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Copy,
  Check,
  QrCode,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
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
  fetchAllWallets,
  insertWallet,
  updateWallet,
  deleteWallet,
  uploadWalletQr,
  type WalletRow,
  type WalletInput,
} from '@/lib/supabase/wallets';
import { logActivity } from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';
import { useCopyToClipboard } from '@/lib/hooks/use-copy';
import { cn } from '@/lib/utils';

interface WalletFormData {
  token_name: string;
  display_name: string;
  network: string;
  wallet_address: string;
  contract_address: string;
  qr_image_url: string;
  instructions: string;
  is_active: boolean;
  sort_order: number;
}

const EMPTY_FORM: WalletFormData = {
  token_name: '',
  display_name: '',
  network: '',
  wallet_address: '',
  contract_address: '',
  qr_image_url: '',
  instructions: '',
  is_active: true,
  sort_order: 0,
};

export function AdminWalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WalletFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WalletRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const loadWallets = useCallback(async () => {
    try {
      const rows = await fetchAllWallets();
      setWallets(rows);
    } catch {
      toast.error('Failed to load wallets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-wallets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_wallets' }, () => {
        loadWallets();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadWallets]);

  function openAdd() {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(wallet: WalletRow) {
    setEditingId(wallet.id);
    setFormData({
      token_name: wallet.token_name,
      display_name: wallet.display_name,
      network: wallet.network,
      wallet_address: wallet.wallet_address,
      contract_address: wallet.contract_address ?? '',
      qr_image_url: wallet.qr_image_url ?? '',
      instructions: wallet.instructions ?? '',
      is_active: wallet.is_active,
      sort_order: wallet.sort_order,
    });
    setFormOpen(true);
  }

  async function handleQrUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    try {
      const url = await uploadWalletQr(file);
      setFormData((prev) => ({ ...prev, qr_image_url: url }));
      toast.success('QR code uploaded');
    } catch (err) {
      toast.error('Upload failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setQrUploading(false);
      if (qrInputRef.current) qrInputRef.current.value = '';
    }
  }

  async function handleSubmit() {
    if (!formData.token_name.trim() || !formData.wallet_address.trim() || !formData.network.trim()) {
      toast.error('Required fields missing', {
        description: 'Token name, network, and wallet address are required.',
      });
      return;
    }
    setSaving(true);
    try {
      const payload: WalletInput = {
        token_name: formData.token_name.trim(),
        display_name: formData.display_name.trim() || formData.token_name.trim(),
        network: formData.network.trim(),
        wallet_address: formData.wallet_address.trim(),
        contract_address: formData.contract_address.trim() || null,
        qr_image_url: formData.qr_image_url.trim() || null,
        instructions: formData.instructions.trim() || null,
        is_active: formData.is_active,
        sort_order: formData.sort_order,
      };
      if (editingId) {
        await updateWallet(editingId, payload);
        await logActivity('admin', 'update_wallet', 'wallet', editingId, `Updated ${payload.token_name} wallet`);
        toast.success('Wallet updated', { description: `${payload.token_name} — ${payload.network}` });
      } else {
        const created = await insertWallet(payload);
        await logActivity('admin', 'create_wallet', 'wallet', created.id, `Created ${payload.token_name} wallet`);
        toast.success('Wallet added', { description: `${payload.token_name} — ${payload.network}` });
      }
      setFormOpen(false);
      await loadWallets();
    } catch (err) {
      toast.error(editingId ? 'Failed to update wallet' : 'Failed to add wallet', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWallet(deleteTarget.id);
      await logActivity('admin', 'delete_wallet', 'wallet', deleteTarget.id, `Deleted ${deleteTarget.token_name} wallet`);
      toast.success('Wallet deleted', { description: deleteTarget.token_name });
      setDeleteTarget(null);
      await loadWallets();
    } catch (err) {
      toast.error('Failed to delete wallet', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setDeleting(false);
    }
  }

  const activeCount = wallets.filter((w) => w.is_active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet & Payment Settings"
        subtitle="Manage cryptocurrency wallets shown on the customer recharge page."
        action={
          <div className="flex items-center gap-2">
            <NexBadge variant="success" dot>Realtime</NexBadge>
            <NexButton leftIcon={<Plus className="size-4" />} onClick={openAdd}>
              Add Wallet
            </NexButton>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Wallets', value: String(wallets.length), tint: 'from-primary/10 to-primary/5 text-primary' },
          { label: 'Active', value: String(activeCount), tint: 'from-success/10 to-success/5 text-success' },
          { label: 'Inactive', value: String(wallets.length - activeCount), tint: 'from-muted/20 to-muted/10 text-muted-foreground' },
        ].map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.07 }}>
            <NexCard className="p-5">
              <div className={cn('flex size-11 items-center justify-center rounded-xl bg-gradient-to-br', k.tint)}>
                <Wallet className="size-5" />
              </div>
              <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">{k.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{k.label}</p>
            </NexCard>
          </motion.div>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : wallets.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No wallets configured"
          description="Add your first crypto wallet so customers can make deposits."
          action={
            <NexButton leftIcon={<Plus className="size-4" />} onClick={openAdd}>
              Add Wallet
            </NexButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {wallets.map((wallet, i) => (
              <motion.div
                key={wallet.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.2) }}
              >
                <WalletCard
                  wallet={wallet}
                  onEdit={() => openEdit(wallet)}
                  onDelete={() => setDeleteTarget(wallet)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add/Edit modal */}
      <NexModal open={formOpen} onOpenChange={setFormOpen}>
        <NexModalContent className="max-w-lg">
          <NexModalHeader>
            <NexModalTitle>{editingId ? 'Edit Wallet' : 'Add Wallet'}</NexModalTitle>
            <NexModalDescription>
              Configure the crypto wallet shown on the recharge page.
            </NexModalDescription>
          </NexModalHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Token Name *">
                <NexInput
                  placeholder="e.g. USDT"
                  value={formData.token_name}
                  onChange={(e) => setFormData((p) => ({ ...p, token_name: e.target.value }))}
                />
              </Field>
              <Field label="Display Name">
                <NexInput
                  placeholder="e.g. Tether USD"
                  value={formData.display_name}
                  onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Network *">
                <NexInput
                  placeholder="e.g. BSC (BEP20)"
                  value={formData.network}
                  onChange={(e) => setFormData((p) => ({ ...p, network: e.target.value }))}
                />
              </Field>
              <Field label="Sort Order">
                <NexInput
                  type="number"
                  placeholder="0"
                  value={String(formData.sort_order)}
                  onChange={(e) => setFormData((p) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </Field>
            </div>

            <Field label="Wallet Address *">
              <NexInput
                placeholder="0x... or T..."
                value={formData.wallet_address}
                onChange={(e) => setFormData((p) => ({ ...p, wallet_address: e.target.value }))}
                className="font-mono text-xs"
              />
            </Field>

            <Field label="Contract Address (optional)">
              <NexInput
                placeholder="Token contract address"
                value={formData.contract_address}
                onChange={(e) => setFormData((p) => ({ ...p, contract_address: e.target.value }))}
                className="font-mono text-xs"
              />
            </Field>

            <Field label="Deposit Instructions (optional)">
              <NexTextarea
                placeholder="e.g. Send only USDT on BSC network. Do not send from exchange wallets."
                value={formData.instructions}
                onChange={(e) => setFormData((p) => ({ ...p, instructions: e.target.value }))}
                rows={3}
              />
            </Field>

            {/* QR upload */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">QR Code Image</label>
              <input
                ref={qrInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleQrUpload}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                {formData.qr_image_url ? (
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-white">
                    <img src={formData.qr_image_url} alt="QR preview" className="size-full object-contain" />
                  </div>
                ) : (
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30">
                    <QrCode className="size-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <NexButton
                    variant="outline"
                    size="sm"
                    leftIcon={qrUploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    onClick={() => qrInputRef.current?.click()}
                    disabled={qrUploading}
                  >
                    {qrUploading ? 'Uploading…' : formData.qr_image_url ? 'Replace QR' : 'Upload QR'}
                  </NexButton>
                  {formData.qr_image_url && (
                    <NexButton
                      variant="ghost"
                      size="sm"
                      leftIcon={<X className="size-4" />}
                      onClick={() => setFormData((p) => ({ ...p, qr_image_url: '' }))}
                    >
                      Remove
                    </NexButton>
                  )}
                </div>
              </div>
            </div>

            {/* Active toggle */}
            <label className="flex cursor-pointer items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData((p) => ({ ...p, is_active: !p.is_active }))}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  formData.is_active ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform',
                    formData.is_active ? 'left-0.5 translate-x-5' : 'left-0.5'
                  )}
                />
              </button>
              <span className="text-sm font-medium text-foreground">
                {formData.is_active ? 'Active — visible on recharge page' : 'Inactive — hidden from customers'}
              </span>
            </label>
          </div>

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setFormOpen(false)}>Cancel</NexButton>
            <NexButton onClick={handleSubmit} isLoading={saving}>
              {editingId ? 'Save Changes' : 'Add Wallet'}
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>

      {/* Delete confirm */}
      <NexModal open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <NexModalContent className="max-w-md" hideClose>
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-danger/10 text-danger">
              <AlertTriangle className="size-8" />
            </div>
            <NexModalTitle>Delete Wallet?</NexModalTitle>
            <NexModalDescription className="mt-2">
              Remove <span className="font-semibold text-foreground">{deleteTarget?.token_name}</span> on{' '}
              <span className="font-semibold text-foreground">{deleteTarget?.network}</span> from the recharge page.
              This cannot be undone.
            </NexModalDescription>
          </div>
          <NexModalFooter className="mt-2">
            <NexButton variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</NexButton>
            <NexButton variant="danger" onClick={handleDelete} isLoading={deleting}>Delete</NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}

function WalletCard({
  wallet,
  onEdit,
  onDelete,
}: {
  wallet: WalletRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { copiedKey, copy } = useCopyToClipboard();
  const isCopied = copiedKey === wallet.id;

  return (
    <NexCard className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-foreground">{wallet.token_name}</span>
            <NexBadge variant={wallet.is_active ? 'success' : 'default'} size="sm" dot>
              {wallet.is_active ? 'Active' : 'Inactive'}
            </NexBadge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{wallet.network}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={onEdit}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Edit wallet"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDelete}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
            aria-label="Delete wallet"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-4">
        {/* QR */}
        {wallet.qr_image_url && (
          <div className="mb-3 flex justify-center rounded-xl border border-border bg-white p-2">
            <img src={wallet.qr_image_url} alt={`${wallet.token_name} QR`} className="size-32 object-contain" />
          </div>
        )}

        {/* Address */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Address</p>
            <p className="mt-0.5 break-all font-mono text-xs font-medium text-foreground">{wallet.wallet_address}</p>
          </div>
          <button
            onClick={() => copy(wallet.wallet_address, wallet.id)}
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-all active:scale-90',
              isCopied
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
            aria-label="Copy address"
          >
            {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
        </div>

        {wallet.contract_address && (
          <p className="mt-2 break-all text-[11px] text-muted-foreground">
            <span className="font-semibold">Contract: </span>
            <span className="font-mono">{wallet.contract_address}</span>
          </p>
        )}
      </div>
    </NexCard>
  );
}
