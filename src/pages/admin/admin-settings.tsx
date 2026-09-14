import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Info, Wallet, Crown, Megaphone, AlertTriangle, ArrowRight, Loader2, Database, Shield, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardDescription, NexCardContent, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { fetchVipConfig, fetchAnnouncements, fetchDashboardStats, type VipConfigRow, type AnnouncementRow, type DashboardStats } from '@/lib/supabase/deposits';
import { cn } from '@/lib/utils';

const PLATFORM_NAME = 'Hawksem';
const PLATFORM_VERSION = 'v1.0.0';

// Deposit channel details — configured in code (src/lib/recharge/constants.ts).
// Displayed read-only here; update the source file to change values.
const BANK_DETAILS = {
  bankName: 'First National Escrow Bank',
  accountName: 'Hawksem Digital Marketing Agency',
  accountNumber: '8842  5671  9023',
  routingNumber: '021000021',
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function AdminSettingsPage() {
  const [vipTiers, setVipTiers] = useState<VipConfigRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [vip, ann, dash] = await Promise.all([
          fetchVipConfig(),
          fetchAnnouncements(),
          fetchDashboardStats(),
        ]);
        if (!active) return;
        setVipTiers(vip);
        setAnnouncements(ann);
        setStats(dash);
      } catch {
        // Settings are informational — fail silently and render empty states.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const activeAnnouncements = announcements.filter((a) => a.is_active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Settings"
        subtitle="Platform configuration, deposit channels, and operational parameters."
        action={<NexBadge variant="success" dot>System Operational</NexBadge>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Platform Information */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0 }}>
          <NexCard className="h-full">
            <NexCardHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
                  <Settings className="size-5" />
                </div>
                <div>
                  <NexCardTitle>Platform Information</NexCardTitle>
                  <NexCardDescription>Core identity and runtime environment.</NexCardDescription>
                </div>
              </div>
            </NexCardHeader>
            <NexCardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoTile label="Platform" value={PLATFORM_NAME} />
                <InfoTile label="Version" value={PLATFORM_VERSION} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Environment</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">Production</p>
                </div>
                <NexBadge variant="success" dot>Live</NexBadge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatusIndicator icon={Database} label="Database" value="Connected" tint="text-success" />
                <StatusIndicator icon={Shield} label="RLS" value="Enabled" tint="text-success" />
                <StatusIndicator icon={Zap} label="Realtime" value="Active" tint="text-primary" />
              </div>
            </NexCardContent>
          </NexCard>
        </motion.div>

        {/* Deposit Settings */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
          <NexCard className="h-full">
            <NexCardHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-success/15 to-success/5 text-success">
                  <Wallet className="size-5" />
                </div>
                <div>
                  <NexCardTitle>Deposit Settings</NexCardTitle>
                  <NexCardDescription>Bank and USDT payment channels.</NexCardDescription>
                </div>
              </div>
            </NexCardHeader>
            <NexCardContent className="space-y-4">
              {/* Bank transfer */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank Transfer</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ReadOnlyField label="Bank Name" value={BANK_DETAILS.bankName} />
                  <ReadOnlyField label="Account Name" value={BANK_DETAILS.accountName} />
                  <ReadOnlyField label="Account Number" value={BANK_DETAILS.accountNumber} />
                  <ReadOnlyField label="Routing Number" value={BANK_DETAILS.routingNumber} />
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Wallet className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Crypto Wallets</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Manage active wallet addresses, networks, instructions, and QR images used on Recharge.</p>
                  </div>
                </div>
                <NexButton variant="outline" size="sm" asChild className="w-full">
                  <Link to="/admin/wallets">Manage Crypto Wallets <ArrowRight className="size-4" /></Link>
                </NexButton>
              </div>
            </NexCardContent>
          </NexCard>
        </motion.div>

        {/* VIP System */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}>
          <NexCard className="h-full">
            <NexCardHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-warning/15 to-warning/5 text-warning">
                  <Crown className="size-5" />
                </div>
                <div className="flex-1">
                  <NexCardTitle>VIP System</NexCardTitle>
                  <NexCardDescription>Tier rules, commissions, and deposit thresholds.</NexCardDescription>
                </div>
                <NexBadge variant="warning">{loading ? '—' : `${vipTiers.length} tiers`}</NexBadge>
              </div>
            </NexCardHeader>
            <NexCardContent className="space-y-4">
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : vipTiers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No VIP tiers configured.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tier</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Daily Limit</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Commission</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Min Deposit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {vipTiers.map((tier) => (
                        <tr key={tier.level} className="bg-card/50">
                          <td className="px-3 py-2 font-medium text-foreground">{tier.name}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{formatNumber(tier.daily_order_limit)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{tier.commission_rate}%</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrency(tier.min_deposit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <NexButton variant="outline" size="sm" asChild className="w-full">
                <Link to="/admin/vip">
                  Manage VIP Tiers
                  <ArrowRight className="size-4" />
                </Link>
              </NexButton>
            </NexCardContent>
          </NexCard>
        </motion.div>

        {/* Announcements */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.18 }}>
          <NexCard className="h-full">
            <NexCardHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-secondary/15 to-secondary/5 text-secondary">
                  <Megaphone className="size-5" />
                </div>
                <div className="flex-1">
                  <NexCardTitle>Announcements</NexCardTitle>
                  <NexCardDescription>Platform-wide broadcast messages.</NexCardDescription>
                </div>
              </div>
            </NexCardHeader>
            <NexCardContent className="space-y-4">
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <SummaryStat label="Total" value={formatNumber(announcements.length)} />
                  <SummaryStat label="Active" value={formatNumber(activeAnnouncements)} accent="text-success" />
                </div>
              )}
              <NexButton variant="outline" size="sm" asChild className="w-full">
                <Link to="/admin/announcements">
                  Manage Announcements
                  <ArrowRight className="size-4" />
                </Link>
              </NexButton>
            </NexCardContent>
          </NexCard>
        </motion.div>

        {/* Danger Zone */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.24 }}>
          <NexCard className={cn('h-full border-danger/20')}>
            <NexCardHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-danger/15 to-danger/5 text-danger">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="flex-1">
                  <NexCardTitle>Danger Zone</NexCardTitle>
                  <NexCardDescription>Platform statistics and impact overview.</NexCardDescription>
                </div>
              </div>
            </NexCardHeader>
            <NexCardContent className="space-y-4">
              {loading ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <DangerStat label="Total Users" value={stats ? formatNumber(stats.total_users) : '—'} />
                    <DangerStat label="Total Orders" value={stats ? formatNumber(stats.total_orders) : '—'} />
                    <DangerStat label="Total Balance" value={stats ? formatCurrency(stats.total_balance) : '—'} />
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <p className="text-xs leading-relaxed text-foreground/80">
                      These figures reflect live platform data. Administrative actions in this panel
                      can affect all users — proceed with caution.
                    </p>
                  </div>
                </>
              )}
            </NexCardContent>
          </NexCard>
        </motion.div>
      </div>
    </div>
  );
}

// ---- Small presentational helpers ----

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function StatusIndicator({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-center">
      <Icon className={cn('mx-auto size-4', tint)} />
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-all text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <p className={cn('text-2xl font-bold tracking-tight', accent ?? 'text-foreground')}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function DangerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-danger/20 bg-danger/5 p-3">
      <p className="text-xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
