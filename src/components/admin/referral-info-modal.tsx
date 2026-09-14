import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Ticket,
  Users,
  Gift,
  TrendingUp,
  Loader2,
  UserRound,
  Hash,
  Crown,
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
import { NexBadge } from '@/components/ui/nex';
import { computeVipLevel } from '@/lib/vip-config';
import {
  fetchInvitedUsers,
  fetchReferralRewardsGiven,
  fetchReferralRewardsReceived,
  type UserProfileRow,
  type ReferralRewardRow,
} from '@/lib/supabase/deposits';
import { cn } from '@/lib/utils';

interface ReferralInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserProfileRow | null;
}

function formatAmount(value: number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ReferralInfoModal({ open, onOpenChange, user }: ReferralInfoModalProps) {
  const [invitedUsers, setInvitedUsers] = useState<UserProfileRow[]>([]);
  const [rewardsGiven, setRewardsGiven] = useState<ReferralRewardRow[]>([]);
  const [rewardsReceived, setRewardsReceived] = useState<ReferralRewardRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [invited, given, received] = await Promise.all([
        fetchInvitedUsers(user.user_id),
        fetchReferralRewardsGiven(user.user_id, 20),
        fetchReferralRewardsReceived(user.user_id, 20),
      ]);
      setInvitedUsers(invited);
      setRewardsGiven(given);
      setRewardsReceived(received);
    } catch {
      setInvitedUsers([]);
      setRewardsGiven([]);
      setRewardsReceived([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      loadData();
    }
  }, [open, user, loadData]);

  if (!user) return null;

  const vipLevel = computeVipLevel(user.total_deposits);

  return (
    <NexModal open={open} onOpenChange={onOpenChange}>
      <NexModalContent className="max-w-2xl">
        <NexModalHeader>
          <NexModalTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Ticket className="size-4" />
            </span>
            Referral Information
          </NexModalTitle>
          <NexModalDescription>
            View referral relationships and bonus history for this customer.
          </NexModalDescription>
        </NexModalHeader>

        {/* Customer info */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{user.full_name || 'Unknown'}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <NexBadge variant="muted" size="sm">
              <Crown className="size-3" />
              VIP{vipLevel}
            </NexBadge>
          </div>
        </div>

        {/* Referral codes + stats */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Invitation Code</p>
            <p className="mt-1 text-sm font-bold tracking-wider text-foreground">{user.referral_code || '—'}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Code Used at Registration</p>
            <p className="mt-1 text-sm font-bold text-foreground">{user.invitation_code || 'None'}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5">
              <Users className="size-3.5 text-primary" />
              <p className="text-xs text-muted-foreground">Invited Users</p>
            </div>
            <p className="mt-1 text-lg font-bold text-foreground">{invitedUsers.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5">
              <Gift className="size-3.5 text-success" />
              <p className="text-xs text-muted-foreground">Bonus Generated (for invited users)</p>
            </div>
            <p className="mt-1 text-lg font-bold text-success">{formatAmount(Number(user.total_referral_given ?? 0))}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5 text-secondary" />
              <p className="text-xs text-muted-foreground">Bonus Earned (from inviter)</p>
            </div>
            <p className="mt-1 text-lg font-bold text-secondary">{formatAmount(Number(user.total_referral_earned ?? 0))}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Invited users list */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Invited Users ({invitedUsers.length})</h4>
              {invitedUsers.length === 0 ? (
                <p className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">This user has not invited anyone yet.</p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
                  {invitedUsers.map((u) => (
                    <div key={u.user_id} className="flex items-center gap-3 rounded-lg bg-background px-3 py-2 text-xs">
                      <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{u.full_name || 'Unknown'}</p>
                        <p className="truncate text-muted-foreground">{u.email}</p>
                      </div>
                      <span className="text-muted-foreground">{formatDate(u.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Referral rewards given (this user's tasks generated bonuses for invited users) */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Referral Bonus History ({rewardsGiven.length})</h4>
              {rewardsGiven.length === 0 ? (
                <p className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">No referral bonuses generated yet.</p>
              ) : (
                <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
                  {rewardsGiven.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg bg-background px-3 py-2 text-xs">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                        <Gift className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          Bonus: {formatAmount(Number(r.referral_bonus))} to {r.invited_user_id.slice(0, 8)}…
                        </p>
                        <p className="text-muted-foreground">
                          25% of {formatAmount(Number(r.original_reward))} · Order {r.order_number ?? '—'}
                        </p>
                      </div>
                      <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <NexModalFooter>
          <NexButton variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </NexButton>
        </NexModalFooter>
      </NexModalContent>
    </NexModal>
  );
}
