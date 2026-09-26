import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { AlertTriangle } from 'lucide-react';
import type { UserProfile, UserRole, VipLevel, RegisterResult } from './types';
import {
  fetchDeposits,
  fetchUserProfile,
  ensureUserProfile,
  computeDerivedVip,
  fetchVipConfig,
  type DepositRow,
  type UserProfileRow,
  type VipConfigRow,
} from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';
import {
  computeVipLevel,
  getVipDailyOrderLimit,
  setRuntimeVipConfig,
} from '@/lib/vip-config';
import { NexCard } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';

interface AuthContextValue {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  deposits: DepositRow[];
  login: (email: string, password: string, remember: boolean) => Promise<UserProfile>;
  register: (input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    /** Required registration-gate code, validated server-side. */
    invitationCode: string;
    /** Optional: an existing user's shareable referral code, for inviter
     * attribution only — never a gate. */
    referrerCode?: string;
  }) => Promise<RegisterResult>;
  /** Re-sends the signup confirmation email (Confirm-email-ON flow only). */
  resendConfirmation: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  redirectAfterAuth: () => string;
  hasRole: (role: UserRole) => boolean;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function rowToProfile(row: UserProfileRow): UserProfile {
  const balance = Number(row.balance);
  const { vipLevel, dailyOrderLimit } = computeDerivedVip(balance);
  const explicitVip = row.vip_level ?? 0;
  const effectiveVip = Math.max(vipLevel, explicitVip) as VipLevel;
  return {
    id: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: (row.role ?? 'user') as UserRole,
    vipLevel: effectiveVip,
    totalDeposits: Number(row.total_deposits),
    balance,
    frozenAmount: Number(row.frozen_amount ?? 0),
    pendingShortage: Number(row.pending_shortage ?? 0),
    lifetimeCommission: Number(row.lifetime_commission),
    todayCommission: Number(row.today_commission),
    dailyTaskLimit: dailyOrderLimit,
    completedToday: row.completed_today,
    referralCode: row.referral_code ?? '',
    referredBy: row.invitation_code ?? '',
    inviterId: row.inviter_id ?? null,
    totalReferralEarned: Number(row.total_referral_earned ?? 0),
    totalReferralGiven: Number(row.total_referral_given ?? 0),
    avatar: '',
    status: (row.status ?? 'active') as UserProfile['status'],
    createdAt: row.created_at,
    startAccessEnabled: row.start_access_enabled ?? true,
    startAccessBlockMessage: row.start_access_block_message ?? null,
  };
}

function friendlyAuthError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
    return 'Please confirm your email address before signing in — check your inbox for the confirmation link we sent you.';
  }
  if (msg.includes('invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'This email is already registered. Try signing in instead.';
  }
  if (msg.includes('password should be') || msg.includes('password is too weak')) {
    return 'Password is too weak. Use at least 8 characters with a mix of letters and numbers.';
  }
  if (msg.includes('email') && msg.includes('invalid')) {
    return 'Please enter a valid email address.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Unable to connect to the authentication service. Please check your internet connection.';
  }
  return message;
}

/** Reads a string field out of Supabase auth user_metadata, never throwing
 * on an unexpected shape. */
function metaString(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === 'string' ? v : '';
}

function makeReferralCode(seed: string): string {
  return (
    'NEX-' +
    seed.replace(/\s/g, '').slice(0, 5).toUpperCase() +
    Math.floor(Math.random() * 90 + 10)
  );
}

/**
 * Known, deliberately-written `RAISE EXCEPTION` messages from
 * `create_user_profile` that are already safe and specific enough to show
 * a user as-is (in production, not just DEV) — distinct from an arbitrary
 * Postgres/RPC failure, which must stay generic in production.
 */
const KNOWN_SETUP_ERROR_MESSAGES: Record<string, string> = {
  'invitation code is required': 'An invitation code is required to create an account.',
  'invalid or already-used invitation code': 'That invitation code is invalid or has already been used.',
};

/** Wraps a profile-setup failure so real Postgres/RPC detail never reaches
 * production users, while staying fully visible in development. Known,
 * user-actionable RPC errors (e.g. a bad invitation code) still surface
 * their specific message in production. */
function accountSetupError(err: unknown): Error {
  const detail = err instanceof Error ? err.message : String(err);
  const lower = detail.toLowerCase();
  const known = Object.entries(KNOWN_SETUP_ERROR_MESSAGES).find(([needle]) => lower.includes(needle));
  if (known) return new Error(known[1]);

  return new Error(
    import.meta.env.DEV
      ? `Account setup failed: ${detail}`
      : 'We could not finish setting up your account. Please try again or contact support.'
  );
}

/**
 * Ensures a `user_profiles` row exists for an authenticated Supabase user,
 * then unconditionally (re-)attempts the existing race-safe
 * `assign_first_admin_if_needed` bootstrap.
 *
 * The profile itself is only ever created once — if a row already exists it
 * is returned as-is and never recreated or modified. The admin-bootstrap
 * call, however, runs on every invocation (every login / session restore),
 * not just the first time a profile is created. This is deliberate: it lets
 * a transient failure during the very first registration (network blip,
 * momentary DB issue) recover itself on the user's next authenticated
 * session, without ever touching the profile row again. It's safe to call
 * repeatedly because `assign_first_admin_if_needed` is already race-safe
 * (advisory lock) and a no-op once any admin exists — it does not raise for
 * that case, only for a genuine authorization/database failure.
 *
 * `user` MUST come from an authenticated Supabase session (supabase.auth.*)
 * — never from a URL parameter or other client-supplied value — so that the
 * RPCs' own `auth.uid() = p_user_id` check is meaningful. Registration form
 * data (full name / phone / invitation code) is recovered from the user's
 * `user_metadata`, which Supabase carries through from signUp() to the
 * confirmed session even across a different tab/device — never trusted from
 * anything else.
 */
async function completeUserProfile(user: User): Promise<UserProfileRow> {
  let profile = await fetchUserProfile(user.id);

  if (!profile) {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const fullName = metaString(meta, 'full_name');

    try {
      profile = await ensureUserProfile({
        user_id: user.id,
        email: user.email ?? '',
        full_name: fullName,
        phone: metaString(meta, 'phone'),
        // Required registration gate, validated + consumed server-side.
        invitation_code: metaString(meta, 'invitation_code'),
        // This user's own new shareable code — unrelated to who invited them.
        referral_code: makeReferralCode(fullName || (user.email ?? 'user')),
        // Optional: an existing user's referral_code, for inviter attribution
        // only. Never validated as a gate.
        referrer_code: metaString(meta, 'referrer_code'),
      });
    } catch (err) {
      throw accountSetupError(err);
    }
    if (!profile) throw accountSetupError('Profile creation returned no data');
  }

  // First-user-is-admin bootstrap. Runs whether the profile was just
  // created or already existed — never fatal, since the profile row is
  // already in hand either way, but never silently invisible either, in
  // case a failure signals a real authorization/database problem rather
  // than "an admin already exists" (which this RPC handles internally and
  // never raises for).
  try {
    await supabase.rpc('assign_first_admin_if_needed', { p_user_id: user.id });
  } catch (err) {
    console.error('assign_first_admin_if_needed failed (non-fatal):', err);
    return profile;
  }

  const refreshed = await fetchUserProfile(user.id);
  return refreshed ?? profile;
}

/**
 * Shown instead of the normal app when a real Supabase Auth session exists
 * but the required `user_profiles` row could not be loaded/created —
 * see `establishSession`. Never rendered alongside a phantom/fake profile;
 * the Supabase session itself is left intact so "Try again" can reuse it.
 */
function AuthErrorScreen({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <NexCard className="w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle className="size-8" />
        </div>
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          Account setup problem
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-col gap-2.5">
          <NexButton className="w-full" onClick={onRetry}>
            Try again
          </NexButton>
          <NexButton variant="outline" className="w-full" onClick={onSignOut}>
            Sign out
          </NexButton>
        </div>
      </NexCard>
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Set only when a real Auth session exists but its profile could not be
  // loaded/created — see establishSession. While set, AuthProvider renders
  // AuthErrorScreen instead of the app, so no phantom profile can ever be
  // reached by a route.
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchVipConfig();
        if (rows.length > 0) {
          setRuntimeVipConfig(
            rows.map((r: VipConfigRow) => ({
              level: r.level,
              name: r.name,
              dailyOrderLimit: r.daily_order_limit,
              commissionRate: Number(r.commission_rate),
              minDeposit: Number(r.min_deposit),
            }))
          );
        }
      } catch {
        // keep fallback config
      }
    })();
  }, []);

  const loadUserData = useCallback(async (userId: string) => {
    try {
      const [rows, profile] = await Promise.all([
        fetchDeposits(userId),
        fetchUserProfile(userId),
      ]);
      setDeposits(rows);
      // No fabricated fallback profile: if no real row exists, this user is
      // not treated as authenticated. A profile-less session reaching this
      // point (rather than being caught earlier by establishSession) is
      // never papered over with fake data.
      setUser(profile ? rowToProfile(profile) : null);
    } catch {
      // keep existing user state
    }
  }, []);

  // Ensures the profile/admin-bootstrap exist, then loads full state.
  // Used for every point a real session appears: initial page load, a
  // normal token refresh, AND landing back on /login after clicking the
  // email-confirmation link (that link resolves to an authenticated
  // session via Supabase's own detectSessionInUrl handling — no manual
  // token/query parsing is done here or anywhere else in this file).
  //
  // If completeUserProfile fails, this must NOT fall through to
  // loadUserData: a real Supabase Auth session with no usable profile is
  // not a normal authenticated state. Instead it sets authError, which
  // makes AuthProvider render AuthErrorScreen in place of the whole app —
  // no route, protected or not, can render with a phantom/fabricated
  // profile. The underlying Supabase session is left untouched (not signed
  // out), so "Try again" can retry against the same session.
  const establishSession = useCallback(
    async (user: User) => {
      try {
        await completeUserProfile(user);
        setAuthError(null);
      } catch (err) {
        console.error('completeUserProfile failed:', err);
        // Reuse accountSetupError's DEV/PROD-safe mapping even though this
        // err may not have passed through it already — completeUserProfile's
        // own fetchUserProfile() call isn't wrapped, so a raw Postgrest
        // error could otherwise reach here unsanitized.
        setAuthError(accountSetupError(err).message);
        setIsLoading(false);
        return;
      }
      await loadUserData(user.id);
    },
    [loadUserData]
  );

  // Restore session on mount + listen for auth changes
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        await establishSession(session.user);
      } else {
        setIsLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        (async () => {
          if (session?.user) {
            await establishSession(session.user);
          } else {
            setUser(null);
            setDeposits([]);
          }
          if (mounted) setIsLoading(false);
        })();
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [establishSession]);

  // Realtime: update when deposits OR user_profiles change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('deposits-and-profile-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deposits', filter: `user_id=eq.${user.id}` },
        () => refreshUserData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles', filter: `user_id=eq.${user.id}` },
        () => refreshUserData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const refreshUserData = useCallback(async () => {
    if (!user) return;
    await loadUserData(user.id);
  }, [user, loadUserData]);

  const login = useCallback(
    async (email: string, password: string, _remember: boolean) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });
      if (error) throw new Error(friendlyAuthError(error.message));
      const authUser = data.user;
      if (!authUser) throw new Error('Login failed — no user returned');

      // Handles the normal case (profile already exists) in a single read,
      // and also finishes setup for the rare case where an earlier signup
      // never completed its profile/admin-bootstrap step.
      const profile = await completeUserProfile(authUser);
      const finalProfile = rowToProfile(profile);
      setUser(finalProfile);
      return finalProfile;
    },
    []
  );

  const register = useCallback(
    async (input: {
      fullName: string;
      email: string;
      phone: string;
      password: string;
      invitationCode: string;
      referrerCode?: string;
    }): Promise<RegisterResult> => {
      const emailClean = input.email.toLowerCase().trim();
      const fullName = input.fullName.trim();
      const invitationCode = input.invitationCode.trim();
      const referrerCode = (input.referrerCode ?? '').trim();

      const { data, error } = await supabase.auth.signUp({
        email: emailClean,
        password: input.password,
        options: {
          // Carried through by Supabase onto auth.users.user_metadata and
          // present on session.user once the confirmation link is clicked
          // (possibly in a different tab/device) — this is how the deferred
          // profile-completion step recovers the form data without trusting
          // anything supplied via a URL parameter. invitation_code is the
          // required registration gate; referrer_code is a separate,
          // optional field used only for inviter attribution.
          data: {
            full_name: fullName,
            phone: input.phone,
            invitation_code: invitationCode,
            referrer_code: referrerCode,
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) throw new Error(friendlyAuthError(error.message));
      const authUser = data.user;
      if (!authUser) throw new Error('Registration failed — no user returned');

      if (!data.session) {
        // Confirm-email is ON: no session yet. create_user_profile and
        // assign_first_admin_if_needed are (correctly) restricted to the
        // `authenticated` role, so they must NOT be called as anon here —
        // both run later, once a real session exists (see establishSession
        // above, which fires when the user clicks the confirmation link).
        return { kind: 'pending_confirmation', email: emailClean };
      }

      // Confirm-email is OFF (or this account was already confirmed):
      // signUp() returned a live session immediately, so finish setup now.
      const profile = await completeUserProfile(authUser);
      const finalProfile = rowToProfile(profile);
      setUser(finalProfile);
      setDeposits([]);
      return finalProfile;
    },
    []
  );

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.toLowerCase().trim(),
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setDeposits([]);
    setAuthError(null);
  }, []);

  const redirectAfterAuth = useCallback(() => {
    return user ? (user.role === 'admin' ? '/admin' : '/home') : '/home';
  }, [user]);

  const hasRole = useCallback(
    (role: UserRole) => user?.role === role,
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      deposits,
      login,
      register,
      resendConfirmation,
      logout,
      redirectAfterAuth,
      hasRole,
      refreshUserData,
    }),
    [
      user,
      isLoading,
      deposits,
      login,
      register,
      resendConfirmation,
      logout,
      redirectAfterAuth,
      hasRole,
      refreshUserData,
    ]
  );

  // A real Auth session exists but its profile couldn't be loaded/created —
  // render the recovery screen in place of the entire app, so no route
  // (protected or otherwise) can ever be reached with a fabricated profile.
  if (authError) {
    return (
      <AuthErrorScreen
        message={authError}
        onRetry={() => window.location.reload()}
        onSignOut={() => {
          void logout();
        }}
      />
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export { computeVipLevel, getVipDailyOrderLimit };
