import { useEffect, useState } from 'react';
import {
  UserRound,
  Settings,
  Bell,
  Shield,
  CreditCard,
  ChevronRight,
  LogOut,
  Copy,
  Check,
  Crown,
  Wallet,
  Calendar,
  Mail,
  Phone,
  Ticket,
  Users,
  Gift,
  TrendingUp,
  Loader2,
  Share2,
  Award,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { useCopyToClipboard } from '@/lib/hooks/use-copy';
import { formatCurrency } from '@/lib/start/helpers';
import { cn } from '@/lib/utils';
import {
  fetchInvitedUsers,
  fetchReferralRewardsReceived,
  fetchReferralRewardsGiven,
  type UserProfileRow,
  type ReferralRewardRow,
} from '@/lib/supabase/deposits';
import { toast } from 'sonner';

function formatAmount(value: number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AccountPage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { copiedKey, copy } = useCopyToClipboard();

  const [invitedUsers, setInvitedUsers] = useState<UserProfileRow[]>([]);
  const [rewardsReceived, setRewardsReceived] = useState<ReferralRewardRow[]>([]);
  const [rewardsGiven, setRewardsGiven] = useState<ReferralRewardRow[]>([]);
  const [loadingReferral, setLoadingReferral] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const [invited, received, given] = await Promise.all([
          fetchInvitedUsers(user.id),
          fetchReferralRewardsReceived(user.id, 10),
          fetchReferralRewardsGiven(user.id, 10),
        ]);
        if (!active) return;
        setInvitedUsers(invited);
        setRewardsReceived(received);
        setRewardsGiven(given);
      } catch {
        // keep empty
      } finally {
        if (active) setLoadingReferral(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleLogout = () => {
    setIsLoggingOut(true);
    logout();
    navigate('/login', { replace: true });
  };

  const profileStats = [
    { icon: Wallet, label: 'Balance', value: `$${formatCurrency(user?.balance ?? 0)}` },
    { icon: Crown, label: 'VIP Level', value: `VIP ${user?.vipLevel ?? 0}` },
    { icon: Calendar, label: 'Member Since', value: user ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—' },
  ];

  const menu = [
    { icon: Settings, label: 'Account settings', desc: 'Manage your preferences' },
    { icon: CreditCard, label: 'Payment methods', desc: 'Cards & linked accounts' },
    { icon: Bell, label: 'Notifications', desc: 'Alerts and email updates' },
    { icon: Shield, label: 'Security', desc: 'Password and 2FA' },
  ];

  const referralStats = [
    { icon: Users, label: 'Invited Users', value: String(invitedUsers.length), tint: 'bg-primary/10 text-primary' },
    { icon: Gift, label: 'Bonus Earned', value: formatAmount(user?.totalReferralEarned ?? 0), tint: 'bg-success/10 text-success' },
    { icon: TrendingUp, label: 'Bonus Generated', value: formatAmount(user?.totalReferralGiven ?? 0), tint: 'bg-secondary/10 text-secondary' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Account" subtitle="Manage your profile, security, and referral benefits." />

      {/* Profile card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <NexCard className="p-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-xl font-bold text-primary-foreground">
              {(user?.fullName || user?.email || 'NB').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h2 className="text-lg font-bold text-foreground">{user?.fullName || 'User'}</h2>
                <NexBadge variant="success">VIP{user?.vipLevel ?? 0}</NexBadge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{user?.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Member since {user ? new Date(user.createdAt).getFullYear() : '2026'}</p>
            </div>
          </div>
        </NexCard>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {profileStats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.06 }}>
              <NexCard className="p-4">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <p className="mt-2 text-sm font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </NexCard>
            </motion.div>
          );
        })}
      </div>

      {/* ============ Referral Section ============ */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
        <NexCard className="overflow-hidden">
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Ticket className="size-4" />
              </div>
              <h3 className="text-sm font-bold text-foreground">My Invitation Code</h3>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Share your invitation code with someone. Your invited user earns a special 25% bonus when you complete tasks.
            </p>
          </div>

          <div className="space-y-4 p-5">
            {/* Code display */}
            <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <Share2 className="size-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Your Invitation Code</p>
                  <p className="text-lg font-bold tracking-wider text-foreground">{user?.referralCode || '—'}</p>
                </div>
              </div>
              {user?.referralCode && (
                <button
                  onClick={() => {
                    copy(user.referralCode, 'invitation');
                    toast.success('Code copied');
                  }}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-lg border transition-all active:scale-90',
                    copiedKey === 'invitation' ? 'border-success/30 bg-success/10 text-success' : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                  aria-label="Copy invitation code"
                >
                  {copiedKey === 'invitation' ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              )}
            </div>

            {/* How it works */}
            <div className="rounded-xl bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Award className="size-4 text-secondary" />
                <p className="text-sm font-semibold text-foreground">How the referral bonus works</p>
              </div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>You share your code. Someone registers using it.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>When <strong className="text-foreground">you</strong> complete tasks and earn rewards, your invited user receives an extra 25% of your reward.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>You keep 100% of your earnings. The 25% is an additional bonus paid to your invited user.</span>
                </div>
              </div>
            </div>

            {/* Referral stats */}
            <div className="grid grid-cols-3 gap-3">
              {referralStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="rounded-xl border border-border bg-muted/20 p-3">
                    <div className={cn('flex size-8 items-center justify-center rounded-lg', stat.tint)}>
                      <Icon className="size-4" />
                    </div>
                    <p className="mt-2 text-sm font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </NexCard>
      </motion.div>

      {/* Invited users + recent rewards */}
      {loadingReferral ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Invited users */}
          <NexCard className="overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Invited Users</h3>
              </div>
            </div>
            {invitedUsers.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No invited users yet. Share your code to start earning referral bonuses.</p>
            ) : (
              <div className="divide-y divide-border">
                {invitedUsers.slice(0, 5).map((u) => (
                  <div key={u.user_id} className="flex items-center gap-3 p-4">
                    <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{u.full_name || 'Unknown'}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </NexCard>

          {/* Recent referral rewards received */}
          <NexCard className="overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Gift className="size-4 text-success" />
                <h3 className="text-sm font-bold text-foreground">Referral Bonus History</h3>
              </div>
            </div>
            {rewardsReceived.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No referral bonuses yet. When your inviter completes tasks, your 25% bonus appears here.</p>
            ) : (
              <div className="divide-y divide-border">
                {rewardsReceived.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">+{formatAmount(Number(r.referral_bonus))}</p>
                      <p className="text-xs text-muted-foreground">
                        25% of {formatAmount(Number(r.original_reward))} · Order {r.order_number ?? '—'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </NexCard>
        </div>
      )}

      {/* Account details */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
        <NexCard className="p-5">
          <h3 className="mb-4 text-sm font-bold text-foreground">Account Details</h3>
          <div className="space-y-3">
            <DetailRow icon={Mail} label="Email" value={user?.email ?? '—'} />
            <DetailRow icon={Phone} label="Phone" value={user?.phone || 'Not set'} />
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <UserRound className="size-4" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Invitation Code Used</p>
                <p className="text-sm font-semibold text-foreground">{user?.referredBy || 'None'}</p>
              </div>
            </div>
            {user?.inviterId && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <UserRound className="size-4" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Invited By</p>
                  <p className="text-sm font-semibold text-foreground">{user.inviterId.slice(0, 8)}…</p>
                </div>
              </div>
            )}
          </div>
        </NexCard>
      </motion.div>

      {/* Menu */}
      <div className="space-y-3">
        {menu.map((m, i) => {
          const Icon = m.icon;
          return (
            <motion.div key={m.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.06 }}>
              <NexCard interactive className="flex items-center gap-4 p-4">
                <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="size-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground" />
              </NexCard>
            </motion.div>
          );
        })}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <NexCard className="flex cursor-pointer items-center gap-4 border-danger/20 p-4 transition-colors hover:bg-danger/[0.03]">
            <div className="flex size-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <LogOut className="size-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Sign out</p>
              <p className="text-xs text-muted-foreground">Log out of your Hawksem account</p>
            </div>
            <button className="rounded-xl border border-danger/30 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/5">
              Sign out
            </button>
          </NexCard>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Hawksem?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to access your account, orders, and balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoggingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {isLoggingOut ? 'Signing out…' : 'Sign out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
