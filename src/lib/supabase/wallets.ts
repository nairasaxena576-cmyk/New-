import { supabase } from '@/lib/supabase/client';

export interface WalletRow {
  id: string;
  token_name: string;
  display_name: string;
  network: string;
  wallet_address: string;
  contract_address: string | null;
  qr_image_url: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WalletInput {
  token_name: string;
  display_name: string;
  network: string;
  wallet_address: string;
  contract_address?: string | null;
  qr_image_url?: string | null;
  instructions?: string | null;
  is_active: boolean;
  sort_order: number;
}

export async function fetchActiveWallets(): Promise<WalletRow[]> {
  const { data, error } = await supabase
    .from('payment_wallets')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WalletRow[];
}

export async function fetchAllWallets(): Promise<WalletRow[]> {
  const { data, error } = await supabase
    .from('payment_wallets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WalletRow[];
}

export async function insertWallet(input: WalletInput): Promise<WalletRow> {
  const { data, error } = await supabase
    .from('payment_wallets')
    .insert({
      token_name: input.token_name,
      display_name: input.display_name,
      network: input.network,
      wallet_address: input.wallet_address,
      contract_address: input.contract_address || null,
      qr_image_url: input.qr_image_url || null,
      instructions: input.instructions || null,
      is_active: input.is_active,
      sort_order: input.sort_order,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WalletRow;
}

export async function updateWallet(id: string, input: Partial<WalletInput>): Promise<void> {
  const { error } = await supabase
    .from('payment_wallets')
    .update({
      token_name: input.token_name,
      display_name: input.display_name,
      network: input.network,
      wallet_address: input.wallet_address,
      contract_address: input.contract_address || null,
      qr_image_url: input.qr_image_url || null,
      instructions: input.instructions || null,
      is_active: input.is_active,
      sort_order: input.sort_order,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteWallet(id: string): Promise<void> {
  const { error } = await supabase
    .from('payment_wallets')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function uploadWalletQr(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('wallet-qr')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('wallet-qr').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadSupportAttachment(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from('support-attachments')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('support-attachments').getPublicUrl(path);
  return data.publicUrl;
}
