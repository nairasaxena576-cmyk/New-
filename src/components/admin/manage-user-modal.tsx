import { useEffect, useState, useCallback } from 'react';
import {
  Settings2,
  Crown,
  Wallet,
  Coins,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  Save,
  Loader2,
  Shield,
  AlertTriangle,
  UserCircle,
  Mail,
  Hash,
  Gift,
  TrendingUp,
  Lock,
  Play,
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
import { NexTextarea } from '@/components/ui/nex-textarea';
import { NexBadge } from '@/components/ui/nex';
import { Switch } from '@/components/ui/switch';
import { computeVipLevel } from '@/lib/vip-config';
import {
  fetchUserLuckySettings,
  adminUpdateUserLuckySettings,
  adminSetStartAccess,
  type UserProfileRow,
  type UserLuckySettingsRow,
} from '@/lib/supabase/deposits';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ManageUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfileRow | null;
  onUpdated?: () => void;
}

function formatCurrency(value: number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ManageUserModal({ open, onOpenChange, user, onUpdated }: ManageUserModalProps) {
  const { user: adminUser } = useAuth();
  const [luckySettings, setLuckySettings] = useState<UserLuckySettingsRow | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Form state
  const [luckyEnabled, setLuckyEnabled] = useState(false);
  const [luckyChance, setLuckyChance] = useState('0');
  const [luckyCommission, setLuckyCommission] = useState('0');
  const [luckyDailyLimit, setLuckyDailyLimit] = useState('5');
  const [luckyMinPrice, setLuckyMinPrice] = useState('');
  const [luckyMaxPrice, setLuckyMaxPrice] = useState('');
  const [startAccess, setStartAccess] = useState(true);
  const [blockMessage, setBlockMessage] = useState('');
  const [startAccessSaving, setStartAccessSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    setLoadingSettings(true);
    try {
      const settings = await fetchUserLuckySettings(user.user_id);
      setLuckySettings(settings);
      if (settings) {
        setLuckyEnabled(settings.lucky_enabled);
        setLuckyChance(String(settings.lucky_chance_percent));
        setLuckyCommission(String(settings.lucky_commission_percent));
        setLuckyDailyLimit(String(settings.lucky_daily_limit));
        setLuckyMinPrice(settings.lucky_min_price != null ? String(settings.lucky_min_price) : '');
        setLuckyMaxPrice(settings.lucky_max_price != null ? String(settings.lucky_max_price) : '');
      } else {
        setLuckyEnabled(false);
        setLuckyChance('0');
        setLuckyCommission('0');
        setLuckyDailyLimit('5');
        setLuckyMinPrice('');
        setLuckyMaxPrice('');
      }
    } catch {
      setLuckySettings(null);
    } finally {
      setLoadingSettings(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      loadSettings();
      setStartAccess(user.start_access_enabled ?? true);
      setBlockMessage(user.start_access_block_message ?? '');
      setShowConfirm(false);
    }
  }, [open, user, loadSettings]);

  if (!user) return null;

  const vipLevel = computeVipLevel(user.total_deposits);
  const status = user.status || 'active';

  const chanceNum = parseFloat(luckyChance) || 0;
  const commissionNum = parseFloat(luckyCommission) || 0;
  const dailyLimitNum = parseInt(luckyDailyLimit) || 0;
  const minPriceNum = luckyMinPrice ? parseFloat(luckyMinPrice) : null;
  const maxPriceNum = luckyMaxPrice ? parseFloat(luckyMaxPrice) : null;

  const hasChanges = (() => {
    if (!luckySettings) return luckyEnabled || chanceNum > 0 || commissionNum > 0 || dailyLimitNum !== 5;
    return (
      luckySettings.lucky_enabled !== luckyEnabled ||
      Number(luckySettings.lucky_chance_percent) !== chanceNum ||
      Number(luckySettings.lucky_commission_percent) !== commissionNum ||
      Number(luckySettings.lucky_daily_limit) !== dailyLimitNum ||
      (luckySettings.lucky_min_price ?? null) !== minPriceNum ||
      (luckySettings.lucky_max_price ?? null) !== maxPriceNum
    );
  })();

  function handleSaveClick() {
    if (chanceNum < 0 || chanceNum > 100) {
      toast.error('Lucky chance must be between 0 and 100');
      return;
    }
    if (commissionNum < 0 || commissionNum > 100) {
      toast.error('Lucky commission must be between 0 and 100');
      return;
    }
    if (dailyLimitNum < 0) {
      toast.error('Daily limit cannot be negative');
      return;
    }
    setShowConfirm(true);
  }

  async function handleConfirmSave() {
    if (!user || !adminUser) return;
    setSaving(true);
    try {
      await adminUpdateUserLuckySettings({
        adminId: adminUser.id,
        userId: user.user_id,
        luckyEnabled,
        luckyChancePercent: chanceNum,
        luckyCommissionPercent: commissionNum,
        luckyDailyLimit: dailyLimitNum,
        luckyMinPrice: minPriceNum,
        luckyMaxPrice: maxPriceNum,
      });
      toast.success('Lucky product settings saved', {
        description: `${user.full_name || user.email} — ${luckyEnabled ? 'Enabled' : 'Disabled'}`,
      });
      setShowConfirm(false);
      await loadSettings();
      onUpdated?.();
    } catch (err) {
      toast.error('Failed to save settings', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStartAccess() {
    if (!user || !adminUser) return;
    setStartAccessSaving(true);
    try {
      await adminSetStartAccess(adminUser.id, user.user_id, startAccess, startAccess ? undefined : blockMessage.trim() || undefined);
      toast.success(startAccess ? 'Start page access enabled' : 'Start page access blocked', {
        description: user.full_name || user.email,
      });
      onUpdated?.();
    } catch (err) {
      toast.error('Failed to save Start page access', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setStartAccessSaving(false);
    }
  }

  return (
    <NexModal open={open} onOpenChange={onOpenChange}>
      <NexModalContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <NexModalHeader>
          <NexModalTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings2 className="size-4" />
            </span>
            Manage User
          </NexModalTitle>
          <NexModalDescription>
            View customer details and configure per-user lucky product settings.
          </NexModalDescription>
        </NexModalHeader>

        {/* Customer Profile Summary */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
              {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-base font-bold text-foreground">{user.full_name || 'Unknown'}</p>
              <div className="flex flex-wrap gap-2">
                <NexBadge variant={vipLevel > 0 ? 'warning' : 'muted'} size="sm">
                  <Crown className="size-3" />
                  VIP{vipLevel}
                </NexBadge>
                <NexBadge variant={status === 'active' ? 'success' : 'danger'} size="sm" dot>
                  {status}
                </NexBadge>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={Hash} label="User ID" value={user.user_id.slice(0, 12) + '...'} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatChip icon={Wallet} label="Balance" value={formatCurrency(user.balance)} tint="text-primary" />
            <StatChip icon={Coins} label="Deposits" value={formatCurrency(user.total_deposits)} tint="text-warning" />
            <StatChip icon={ArrowDownRight} label="Withdrawals" value={formatCurrency(0)} tint="text-danger" />
            <StatChip icon={TrendingUp} label="Commission" value={formatCurrency(user.lifetime_commission)} tint="text-success" />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoRow icon={Gift} label="Referral Code" value={user.referral_code || 'N/A'} />
            <InfoRow icon={UserCircle} label="Invited By" value={user.inviter_id ? user.inviter_id.slice(0, 12) + '...' : 'None'} />
          </div>
        </div>

        {/* Start Page Access */}
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <Play className="size-4 text-primary" />
            <h4 className="text-sm font-bold text-foreground">Start Page Access</h4>
            <span className="text-xs text-muted-foreground">— control access to the Start page</span>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'flex size-10 items-center justify-center rounded-lg',
                  startAccess ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                )}>
                  {startAccess ? <Play className="size-5" /> : <Lock className="size-5" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Start Page: <span className={startAccess ? 'text-success' : 'text-danger'}>{startAccess ? 'Enabled' : 'Blocked'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {startAccess
                      ? 'Customer can access the Start page and tasks'
                      : 'Customer is blocked from the Start page'}
                  </p>
                </div>
              </div>
              <Switch
                checked={startAccess}
                onCheckedChange={setStartAccess}
                disabled={startAccessSaving}
              />
            </div>

            {!startAccess && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Block Message</label>
                <NexTextarea
                  rows={3}
                  placeholder="Custom message shown to the customer when they try to access the Start page…"
                  value={blockMessage}
                  onChange={(e) => setBlockMessage(e.target.value)}
                  disabled={startAccessSaving}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This message is displayed on the blocked-access screen.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <NexButton
                onClick={handleSaveStartAccess}
                isLoading={startAccessSaving}
                leftIcon={<Save className="size-4" />}
              >
                Save Start Access
              </NexButton>
            </div>
          </div>
        </div>

        {/* Lucky Product Settings */}
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-warning" />
            <h4 className="text-sm font-bold text-foreground">Lucky Product Settings</h4>
            <span className="text-xs text-muted-foreground">— per-user configuration</span>
          </div>

          {loadingSettings ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-muted/20">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Lucky Product Enabled</p>
                  <p className="text-xs text-muted-foreground">Turn ON to activate lucky products for this customer</p>
                </div>
                <Switch checked={luckyEnabled} onCheckedChange={setLuckyEnabled} />
              </div>

              {/* Percentage inputs */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Chance (%)</label>
                  <NexInput
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={luckyChance}
                    onChange={(e) => setLuckyChance(e.target.value)}
                    disabled={!luckyEnabled}
                    className="h-10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Commission (%)</label>
                  <NexInput
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={luckyCommission}
                    onChange={(e) => setLuckyCommission(e.target.value)}
                    disabled={!luckyEnabled}
                    className="h-10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Daily Limit</label>
                  <NexInput
                    type="number"
                    min="0"
                    step="1"
                    value={luckyDailyLimit}
                    onChange={(e) => setLuckyDailyLimit(e.target.value)}
                    disabled={!luckyEnabled}
                    className="h-10"
                  />
                </div>
              </div>

              {/* Price range */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Min Price (optional)</label>
                  <NexInput
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No minimum"
                    value={luckyMinPrice}
                    onChange={(e) => setLuckyMinPrice(e.target.value)}
                    disabled={!luckyEnabled}
                    className="h-10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Max Price (optional)</label>
                  <NexInput
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No maximum"
                    value={luckyMaxPrice}
                    onChange={(e) => setLuckyMaxPrice(e.target.value)}
                    disabled={!luckyEnabled}
                    className="h-10"
                  />
                </div>
              </div>

              {/* Commission preview */}
              {luckyEnabled && commissionNum > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-xs text-muted-foreground">Commission Preview</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    $100 product × {commissionNum}% = <span className="text-warning">{formatCurrency(100 * commissionNum / 100)}</span> reward
                  </p>
                </div>
              )}

              {/* Save button */}
              <div className="flex justify-end">
                <NexButton
                  onClick={handleSaveClick}
                  disabled={!hasChanges || saving}
                  leftIcon={<Save className="size-4" />}
                >
                  Save Changes
                </NexButton>
              </div>
            </div>
          )}
        </div>

        <NexModalFooter>
          <NexButton variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </NexButton>
        </NexModalFooter>
      </NexModalContent>

      {/* Confirmation sub-modal */}
      <NexModal open={showConfirm} onOpenChange={setShowConfirm}>
        <NexModalContent className="max-w-md">
          <NexModalHeader>
            <NexModalTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Shield className="size-4" />
              </span>
              Confirm Lucky Product Settings
            </NexModalTitle>
            <NexModalDescription>
              These settings will override the global defaults for this customer.
            </NexModalDescription>
          </NexModalHeader>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="font-semibold text-foreground">{user.full_name || 'Unknown'}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Lucky Enabled</span>
                <span className={cn('font-bold', luckyEnabled ? 'text-success' : 'text-danger')}>
                  {luckyEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
              {luckyEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Chance</span>
                    <span className="font-semibold text-foreground">{chanceNum}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Commission</span>
                    <span className="font-semibold text-foreground">{commissionNum}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Daily Limit</span>
                    <span className="font-semibold text-foreground">{dailyLimitNum}</span>
                  </div>
                  {minPriceNum != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Min Price</span>
                      <span className="font-semibold text-foreground">{formatCurrency(minPriceNum)}</span>
                    </div>
                  )}
                  {maxPriceNum != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Max Price</span>
                      <span className="font-semibold text-foreground">{formatCurrency(maxPriceNum)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/5 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>This will affect how lucky products are generated for this customer.</span>
          </div>

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setShowConfirm(false)} disabled={saving}>
              Cancel
            </NexButton>
            <NexButton onClick={handleConfirmSave} isLoading={saving} leftIcon={<Save className="size-4" />}>
              Confirm & Save
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </NexModal>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function StatChip({ icon: Icon, label, value, tint }: { icon: typeof Wallet; label: string; value: string; tint: string }) {
  return (
    <div className="rounded-lg bg-background px-3 py-2.5">
      <Icon className={cn('size-4', tint)} />
      <p className="mt-1.5 text-sm font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
