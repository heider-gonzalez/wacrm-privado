-- ============================================================
-- 041_broadcast_media_link.sql
--
-- Phase 2 of the Media Library: link a broadcast to the
-- media_assets row picked in the wizard (instead of pasting a
-- raw URL).
--
-- Why this exists
--
--   The wizard previously held a hand-pasted `headerMediaUrl`
--   string in React state — never persisted, so drafts forgot
--   the choice and the audit trail had no record of which asset
--   a campaign used. The Media Library (migration 040) made
--   campaign files first-class; this migration records the
--   selection on the broadcast row so:
--     - drafts round-trip the chosen asset (future resume UX),
--     - the detail page can show "this campaign used media X",
--     - analytics can JOIN broadcasts → media_assets.
--
-- What this migration adds
--
--   1. broadcasts.media_asset_id — FK to media_assets, ON DELETE
--      SET NULL. Deleting the asset from the library doesn't
--      cascade into the broadcast row; the snapshot column below
--      still carries the URL Meta needs at send time, so a
--      historical broadcast keeps a working link even after the
--      library entry is gone.
--
--   2. broadcasts.header_media_url — TEXT snapshot of
--      media_assets.public_url at pick time. The wizard always
--      writes this alongside media_asset_id; it is the value
--      actually plumbed to Meta (template-send-builder.ts).
--      NULL when the broadcast relies on the template's default
--      media URL (the wizard allows leaving the picker empty if
--      the template carries its own header_media_url).
--
-- No new RLS needed — broadcasts policies (017_account_sharing)
-- are written with USING/WITH on account_id and cover any new
-- column by default (column-level RLS is not enabled).
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS media_asset_id UUID
    REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS header_media_url TEXT;

COMMENT ON COLUMN public.broadcasts.media_asset_id IS
  'Media Library asset picked in the broadcast wizard (phase 2). NULL for text-header templates or when relying on the template default.';
COMMENT ON COLUMN public.broadcasts.header_media_url IS
  'Snapshot of media_assets.public_url sent to Meta at send time. NULL when relying on the template default. Kept even if media_asset_id is SET NULL by an asset delete.';

-- Fetch-joined listing by asset (e.g. "which broadcasts used
-- this image?") is the obvious follow-up query. Partial index so
-- it stays tiny — most broadcasts have NULL here (text headers).
CREATE INDEX IF NOT EXISTS broadcasts_media_asset_id_idx
  ON public.broadcasts (media_asset_id)
  WHERE media_asset_id IS NOT NULL;