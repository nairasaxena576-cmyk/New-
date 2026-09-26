import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, Sparkles, Copy, Check, Loader2, CircleCheck, CircleSlash } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
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
  fetchInvitationCodes,
  generateInvitationCode,
  logActivity,
  type InvitationCodeRow,
} from '@/lib/supabase/deposits';
import { useAuth } from '@/lib/auth';
import { useCopyToClipboard } from '@/lib/hooks/use-copy';
import { cn } from '@/lib/utils';

/** Maps a raw RPC error to a clean, user-facing message. Known, deliberately
 * safe RPC messages (e.g. the admin-only guard) still surface as-is; any
 * other detail stays hidden behind a generic message in production and is
 * only shown raw in development — matching the same convention used for
 * registration errors in auth-context.tsx. */
function friendlyInvitationError(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  if (detail.toLowerCase().includes('permission denied')) {
    return "You don't have permission to manage invitation codes.";
  }
  return import.meta.env.DEV ? detail : 'Something went wrong. Please try again.';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AdminInvitationsPage() {
  const { user: adminUser } = useAuth();
  const [codes, setCodes] = useState<InvitationCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const { copiedKey, copy } = useCopyToClipboard();

  const loadCodes = useCallback(async () => {
    try {
      const rows = await fetchInvitationCodes();
      setCodes(rows);
    } catch (err) {
      toast.error('Failed to load invitation codes', {
        description: friendlyInvitationError(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const code = await generateInvitationCode();
      setGeneratedCode(code);
      toast.success('Invitation code generated');
      // Best-effort audit trail — matches the pattern used by every other
      // admin action (wallets, FAQs, etc.). Never blocks the UI on failure.
      if (adminUser) {
        logActivity(
          adminUser.id,
          'generate_invitation_code',
          'invitation_code',
          code,
          'Generated a new invitation code'
        ).catch(() => {});
      }
      await loadCodes();
    } catch (err) {
      toast.error('Failed to generate invitation code', {
        description: friendlyInvitationError(err),
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(code: string) {
    const ok = await copy(code, code);
    if (ok) toast.success('Copied', { description: code });
    else toast.error('Could not copy to clipboard');
  }

  const availableCount = codes.filter((c) => !c.used_by).length;
  const usedCount = codes.length - availableCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invitation Codes"
        subtitle="Generate single-use invitation codes required to register a new Hawksem account."
        action={
          <NexButton
            leftIcon={<KeyRound className="size-4" />}
            isLoading={generating}
            onClick={handleGenerate}
          >
            {generating ? 'Generating…' : 'Generate Invitation Code'}
          </NexButton>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Available', value: String(availableCount), icon: CircleCheck, tint: 'from-success/10 to-success/5 text-success' },
          { label: 'Used', value: String(usedCount), icon: CircleSlash, tint: 'from-muted/30 to-muted/10 text-muted-foreground' },
          { label: 'Total', value: String(codes.length), icon: KeyRound, tint: 'from-primary/10 to-primary/5 text-primary' },
        ].map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.07 }}>
            <NexCard className="p-5">
              <div className={cn('flex size-11 items-center justify-center rounded-xl bg-gradient-to-br', k.tint)}>
                <k.icon className="size-5" />
              </div>
              <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">{k.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{k.label}</p>
            </NexCard>
          </motion.div>
        ))}
      </div>

      {/* List */}
      <NexCard>
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : codes.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={KeyRound}
              title="No invitation codes yet"
              description="Generate the first invitation code so a new user can register."
              action={
                <NexButton leftIcon={<KeyRound className="size-4" />} isLoading={generating} onClick={handleGenerate}>
                  Generate Invitation Code
                </NexButton>
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Used</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Used by</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((row, i) => {
                    const isUsed = !!row.used_by;
                    const isCopied = copiedKey === row.code;
                    return (
                      <motion.tr
                        key={row.code}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
                        className="border-b border-border last:border-0 transition-colors hover:bg-muted/20"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-foreground">{row.code}</span>
                            {row.is_bootstrap && (
                              <span className="flex items-center gap-0.5 rounded-full bg-gradient-to-r from-warning to-danger px-1.5 py-0.5 text-[9px] font-bold text-white">
                                <Sparkles className="size-2" />
                                Bootstrap
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <NexBadge variant={isUsed ? 'muted' : 'success'} size="sm" dot>
                            {isUsed ? 'Used' : 'Available'}
                          </NexBadge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(row.used_at)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="block max-w-[160px] truncate font-mono text-xs text-muted-foreground"
                            title={row.used_by ?? undefined}
                          >
                            {row.used_by ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleCopy(row.code)}
                            className={cn(
                              'inline-flex size-8 items-center justify-center rounded-lg border transition-all active:scale-90',
                              isCopied
                                ? 'border-success/30 bg-success/10 text-success'
                                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                            aria-label="Copy invitation code"
                          >
                            {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 p-4 sm:hidden">
              {codes.map((row, i) => {
                const isUsed = !!row.used_by;
                const isCopied = copiedKey === row.code;
                return (
                  <motion.div
                    key={row.code}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.2) }}
                    className="rounded-xl border border-border bg-muted/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">{row.code}</span>
                      <button
                        onClick={() => handleCopy(row.code)}
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-all active:scale-90',
                          isCopied
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                        aria-label="Copy invitation code"
                      >
                        {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <NexBadge variant={isUsed ? 'muted' : 'success'} size="sm" dot>
                        {isUsed ? 'Used' : 'Available'}
                      </NexBadge>
                      {row.is_bootstrap && (
                        <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-warning to-danger px-2 py-0.5 text-[10px] font-bold text-white">
                          <Sparkles className="size-2.5" />
                          Bootstrap
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Created: {formatDate(row.created_at)}</span>
                      <span>Used: {formatDate(row.used_at)}</span>
                    </div>
                    {row.used_by && (
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={row.used_by}>
                        Used by: {row.used_by}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </NexCard>

      {/* Newly generated code */}
      <NexModal open={!!generatedCode} onOpenChange={(v) => !v && setGeneratedCode(null)}>
        <NexModalContent className="max-w-md" hideClose>
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-success/10 text-success">
              <KeyRound className="size-8" />
            </div>
            <NexModalHeader className="items-center">
              <NexModalTitle>Invitation code generated</NexModalTitle>
              <NexModalDescription>
                Share this code with the person you're inviting. It can only be used once.
              </NexModalDescription>
            </NexModalHeader>
            <div className="mt-2 w-full rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-4">
              <p className="break-all font-mono text-lg font-bold tracking-wider text-foreground">
                {generatedCode}
              </p>
            </div>
          </div>
          <NexModalFooter className="mt-2 sm:flex-col sm:gap-2">
            <NexButton
              className="w-full"
              leftIcon={
                generatedCode && copiedKey === generatedCode ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )
              }
              onClick={() => generatedCode && handleCopy(generatedCode)}
            >
              {generatedCode && copiedKey === generatedCode ? 'Copied' : 'Copy Code'}
            </NexButton>
            <NexButton variant="outline" className="w-full" onClick={() => setGeneratedCode(null)}>
              Done
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </div>
  );
}
