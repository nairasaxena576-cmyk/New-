import { supabase } from '@/lib/supabase/client';
import { computeVipLevel, getVipDailyOrderLimit } from '@/lib/vip-config';

export interface DepositRow {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  amount: number;
  method: string;
  status: 'pending' | 'approved' | 'rejected';
  screenshot_url: string | null;
  transaction_id: string | null;
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface OrderRow {
  id: string;
  user_id: string;
  order_number: string;
  task_number: string;
  product_id: string;
  product_name: string;
  merchant: string;
  unit_price: number;
  total_price: number;
  commission: number;
  commission_rate: number;
  is_lucky: boolean;
  lucky_commission_percent: number;
  vip_level: number;
  status: string;
  note: string | null;
  created_at: string;
}

export interface UserProfileRow {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  balance: number;
  frozen_amount: number;
  pending_shortage: number;
  total_deposits: number;
  lifetime_commission: number;
  today_commission: number;
  completed_today: number;
  last_order_date: string | null;
  created_at: string;
  role: string;
  status: string;
  vip_level: number;
  remaining_orders: number;
  invitation_code: string;
  referral_code: string;
  inviter_id: string | null;
  total_referral_earned: number | null;
  total_referral_given: number | null;
  start_access_enabled: boolean | null;
  start_access_block_message: string | null;
}

export interface ReferralRewardRow {
  id: string;
  inviter_id: string;
  invited_user_id: string;
  order_id: string | null;
  order_number: string | null;
  original_reward: number;
  referral_bonus: number;
  bonus_rate: number;
  created_at: string;
}

export interface ProductRow {
  id: string;
  name: string;
  merchant: string;
  price: number;
  category: string;
  category_tint: string;
  image: string;
  min_vip: number;
  is_lucky: boolean;
  lucky_commission_percent: number;
  sort_order: number;
}

export interface DerivedVip {
  totalDeposits: number;
  vipLevel: number;
  dailyOrderLimit: number;
}

export async function fetchDeposits(userId: string): Promise<DepositRow[]> {
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DepositRow[];
}

export async function fetchAllDeposits(): Promise<DepositRow[]> {
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DepositRow[];
}

export async function insertDeposit(input: {
  user_id: string;
  user_email: string;
  user_name: string;
  amount: number;
  method: string;
  screenshot_url: string;
  transaction_id: string;
  note: string;
}): Promise<DepositRow> {
  const { data, error } = await supabase
    .from('deposits')
    .insert({
      user_id: input.user_id,
      user_email: input.user_email,
      user_name: input.user_name,
      amount: input.amount,
      method: input.method,
      status: 'pending',
      screenshot_url: input.screenshot_url,
      transaction_id: input.transaction_id || null,
      note: input.note || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DepositRow;
}

export async function updateDepositStatus(
  depositId: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const { error } = await supabase
    .from('deposits')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', depositId);
  if (error) throw error;
}

export async function fetchOrders(userId: string): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrderRow[];
}

export async function insertOrder(input: {
  user_id: string;
  order_number: string;
  task_number: string;
  product_id: string;
  product_name: string;
  merchant: string;
  unit_price: number;
  total_price: number;
  commission: number;
  commission_rate: number;
  is_lucky: boolean;
  lucky_commission_percent: number;
  vip_level: number;
  note: string;
}): Promise<OrderRow> {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: input.user_id,
      order_number: input.order_number,
      task_number: input.task_number,
      product_id: input.product_id,
      product_name: input.product_name,
      merchant: input.merchant,
      unit_price: input.unit_price,
      total_price: input.total_price,
      commission: input.commission,
      commission_rate: input.commission_rate,
      is_lucky: input.is_lucky,
      lucky_commission_percent: input.lucky_commission_percent,
      vip_level: input.vip_level,
      status: 'completed',
      note: input.note || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as OrderRow;
}

export function computeDerivedVip(currentBalance: number): DerivedVip {
  const vipLevel = computeVipLevel(currentBalance);
  const dailyOrderLimit = getVipDailyOrderLimit(vipLevel);
  return { totalDeposits: currentBalance, vipLevel, dailyOrderLimit };
}

export function sumApprovedDeposits(deposits: DepositRow[]): number {
  return deposits
    .filter((d) => d.status === 'approved')
    .reduce((sum, d) => sum + Number(d.amount), 0);
}

// ============ user_profiles ============

export async function fetchUserProfile(userId: string): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .rpc('get_user_profile_safe', { p_user_id: userId })
    .maybeSingle();
  if (error) throw error;
  return (data as UserProfileRow) ?? null;
}

export async function ensureUserProfile(input: {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  invitation_code?: string;
  referral_code?: string;
}): Promise<UserProfileRow | null> {
  // Use the SECURITY DEFINER RPC to create the profile — this bypasses RLS
  // so it works even if the session isn't fully established yet after signUp
  const { data, error } = await supabase
    .rpc('create_user_profile', {
      p_user_id: input.user_id,
      p_email: input.email,
      p_full_name: input.full_name,
      p_phone: input.phone,
      p_invitation_code: input.invitation_code ?? '',
      p_referral_code: input.referral_code ?? '',
    })
    .maybeSingle();
  if (error) {
    // Wrap in a real Error so callers get instanceof Error === true
    throw new Error(`Profile creation failed: ${error.message} (code: ${error.code})`);
  }
  return (data as UserProfileRow) ?? null;
}

// ============ products ============

export async function fetchProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

// ============ RPC: submit_order ============

export async function submitOrderRpc(input: {
  p_user_id: string;
  p_order_number: string;
  p_task_number: string;
  p_product_id: string;
  p_product_name: string;
  p_merchant: string;
  p_unit_price: number;
  p_total_price: number;
  p_commission: number;
  p_commission_rate: number;
  p_is_lucky: boolean;
  p_lucky_commission_percent: number;
  p_vip_level: number;
  p_note: string;
}): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .rpc('submit_order', input);
  if (error) throw error;
  return (data as UserProfileRow) ?? null;
}

// ============ RPC: complete_order ============

export async function completeOrderRpc(input: {
  p_user_id: string;
  p_order_number: string;
  p_task_number: string;
  p_product_id: string;
  p_product_name: string;
  p_merchant: string;
  p_unit_price: number;
  p_total_price: number;
  p_commission: number;
  p_commission_rate: number;
  p_is_lucky: boolean;
  p_lucky_commission_percent: number;
  p_vip_level: number;
  p_note: string;
}): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .rpc('complete_order', input);
  if (error) throw error;
  return (data as UserProfileRow) ?? null;
}

// ============ RPC: approve_deposit ============

export async function approveDepositRpc(depositId: string, adminId?: string): Promise<string | null> {
  const { data, error } = await supabase
    .rpc('approve_deposit', { p_deposit_id: depositId, p_admin_id: adminId ?? '' });
  if (error) throw error;
  return (data as string) ?? null;
}

// ============ withdrawals ============

export interface WithdrawalRow {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  amount: number;
  method: string;
  account_info: string;
  status: 'pending' | 'approved' | 'rejected';
  note: string;
  created_at: string;
  reviewed_at: string | null;
  currency: string | null;
  network: string | null;
  wallet_address: string | null;
  account_name: string | null;
  tx_hash: string | null;
  admin_note: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
}

export async function fetchAllWithdrawals(): Promise<WithdrawalRow[]> {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WithdrawalRow[];
}

export async function fetchWithdrawals(userId: string): Promise<WithdrawalRow[]> {
  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WithdrawalRow[];
}

export async function insertWithdrawal(input: {
  user_id: string;
  user_email: string;
  user_name: string;
  amount: number;
  method: string;
  account_info: string;
  note: string;
  currency?: string;
  network?: string;
  wallet_address?: string;
  account_name?: string;
}): Promise<WithdrawalRow> {
  const { data, error } = await supabase.rpc('submit_withdrawal_request', {
    p_user_id: input.user_id,
    p_user_email: input.user_email,
    p_user_name: input.user_name,
    p_amount: input.amount,
    p_method: input.method,
    p_currency: input.currency || 'USD',
    p_network: input.network || '',
    p_wallet_address: input.wallet_address || '',
    p_account_name: input.account_name || '',
    p_account_info: input.account_info,
    p_note: input.note || '',
  });
  if (error) throw error;
  // Re-fetch the created row
  const id = data as string;
  if (!id) throw new Error('Withdrawal submission failed');
  const { data: row, error: fetchErr } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;
  return row as WithdrawalRow;
}

export async function approveWithdrawalRpc(
  withdrawalId: string,
  adminId: string,
  txHash?: string,
  adminNote?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .rpc('approve_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_admin_id: adminId,
      p_tx_hash: txHash || '',
      p_admin_note: adminNote || '',
    });
  if (error) throw error;
  return (data as string) ?? null;
}

export async function rejectWithdrawalRpc(
  withdrawalId: string,
  adminId: string,
  reason?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .rpc('reject_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_admin_id: adminId,
      p_reason: reason || '',
    });
  if (error) throw error;
  return (data as string) ?? null;
}

// ============ products CRUD ============

export async function insertProduct(input: Omit<ProductRow, 'id'> & { id?: string }): Promise<ProductRow | null> {
  const { data, error } = await supabase
    .from('products')
    .insert({
      id: input.id || ('p' + Date.now()),
      name: input.name,
      merchant: input.merchant,
      price: input.price,
      category: input.category,
      category_tint: input.category_tint,
      image: input.image,
      min_vip: input.min_vip,
      is_lucky: input.is_lucky,
      lucky_commission_percent: input.lucky_commission_percent,
      sort_order: input.sort_order,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProductRow;
}

export async function updateProduct(id: string, updates: Partial<ProductRow>): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      name: updates.name,
      merchant: updates.merchant,
      price: updates.price,
      category: updates.category,
      category_tint: updates.category_tint,
      image: updates.image,
      min_vip: updates.min_vip,
      is_lucky: updates.is_lucky,
      lucky_commission_percent: updates.lucky_commission_percent,
      sort_order: updates.sort_order,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============ all orders (admin) ============

export async function fetchAllOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrderRow[];
}

// ============ all user profiles (admin) ============

export async function fetchAllUserProfiles(): Promise<UserProfileRow[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserProfileRow[];
}

// ============ VIP config ============

export interface VipConfigRow {
  level: number;
  name: string;
  daily_order_limit: number;
  commission_rate: number;
  min_deposit: number;
  updated_at: string;
}

export async function fetchVipConfig(): Promise<VipConfigRow[]> {
  const { data, error } = await supabase
    .from('vip_config')
    .select('*')
    .order('level', { ascending: true });
  if (error) throw error;
  return (data ?? []) as VipConfigRow[];
}

export async function updateVipConfig(level: number, updates: Partial<VipConfigRow>): Promise<void> {
  const { error } = await supabase
    .from('vip_config')
    .update({
      name: updates.name,
      daily_order_limit: updates.daily_order_limit,
      commission_rate: updates.commission_rate,
      min_deposit: updates.min_deposit,
      updated_at: new Date().toISOString(),
    })
    .eq('level', level);
  if (error) throw error;
}

export async function insertVipConfig(input: VipConfigRow): Promise<void> {
  const { error } = await supabase
    .from('vip_config')
    .insert({
      level: input.level,
      name: input.name,
      daily_order_limit: input.daily_order_limit,
      commission_rate: input.commission_rate,
      min_deposit: input.min_deposit,
    });
  if (error) throw error;
}

export async function deleteVipConfig(level: number): Promise<void> {
  const { error } = await supabase
    .from('vip_config')
    .delete()
    .eq('level', level);
  if (error) throw error;
}

// ============ announcements ============

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function fetchAnnouncements(): Promise<AnnouncementRow[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AnnouncementRow[];
}

export async function insertAnnouncement(input: Omit<AnnouncementRow, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .insert({
      title: input.title,
      body: input.body,
      type: input.type,
      is_active: input.is_active,
      sort_order: input.sort_order,
    });
  if (error) throw error;
}

export async function updateAnnouncement(id: string, updates: Partial<AnnouncementRow>): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({
      title: updates.title,
      body: updates.body,
      type: updates.type,
      is_active: updates.is_active,
      sort_order: updates.sort_order,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============ activity logs ============

export interface ActivityLogRow {
  id: string;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export async function fetchActivityLogs(limit = 50): Promise<ActivityLogRow[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLogRow[];
}

export async function logActivity(
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  details: string
): Promise<void> {
  const { error } = await supabase
    .rpc('log_activity', {
      p_actor: actor,
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_details: details,
    });
  if (error) throw error;
}

// ============ dashboard stats ============

export interface DashboardStats {
  total_users: number;
  total_balance: number;
  pending_deposits: number;
  pending_withdrawals: number;
  total_deposits_approved: number;
  total_withdrawals_approved: number;
  total_orders: number;
  total_commission: number;
  active_announcements: number;
  total_products: number;
  lucky_products: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw error;
  return data as DashboardStats;
}

// ============ Support Tickets ============

export interface SupportTicketRow {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  message: string;
  admin_reply: string | null;
  admin_notes: string | null;
  assigned_admin: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  replied_at: string | null;
}

export async function fetchUserTickets(userId: string): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportTicketRow[];
}

export async function fetchAllTickets(): Promise<SupportTicketRow[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SupportTicketRow[];
}

export async function insertTicket(input: {
  user_id: string;
  user_email: string;
  user_name: string;
  subject: string;
  category: string;
  priority: string;
  message: string;
}): Promise<SupportTicketRow> {
  const { data, error } = await supabase.from('support_tickets').insert(input).select().single();
  if (error) throw error;
  return data as SupportTicketRow;
}

export async function adminReplyTicketRpc(ticketId: string, adminId: string, message: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reply_ticket', {
    p_ticket_id: ticketId,
    p_admin_id: adminId,
    p_message: message,
  });
  if (error) throw error;
}

export async function updateTicketStatusAdminRpc(
  ticketId: string,
  adminId: string,
  status: string,
  priority?: string,
  adminNotes?: string
): Promise<void> {
  const { error } = await supabase.rpc('update_ticket_status_admin', {
    p_ticket_id: ticketId,
    p_admin_id: adminId,
    p_status: status,
    p_priority: priority || null,
    p_admin_notes: adminNotes || null,
  });
  if (error) throw error;
}

export async function updateTicketStatus(ticketId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticketId);
  if (error) throw error;
}

// ============ Support Messages (threaded conversation) ============

export interface SupportMessageRow {
  id: string;
  ticket_id: string;
  sender: string;
  sender_role: string | null;
  message: string;
  attachment_url: string | null;
  is_read: boolean;
  is_edited: boolean;
  edited_at: string | null;
  edited_by: string | null;
  created_at: string;
}

export async function fetchTicketMessages(ticketId: string): Promise<SupportMessageRow[]> {
  const { data, error } = await supabase
    .from('customer_support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SupportMessageRow[];
}

export async function fetchTicketMessagesAdmin(ticketId: string): Promise<SupportMessageRow[]> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SupportMessageRow[];
}

export async function insertTicketMessage(input: {
  ticket_id: string;
  sender: string;
  message: string;
  attachment_url?: string | null;
}): Promise<SupportMessageRow> {
  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: input.ticket_id,
      sender: input.sender,
      message: input.message,
      attachment_url: input.attachment_url || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as SupportMessageRow;
}

export async function markTicketMessagesRead(ticketId: string): Promise<void> {
  const { error } = await supabase
    .from('support_messages')
    .update({ is_read: true })
    .eq('ticket_id', ticketId)
    .eq('is_read', false);
  if (error) throw error;
}

// ============ FAQ ============

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchFaqs(): Promise<FaqRow[]> {
  const { data, error } = await supabase
    .from('faq_entries')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FaqRow[];
}

export async function fetchAllFaqs(): Promise<FaqRow[]> {
  const { data, error } = await supabase
    .from('faq_entries')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FaqRow[];
}

export async function insertFaq(input: Omit<FaqRow, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('faq_entries').insert(input);
  if (error) throw error;
}

export async function updateFaq(id: string, updates: Partial<FaqRow>): Promise<void> {
  const { error } = await supabase
    .from('faq_entries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteFaq(id: string): Promise<void> {
  const { error } = await supabase.from('faq_entries').delete().eq('id', id);
  if (error) throw error;
}

// ============ Chat Messages ============

export interface ChatMessageRow {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  sender: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export async function fetchChatMessages(userId: string): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

export async function fetchAllChatMessages(): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

export async function insertChatMessage(input: {
  user_id: string;
  user_email: string;
  user_name: string;
  sender: string;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from('chat_messages').insert(input);
  if (error) throw error;
}

// ============ Balance Transactions (audit) ============

export interface BalanceTransactionRow {
  id: string;
  customer_id: string;
  admin_id: string | null;
  deposit_id: string | null;
  previous_balance: number;
  adjustment_amount: number;
  new_balance: number;
  adjustment_type: 'credit' | 'debit';
  reason: string;
  reference: string | null;
  created_at: string;
}

export async function fetchBalanceTransactions(customerId: string, limit = 20): Promise<BalanceTransactionRow[]> {
  const { data, error } = await supabase
    .from('balance_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BalanceTransactionRow[];
}

export async function adminAdjustBalance(input: {
  customerId: string;
  adjustmentType: 'credit' | 'debit';
  amount: number;
  reason: string;
  reference: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc('admin_adjust_balance', {
    p_customer_id: input.customerId,
    p_adjustment_type: input.adjustmentType,
    p_amount: input.amount,
    p_reason: input.reason,
    p_reference: input.reference,
  });
  if (error) throw error;
  return Number(data);
}

export async function rejectDepositRpc(depositId: string, adminId: string, reason: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('reject_deposit', {
    p_deposit_id: depositId,
    p_admin_id: adminId,
    p_reason: reason,
  });
  if (error) throw error;
  return (data as string) ?? null;
}

// ============ Referral System ============

export async function fetchReferralRewardsReceived(userId: string, limit = 20): Promise<ReferralRewardRow[]> {
  const { data, error } = await supabase
    .from('referral_rewards')
    .select('*')
    .eq('invited_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ReferralRewardRow[];
}

export async function fetchReferralRewardsGiven(userId: string, limit = 20): Promise<ReferralRewardRow[]> {
  const { data, error } = await supabase
    .from('referral_rewards')
    .select('*')
    .eq('inviter_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ReferralRewardRow[];
}

export async function fetchAllReferralRewards(limit = 50): Promise<ReferralRewardRow[]> {
  const { data, error } = await supabase
    .from('referral_rewards')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ReferralRewardRow[];
}

export async function fetchInvitedUsers(userId: string): Promise<UserProfileRow[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('inviter_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserProfileRow[];
}

// ============ Per-User Lucky Product Settings ============

export interface UserLuckySettingsRow {
  user_id: string;
  lucky_enabled: boolean;
  lucky_chance_percent: number;
  lucky_commission_percent: number;
  lucky_daily_limit: number;
  lucky_min_price: number | null;
  lucky_max_price: number | null;
  updated_at: string;
  updated_by: string | null;
}

export async function fetchUserLuckySettings(userId: string): Promise<UserLuckySettingsRow | null> {
  const { data, error } = await supabase
    .rpc('get_user_lucky_settings', { p_user_id: userId });
  if (error) throw error;
  return (data as UserLuckySettingsRow) ?? null;
}

export async function fetchAllUserLuckySettings(): Promise<UserLuckySettingsRow[]> {
  const { data, error } = await supabase
    .from('user_lucky_settings')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserLuckySettingsRow[];
}

export async function adminUpdateUserLuckySettings(input: {
  adminId: string;
  userId: string;
  luckyEnabled: boolean;
  luckyChancePercent: number;
  luckyCommissionPercent: number;
  luckyDailyLimit: number;
  luckyMinPrice: number | null;
  luckyMaxPrice: number | null;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_update_user_lucky_settings', {
    p_admin_id: input.adminId,
    p_user_id: input.userId,
    p_lucky_enabled: input.luckyEnabled,
    p_lucky_chance_percent: input.luckyChancePercent,
    p_lucky_commission_percent: input.luckyCommissionPercent,
    p_lucky_daily_limit: input.luckyDailyLimit,
    p_lucky_min_price: input.luckyMinPrice,
    p_lucky_max_price: input.luckyMaxPrice,
  });
  if (error) throw error;
}

// ============ Admin Ticket Message Edit ============

export async function adminEditTicketMessage(messageId: string, adminId: string, newMessage: string): Promise<void> {
  const { error } = await supabase.rpc('admin_edit_ticket_message', {
    p_message_id: messageId,
    p_admin_id: adminId,
    p_new_message: newMessage,
  });
  if (error) throw error;
}

// ============ Admin Audit Log ============

export interface AdminAuditLogRow {
  id: string;
  admin_id: string;
  customer_id: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}

export async function fetchAdminAuditLogs(limit = 50): Promise<AdminAuditLogRow[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AdminAuditLogRow[];
}

export async function adminLogAction(input: {
  adminId: string;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
  customerId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  details?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_log_action', {
    p_admin_id: input.adminId,
    p_action: input.action,
    p_old_value: input.oldValue ?? null,
    p_new_value: input.newValue ?? null,
    p_customer_id: input.customerId ?? null,
    p_target_type: input.targetType ?? null,
    p_target_id: input.targetId ?? null,
    p_details: input.details ?? null,
  });
  if (error) throw error;
}

// ============ Admin: Set Start Access ============

export async function adminSetStartAccess(adminId: string, userId: string, enabled: boolean, blockMessage?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_start_access', {
    p_admin_id: adminId,
    p_user_id: userId,
    p_enabled: enabled,
    p_block_message: blockMessage ?? null,
  });
  if (error) throw error;
}
