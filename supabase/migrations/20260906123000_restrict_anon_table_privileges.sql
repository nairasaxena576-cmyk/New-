-- Restrict anon table-level privileges to SELECT-only on public catalog tables
--
-- Problem: post-migration verification of the production database found
-- that the anon role holds direct, broad table privileges (INSERT,
-- UPDATE, DELETE, TRUNCATE, and others) across most of the public schema,
-- including private tables such as admin_audit_log, balance_transactions,
-- chat_messages, customer_support_messages, payment_wallets,
-- referral_rewards, support_messages, support_tickets,
-- user_lucky_settings, and user_profiles. pg_class ACL inspection
-- confirmed these are granted directly to anon, not inherited from
-- PUBLIC. RLS is enabled on all 17 public tables and correctly restricts
-- anon to SELECT-only on announcements, faq_entries, products, and
-- vip_config today, but RLS is a row filter, not a substitute for correct
-- table-level grants: as a second, independent layer of defense, anon
-- should not hold write/management privileges on any table at all, and
-- should not hold any privilege whatsoever on tables it has no legitimate
-- reason to touch.
--
-- Fix: revoke every privilege anon holds on every table (this also
-- covers views, such as customer_support_messages, since
-- "ALL TABLES IN SCHEMA" applies to views and foreign tables as well as
-- ordinary tables), then explicitly re-grant SELECT only on the four
-- tables the application intentionally exposes to signed-out visitors
-- (the public product catalog, VIP tier info, announcements banner, and
-- FAQ list — all read before or without login on the marketing-facing
-- parts of the app).
--
-- This does not touch the authenticated role, RLS policies, functions/
-- RPC grants, or any table structure. REVOKE/GRANT are idempotent by
-- nature: re-running this migration changes nothing if already applied.
-- Valid on PostgreSQL 17.6; uses no version-specific syntax.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT ON public.announcements TO anon;
GRANT SELECT ON public.faq_entries TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.vip_config TO anon;
