/*
# Add wallet metadata to deposit requests

1. Purpose
- Preserve the existing deposits table and add the selected wallet details required by the Recharge flow.

2. Modified table
- `deposits.wallet_id`: the payment wallet selected by the customer.
- `deposits.currency`: token symbol copied from the selected wallet.
- `deposits.network`: network copied from the selected wallet.

3. Security
- No existing RLS policies are changed. The new fields are protected by the existing deposits table policies.

4. Data safety
- This migration only adds nullable columns and does not remove or alter existing data.
*/

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.payment_wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS network text;

CREATE INDEX IF NOT EXISTS deposits_wallet_id_idx ON public.deposits(wallet_id);
