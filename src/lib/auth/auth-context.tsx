import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserProfile, UserRole, VipLevel } from './types';
import {
  fetchDeposits,
  fetchUserProfile,
  ensureUserProfile,
  computeDerivedVip,
  sumApprovedDeposits,
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
    invitationCode: string;
  }) => Promise<UserProfile>;
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

function fallbackProfile(
  id: string,
  email: string,
  fullName: string,
  phone: string,
  invitationCode: string
): UserProfile {
  const dailyOrderLimit = getVipDailyOrderLimit(0);
  return {
    id,
    fullName,
    email,
    phone,
    role: 'user',
    vipLevel: 0,
    totalDeposits: 0,
    balance: 0,
    frozenAmount: 0,
    pendingShortage: 0,
    lifetimeCommission: 0,
    todayCommission: 0,
    dailyTaskLimit: dailyOrderLimit,
    completedToday: 0,
    referralCode: '',
    referredBy: invitationCode || null,
    inviterId: null,
    totalReferralEarned: 0,
    totalReferralGiven: 0,
    avatar: '',
    status: 'active',
    createdAt: new Date().toISOString(),
    startAccessEnabled: true,
    startAccessBlockMessage: null,
  };
}

function friendlyAuthError(message: string): string {
  const msg = message.toLowerCase();
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const loadUserData = useCallback(async (userId: string, email: string) => {
    try {
      const [rows, profile] = await Promise.all([
        fetchDeposits(userId),
        fetchUserProfile(userId),
      ]);
      setDeposits(rows);
      if (profile) {
        setUser(rowToProfile(profile));
      } else {
        // Profile row not yet created — derive from deposits
        const total = sumApprovedDeposits(rows);
        const { vipLevel, dailyOrderLimit } = computeDerivedVip(0);
        setUser((prev) => ({
          id: userId,
          fullName: prev?.fullName ?? email,
          email: prev?.email ?? email,
          phone: prev?.phone ?? '',
          role: prev?.role ?? 'user',
          vipLevel: vipLevel as VipLevel,
          totalDeposits: total,
          balance: 0,
          frozenAmount: 0,
          pendingShortage: 0,
          lifetimeCommission: 0,
          todayCommission: 0,
          dailyTaskLimit: dailyOrderLimit,
          completedToday: 0,
          referralCode: '',
          referredBy: prev?.referredBy ?? null,
          inviterId: null,
          totalReferralEarned: 0,
          totalReferralGiven: 0,
          avatar: '',
          status: 'active',
          createdAt: new Date().toISOString(),
          startAccessEnabled: true,
          startAccessBlockMessage: null,
        }));
      }
    } catch {
      // keep existing user state
    }
  }, []);

  // Restore session on mount + listen for auth changes
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        await loadUserData(session.user.id, session.user.email ?? '');
      } else {
        setIsLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        (async () => {
          if (session?.user) {
            await loadUserData(session.user.id, session.user.email ?? '');
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
  }, [loadUserData]);

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
    await loadUserData(user.id, user.email);
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

      const dbProfile = await fetchUserProfile(authUser.id);
      if (dbProfile) {
        setUser(rowToProfile(dbProfile));
        return rowToProfile(dbProfile);
      }

      // Profile missing — create it now from the auth user's data
      const newProfile = await ensureUserProfile({
        user_id: authUser.id,
        email: authUser.email ?? email,
        full_name: '',
        phone: '',
      });
      if (newProfile) {
        setUser(rowToProfile(newProfile));
        return rowToProfile(newProfile);
      }

      const fallback = fallbackProfile(authUser.id, authUser.email ?? email, '', '', '');
      setUser(fallback);
      return fallback;
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
    }) => {
      const emailClean = input.email.toLowerCase().trim();
      const { data, error } = await supabase.auth.signUp({
        email: emailClean,
        password: input.password,
      });
      if (error) throw new Error(friendlyAuthError(error.message));
      const authUser = data.user;
      if (!authUser) throw new Error('Registration failed — no user returned');

      const referralCode =
        'NEX-' +
        input.fullName.replace(/\s/g, '').slice(0, 5).toUpperCase() +
        Math.floor(Math.random() * 90 + 10);

      // Create the complete profile row via SECURITY DEFINER RPC
      // This bypasses RLS so it works even if the session isn't established yet
      let profile: UserProfileRow | null = null;
      try {
        profile = await ensureUserProfile({
          user_id: authUser.id,
          email: emailClean,
          full_name: input.fullName.trim(),
          phone: input.phone,
          invitation_code: input.invitationCode.trim(),
          referral_code: referralCode,
        });
      } catch (profileErr) {
        // If the RPC fails, the auth account was still created — surface the real error
        throw new Error(
          profileErr instanceof Error
            ? profileErr.message
            : `Profile creation failed: ${String(profileErr)}`
        );
      }

      // Promote to admin if no admin exists yet (first-user-is-admin)
      try {
        await supabase.rpc('assign_first_admin_if_needed', {
          p_user_id: authUser.id,
        });
      } catch {
        // Non-fatal — user stays as 'user'
      }

      // Re-fetch to get the final profile (possibly with admin role)
      if (profile?.role !== 'admin') {
        const refreshed = await fetchUserProfile(authUser.id);
        if (refreshed) profile = refreshed;
      }

      const finalProfile = profile
        ? rowToProfile(profile)
        : fallbackProfile(authUser.id, emailClean, input.fullName, input.phone, input.invitationCode);
      setUser(finalProfile);
      setDeposits([]);
      return finalProfile;
    },
    []
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setDeposits([]);
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
      logout,
      redirectAfterAuth,
      hasRole,
      refreshUserData,
    }),
    [user, isLoading, deposits, login, register, logout, redirectAfterAuth, hasRole, refreshUserData]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export { computeVipLevel, getVipDailyOrderLimit };
