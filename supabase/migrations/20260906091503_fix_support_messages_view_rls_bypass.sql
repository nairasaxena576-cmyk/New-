/*
# Fix RLS bypass via customer_support_messages view

## Problem
`support_messages` has correct row-scoped RLS ("user_select_own_messages":
a user may only see messages on their own ticket). But
`customer_support_messages` (a plain view over support_messages, created in
20260903110740_..._start_block_message_and_edit_fix.sql) was defined
without `security_invoker`. Views created without this option evaluate the
underlying table's RLS policies as the VIEW OWNER (the migration-running
role, which owns/bypasses RLS on its own tables by default), not as the
querying user — a well-known Postgres/Supabase RLS-bypass footgun.

Since src/lib/supabase/deposits.ts:fetchTicketMessages() queries this view
filtered only by `ticket_id` (no ownership check applied client-side —
correctly relying on RLS), any authenticated user could pass an arbitrary
ticket_id and read another user's private support conversation.

## Fix
Recreate the view with `security_invoker = true` (Postgres 15+, supported
by current Supabase projects) so it enforces RLS as the querying user,
matching the base table's policies exactly.
*/

CREATE OR REPLACE VIEW public.customer_support_messages
WITH (security_invoker = true) AS
SELECT
  id,
  ticket_id,
  sender,
  sender_role,
  message,
  attachment_url,
  is_read,
  created_at
FROM public.support_messages;

GRANT SELECT ON public.customer_support_messages TO authenticated;
