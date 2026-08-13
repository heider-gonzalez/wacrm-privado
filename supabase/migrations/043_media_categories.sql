-- ============================================================
-- 043_media_categories.sql
--
-- Phase 5 of the Media Library: virtual folders (categories).
--
-- "No physical folders — only categories." A category is a
-- user-defined label the account groups its media into (e.g.
-- Marketing, Promociones, Videos, Catálogos, Horeca). Assets stay
-- in the flat `media-library` bucket; the folder is just a
-- `category_id` on the media_assets row.
--
-- Why this exists
--
--   The library (migration 040) has no grouping: search + kind
--   filter are the only ways to browse. Virtual folders give the
--   account a first-class way to organise campaign media without
--   touching Storage (no nested paths, no renames) — the same
--   "category as metadata" shape the codebase already uses for
--   contacts (tags) but one-to-many instead of many-to-many.
--
-- What this migration adds
--
--   1. media_categories — one row per folder, account-scoped,
--      name unique per account (case-sensitive; the UI trims).
--
--   2. media_assets.category_id — FK ON DELETE SET NULL. Deleting
--      a folder returns its files to "uncategorized" rather than
--      deleting them (a folder is organisational, not ownership).
--
--   3. A partial index so "which files are in this folder?" stays
--      cheap (most queries filter by account + category).
--
--   4. An UPDATE policy on media_assets. Migration 040 deliberately
--      made assets immutable (no UPDATE policy) so a swapped file
--      couldn't silently change in-flight sends. Moving a file
--      between folders needs UPDATE. The agent+ gate mirrors the
--      existing insert/delete policies; column-level RLS is not
--      enabled, so this grants agent+ the ability to update any
--      column — the same trusted role that can already insert and
--      delete these rows.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. media_categories table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_media_categories_account
  ON public.media_categories(account_id, name);

ALTER TABLE public.media_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_categories_select ON public.media_categories;
CREATE POLICY media_categories_select ON public.media_categories
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS media_categories_insert ON public.media_categories;
CREATE POLICY media_categories_insert ON public.media_categories
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS media_categories_update ON public.media_categories;
CREATE POLICY media_categories_update ON public.media_categories
  FOR UPDATE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS media_categories_delete ON public.media_categories;
CREATE POLICY media_categories_delete ON public.media_categories
  FOR DELETE USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- 2. media_assets.category_id (virtual folder)
-- ============================================================
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES public.media_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.media_assets.category_id IS
  'Virtual folder the asset belongs to (phase 5). NULL = uncategorized. SET NULL when the folder is deleted.';

CREATE INDEX IF NOT EXISTS media_assets_category_id_idx
  ON public.media_assets (category_id)
  WHERE category_id IS NOT NULL;

-- ============================================================
-- 3. media_assets UPDATE policy — moving assets between folders.
--    Migration 040 left assets immutable on purpose; the folder
--    link is the one mutable, non-media field.
-- ============================================================
DROP POLICY IF EXISTS media_assets_update ON public.media_assets;
CREATE POLICY media_assets_update ON public.media_assets
  FOR UPDATE USING (is_account_member(account_id, 'agent'));
