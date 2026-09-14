import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Crown, Plus, Save, Trash2, Loader2, AlertTriangle, Star } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexCardFooter, NexBadge, NexButton } from '@/components/ui/nex';
import { NexInput } from '@/components/ui/nex-input';
import { NexModal, NexModalContent, NexModalHeader, NexModalFooter, NexModalTitle, NexModalDescription } from '@/components/ui/nex-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchVipConfig, updateVipConfig, insertVipConfig, deleteVipConfig, logActivity, type VipConfigRow } from '@/lib/supabase/deposits';
import { setRuntimeVipConfig } from '@/lib/vip-config';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Gradient treatment per level: 0=muted gray, 1=primary blue, 2=secondary teal,
// 3=warning gold, 4+=emerald/amber (emerald for 4, amber for 5+)
function tierGradient(level: number): string {
  switch (level) {
    case 0:
      return 'from-muted to-muted/40 text-muted-foreground';
    case 1:
      return 'from-primary/20 to-primary/5 text-primary';
    case 2:
      return 'from-secondary/20 to-secondary/5 text-secondary';
    case 3:
      return 'from-warning/20 to-warning/5 text-warning';
    case 4:
      return 'from-emerald-500/20 to-emerald-500/5 text-emerald-500';
    default:
      return 'from-amber-500/20 to-amber-500/5 text-amber-500';
  }
}

function tierBadgeVariant(level: number): 'muted' | 'default' | 'secondary' | 'warning' {
  switch (level) {
    case 0:
      return 'muted';
    case 1:
      return 'default';
    case 2:
      return 'secondary';
    case 3:
      return 'warning';
    default:
      return 'default';
  }
}

type EditableFields = Pick<VipConfigRow, 'name' | 'daily_order_limit' | 'commission_rate' | 'min_deposit'>;

const emptyTier: EditableFields = {
  name: '',
  daily_order_limit: 0,
  commission_rate: 0,
  min_deposit: 0,
};

export function AdminVipPage() {
  const [tiers, setTiers] = useState<VipConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState<number | null>(null);
  const [editing, setEditing] = useState<Record<number, EditableFields>>({});
  const [dirty, setDirty] = useState<Record<number, boolean>>({});

  // Add tier modal
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTier, setNewTier] = useState<{ level: number } & EditableFields>({
    level: 0,
    ...emptyTier,
  });

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<VipConfigRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const syncRuntime = useCallback((rows: VipConfigRow[]) => {
    setRuntimeVipConfig(
      rows.map((r) => ({
        level: r.level,
        name: r.name,
        dailyOrderLimit: r.daily_order_limit,
        commissionRate: r.commission_rate,
        minDeposit: r.min_deposit,
      }))
    );
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const rows = await fetchVipConfig();
      setTiers(rows);
      syncRuntime(rows);
    } catch {
      toast.error('Failed to load VIP configuration');
    } finally {
      setLoading(false);
    }
  }, [syncRuntime]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Realtime subscription to vip_config
  useEffect(() => {
    const channel = supabase
      .channel('admin-vip-config-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vip_config' }, () => {
        loadConfig();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadConfig]);

  // ---- Edit helpers ----
  function startEdit(row: VipConfigRow): EditableFields {
    return {
      name: row.name,
      daily_order_limit: row.daily_order_limit,
      commission_rate: row.commission_rate,
      min_deposit: row.min_deposit,
    };
  }

  function updateField<K extends keyof EditableFields>(level: number, key: K, value: EditableFields[K]) {
    setEditing((prev) => {
      const current = prev[level] ?? startEdit(tiers.find((t) => t.level === level)!);
      return { ...prev, [level]: { ...current, [key]: value } };
    });
    setDirty((prev) => ({ ...prev, [level]: true }));
  }

  function getDraft(level: number): EditableFields {
    if (editing[level]) return editing[level]!;
    const row = tiers.find((t) => t.level === level);
    return row ? startEdit(row) : emptyTier;
  }

  function resetDraft(level: number) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[level];
      return next;
    });
    setDirty((prev) => {
      const next = { ...prev };
      delete next[level];
      return next;
    });
  }

  // ---- Actions ----
  async function handleSave(row: VipConfigRow) {
    const draft = getDraft(row.level);
    if (!draft.name.trim()) {
      toast.error('Tier name is required');
      return;
    }
    setSavingLevel(row.level);
    try {
      const updates: Partial<VipConfigRow> = {
        name: draft.name.trim(),
        daily_order_limit: Number(draft.daily_order_limit),
        commission_rate: Number(draft.commission_rate),
        min_deposit: Number(draft.min_deposit),
      };
      await updateVipConfig(row.level, updates);
      await logActivity(
        'admin',
        'update_vip_config',
        'vip_config',
        String(row.level),
        `Updated VIP${row.level} "${updates.name}" — limit ${updates.daily_order_limit}, rate ${updates.commission_rate}%, min deposit ${updates.min_deposit}`
      );
      toast.success(`VIP${row.level} saved`, { description: 'Changes are now live across the platform.' });
      resetDraft(row.level);
      await loadConfig();
    } catch {
      toast.error('Failed to save tier', { description: 'Please try again.' });
    } finally {
      setSavingLevel(null);
    }
  }

  async function handleAdd() {
    if (!newTier.name.trim()) {
      toast.error('Tier name is required');
      return;
    }
    if (tiers.some((t) => t.level === newTier.level)) {
      toast.error(`Level ${newTier.level} already exists`, { description: 'Choose a unique VIP level number.' });
      return;
    }
    setAdding(true);
    try {
      const input: VipConfigRow = {
        level: Number(newTier.level),
        name: newTier.name.trim(),
        daily_order_limit: Number(newTier.daily_order_limit),
        commission_rate: Number(newTier.commission_rate),
        min_deposit: Number(newTier.min_deposit),
        updated_at: new Date().toISOString(),
      };
      await insertVipConfig(input);
      await logActivity(
        'admin',
        'create_vip_config',
        'vip_config',
        String(input.level),
        `Created VIP${input.level} "${input.name}" — limit ${input.daily_order_limit}, rate ${input.commission_rate}%, min deposit ${input.min_deposit}`
      );
      toast.success(`VIP${input.level} created`, { description: input.name });
      setAddOpen(false);
      setNewTier({ level: 0, ...emptyTier });
      await loadConfig();
    } catch {
      toast.error('Failed to add tier', { description: 'Please try again.' });
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteVipConfig(deleteTarget.level);
      await logActivity(
        'admin',
        'delete_vip_config',
        'vip_config',
        String(deleteTarget.level),
        `Deleted VIP${deleteTarget.level} "${deleteTarget.name}"`
      );
      toast.success(`VIP${deleteTarget.level} deleted`, { description: deleteTarget.name });
      setDeleteTarget(null);
      await loadConfig();
    } catch {
      toast.error('Failed to delete tier', { description: 'Please try again.' });
    } finally {
      setDeleting(false);
    }
  }

  const nextLevel = tiers.length > 0 ? Math.max(...tiers.map((t) => t.level)) + 1 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="VIP Tier Management"
        subtitle="Configure VIP level rules, commission rates, and deposit thresholds."
        action={
          <div className="flex items-center gap-2">
            <NexBadge variant="success" dot>Realtime</NexBadge>
            <NexButton variant="primary" leftIcon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
              Add Tier
            </NexButton>
          </div>
        }
      />

      {/* Summary notice */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <NexCard className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <NexCardContent className="flex items-start gap-3 p-4 sm:p-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Crown className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                VIP rules are editable from this panel.
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                Changes take effect immediately across the platform. Edits sync to the runtime config
                and broadcast to all connected clients in realtime.
              </p>
            </div>
          </NexCardContent>
        </NexCard>
      </motion.div>

      {/* Tiers grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : tiers.length === 0 ? (
        <EmptyState
          icon={Crown}
          title="No VIP tiers configured"
          description="Add your first VIP tier to start defining commission rates and deposit thresholds."
          action={
            <NexButton leftIcon={<Plus className="size-4" />} onClick={() => setAddOpen(true)}>
              Add Tier
            </NexButton>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tiers.map((row, i) => {
            const draft = getDraft(row.level);
            const isSaving = savingLevel === row.level;
            const isDirty = dirty[row.level];
            const isVip0 = row.level === 0;

            return (
              <motion.div
                key={row.level}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                <NexCard className="h-full">
                  <NexCardHeader>
                    <div className={cn('flex items-center gap-3 rounded-xl bg-gradient-to-br p-4', tierGradient(row.level))}>
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card/80 shadow-sm">
                        {row.level === 0 ? <Star className="size-5" /> : <Crown className="size-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <NexBadge variant={tierBadgeVariant(row.level)} size="sm">
                            Level {row.level}
                          </NexBadge>
                          {isVip0 && <NexBadge variant="muted" size="sm">Default</NexBadge>}
                        </div>
                        <NexInput
                          className="mt-2 h-9 bg-card/90 font-semibold"
                          value={draft.name}
                          onChange={(e) => updateField(row.level, 'name', e.target.value)}
                          placeholder="Tier name"
                        />
                      </div>
                    </div>
                  </NexCardHeader>

                  <NexCardContent className="space-y-4">
                    <Field
                      label="Daily Order Limit"
                      hint="Max orders per day"
                      value={draft.daily_order_limit}
                      onChange={(v) => updateField(row.level, 'daily_order_limit', v)}
                    />
                    <Field
                      label="Commission Rate (%)"
                      hint="Per-order commission"
                      value={draft.commission_rate}
                      step="0.1"
                      onChange={(v) => updateField(row.level, 'commission_rate', v)}
                    />
                    <Field
                      label="Min Balance ($)"
                      hint="Current balance required for this VIP"
                      value={draft.min_deposit}
                      onChange={(v) => updateField(row.level, 'min_deposit', v)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Last updated{' '}
                      {new Date(row.updated_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </NexCardContent>

                  <NexCardFooter className="justify-between">
                    <NexButton
                      variant="danger"
                      size="sm"
                      disabled={isVip0}
                      leftIcon={<Trash2 className="size-4" />}
                      onClick={() => setDeleteTarget(row)}
                    >
                      Delete
                    </NexButton>
                    <NexButton
                      variant="primary"
                      size="sm"
                      isLoading={isSaving}
                      leftIcon={!isSaving ? <Save className="size-4" /> : undefined}
                      disabled={!isDirty}
                      onClick={() => handleSave(row)}
                    >
                      Save
                    </NexButton>
                  </NexCardFooter>
                </NexCard>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add Tier modal */}
      <NexModal open={addOpen} onOpenChange={setAddOpen}>
        <NexModalContent>
          <NexModalHeader>
            <NexModalTitle>Add VIP Tier</NexModalTitle>
            <NexModalDescription>
              Define a new VIP level. The level number must be unique.
            </NexModalDescription>
          </NexModalHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Level</label>
              <NexInput
                type="number"
                min={0}
                value={newTier.level}
                onChange={(e) => setNewTier((p) => ({ ...p, level: Number(e.target.value) }))}
                placeholder={String(nextLevel)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Name</label>
              <NexInput
                value={newTier.name}
                onChange={(e) => setNewTier((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. VIP4"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Daily Order Limit</label>
                <NexInput
                  type="number"
                  value={newTier.daily_order_limit}
                  onChange={(e) => setNewTier((p) => ({ ...p, daily_order_limit: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Commission Rate (%)</label>
                <NexInput
                  type="number"
                  step="0.1"
                  value={newTier.commission_rate}
                  onChange={(e) => setNewTier((p) => ({ ...p, commission_rate: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Min Balance ($)</label>
                <NexInput
                  type="number"
                  value={newTier.min_deposit}
                  onChange={(e) => setNewTier((p) => ({ ...p, min_deposit: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </NexButton>
            <NexButton isLoading={adding} leftIcon={!adding ? <Plus className="size-4" /> : undefined} onClick={handleAdd}>
              Add Tier
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>

      {/* Delete confirmation modal */}
      <NexModal open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <NexModalContent>
          <NexModalHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <NexModalTitle>Delete VIP{deleteTarget?.level}?</NexModalTitle>
                <NexModalDescription>
                  This will permanently remove the{' '}
                  <span className="font-semibold text-foreground">{deleteTarget?.name}</span> tier.
                  Users at this level will fall back to the nearest lower tier.
                </NexModalDescription>
              </div>
            </div>
          </NexModalHeader>
          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </NexButton>
            <NexButton
              variant="danger"
              isLoading={deleting}
              leftIcon={!deleting ? <Trash2 className="size-4" /> : undefined}
              onClick={handleDelete}
            >
              Delete Tier
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </div>
  );
}

// ---- Reusable numeric field ----
function Field({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  step?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-semibold text-muted-foreground">{label}</label>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </div>
      <NexInput
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
