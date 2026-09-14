import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, Lock, KeyRound, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export function AdminSecurityPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match', { description: 'New password and confirmation must be identical.' });
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password too short', { description: 'Use at least 8 characters.' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated', { description: 'Your admin password has been changed.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error('Failed to update password', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  const securityItems = [
    { icon: Lock, label: 'Row Level Security', status: 'Enabled', variant: 'success' as const },
    { icon: KeyRound, label: 'Auth Provider', status: 'Email/Password', variant: 'default' as const },
    { icon: ShieldAlert, label: 'Session Expiry', status: 'Auto-refresh', variant: 'success' as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        subtitle="Audit logs, access control, and platform security settings."
        action={<NexBadge variant="success" dot>Secured</NexBadge>}
      />

      {/* Security status */}
      <div className="grid gap-3 sm:grid-cols-3">
        {securityItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.06 }}>
              <NexCard className="p-5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">{item.label}</p>
                <div className="mt-1.5">
                  <NexBadge variant={item.variant} size="sm" dot>{item.status}</NexBadge>
                </div>
              </NexCard>
            </motion.div>
          );
        })}
      </div>

      {/* Change password */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
        <NexCard className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Change Admin Password</h3>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">New Password</label>
              <NexInput
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Confirm New Password</label>
              <NexInput
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <NexButton type="submit" isLoading={saving} disabled={!newPassword || !confirmPassword}>
              Update Password
            </NexButton>
          </form>
        </NexCard>
      </motion.div>
    </div>
  );
}
