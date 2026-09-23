export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type VipLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  vipLevel: VipLevel;
  totalDeposits: number;
  balance: number;
  frozenAmount: number;
  pendingShortage: number;
  lifetimeCommission: number;
  todayCommission: number;
  dailyTaskLimit: number;
  completedToday: number;
  referralCode: string;
  referredBy: string | null;
  inviterId: string | null;
  totalReferralEarned: number;
  totalReferralGiven: number;
  avatar: string;
  status: UserStatus;
  createdAt: string;
  startAccessEnabled: boolean;
  startAccessBlockMessage: string | null;
}

/**
 * Returned by `register()` when Supabase Auth requires email confirmation
 * (signUp() succeeded but returned no session yet). No profile has been
 * created and no admin-bootstrap attempt has been made at this point —
 * both happen later, once a real authenticated session exists.
 */
export interface RegistrationPending {
  kind: 'pending_confirmation';
  email: string;
}

/** Result of `register()`: either the account is fully set up, or email
 * confirmation is still pending. */
export type RegisterResult = UserProfile | RegistrationPending;
