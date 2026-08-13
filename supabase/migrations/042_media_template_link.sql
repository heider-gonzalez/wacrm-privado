-- ============================================================
-- 042_media_template_link.sql
--
-- Phase 3 of the Media Library: link a message template to the
-- media_assets row chosen for its media header, so the library
-- can answer "which templates use this file?" (the "Utilizado en"
-- panel and the delete-in-use guard).
--
-- Why this exists
--
--   Templates with image/video/document headers currently hold a
--   raw `header_media_url` (uploaded into `chat-media` by the
--   template manager) plus a Meta `header_handle`. There is no
--   link to the Media Library, so a file the library serves to a
--   template is invisible in the usage view — migration 041 only
--   covered broadcasts. This migration mirrors 041 for templates:
--
--   1. message_templates.media_asset_id — FK to media_assets,
--      ON DELETE SET NULL. Deleting the asset doesn't cascade into
--      the template row; the `header_media_url` snapshot still
--      carries the sample URL Meta needs at submit time.
--
--   2. A partial index so "which templates use this asset?" stays
--      cheap — most templates are text-header and leave this NULL.
--
-- No new RLS needed — message_templates policies (017_account_
-- sharing) are written with USING/WITH on account_id and cover any
-- new column by default (column-level RLS is not enabled).
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS media_asset_id UUID
    REFERENCES public.media_assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.message_templates.media_asset_id IS
  'Media Library asset chosen for the template header (phase 3). NULL for text headers, legacy chat-media URLs, or Meta-synced templates.';

-- Fetch-joined listing by asset (e.g. "which templates used this
-- file?"). Partial index so it stays tiny — most templates have
-- NULL here (text headers or no header).
CREATE INDEX IF NOT EXISTS message_templates_media_asset_id_idx
  ON public.message_templates (media_asset_id)
  WHERE media_asset_id IS NOT NULL;
