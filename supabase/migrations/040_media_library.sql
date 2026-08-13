-- ============================================================
-- 040_media_library.sql
--
-- Media Library module (phase 1): a managed repository of the
-- images / videos / documents used as WhatsApp template header
-- media in Broadcast campaigns.
--
-- Why this exists
--
--   Today, template header media is either a hand-pasted public
--   URL (broadcasts wizard) or an ad-hoc upload into `chat-media`
--   (template manager). Those objects are orphans — nothing lists
--   them, so there is no way to browse, search, reuse, or clean
--   them up. The Media Library makes these files first-class:
--   one dedicated bucket + one metadata table per account.
--
-- What this migration adds
--
--   1. A dedicated `media-library` Storage bucket. Public reads
--      so Meta can fetch the URL at send time — the same reason
--      `chat-media` (023) and `flow-media` (016/020) are public.
--      Writes are scoped to account members via the path's first
--      segment (`account-<account_id>`), same predicate shape as
--      migrations 020/023.
--
--   2. A `media_assets` metadata table — the FIRST media table
--      in the schema. Storage object names are sanitized +
--      timestamped (see buildMediaPath in
--      src/lib/storage/upload-media.ts), so the ORIGINAL file
--      name only survives here. The table also powers fast
--      search / kind filtering in SQL that Storage's list() API
--      can't do, and gives phase 2's broadcast media picker a
--      queryable catalogue (no SDK listing gymnastics).
--
-- Path convention (same as 020/023):
--   media-library/account-<account_id>/<timestamp>-<basename>.<ext>
--
-- Size limit 16 MB — matches the other media buckets and Meta's
-- tightest universal cap (video). Per-kind client-side ceilings
-- (image 5 MB etc.) are enforced before upload by
-- MEDIA_MAX_BYTES_BY_KIND in src/lib/storage/upload-media.ts.
--
-- MIME list: everything Meta accepts for template headers —
-- images, videos, documents. Audio is intentionally excluded:
-- WhatsApp template headers don't support it. chat-media keeps
-- audio for live voice notes; this library is campaign media.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. media-library storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-library',
  'media-library',
  TRUE,
  16777216, -- 16 MB (Meta video cap; matches chat-media / flow-media)
  ARRAY[
    -- Images
    'image/png', 'image/jpeg', 'image/webp',
    -- Videos
    'video/mp4', 'video/3gpp',
    -- Documents
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- 2. Storage RLS — account-scoped writes, public reads
--
-- Same predicate shape as migration 023's chat-media policies:
-- writes are allowed when the path's first segment is
-- `account-<account_id>` for an account the caller belongs to.
-- Reads are public (the bucket is public so Meta can fetch links).
--
-- Drop-then-create (Postgres has no CREATE POLICY IF NOT EXISTS).
-- ============================================================
DROP POLICY IF EXISTS "Media library is publicly readable" ON storage.objects;
CREATE POLICY "Media library is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media-library');

DROP POLICY IF EXISTS "Members can upload media library files" ON storage.objects;
CREATE POLICY "Members can upload media library files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-library'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can update media library files" ON storage.objects;
CREATE POLICY "Members can update media library files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media-library'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete media library files" ON storage.objects;
CREATE POLICY "Members can delete media library files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media-library'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

-- ============================================================
-- 3. media_assets metadata table
--
-- One row per uploaded object. `path` + `bucket` identify the
-- Storage object; everything else is display / filtering data
-- the Storage API either sanitizes away (original name) or
-- can't query efficiently (kind, size, search by name).
--
-- Assets are immutable: there is deliberately no UPDATE policy.
-- "Replacing" a file = upload new + delete old, which keeps the
-- public URL story honest (a swapped file under the same URL
-- would silently change in-flight template sends).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  bucket      TEXT NOT NULL DEFAULT 'media-library',
  path        TEXT NOT NULL,
  -- Original file name as the user uploaded it (the Storage path
  -- is sanitized + timestamped, so this is the only place the
  -- real name survives). Used for display and search.
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  -- Coarse bucket for the UI filter: derived from mime_type at
  -- insert time by the client (kindFromMime in src/lib/media/).
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'video', 'document')),
  size_bytes  BIGINT NOT NULL CHECK (size_bytes >= 0),
  -- Stored so phase 2's broadcast picker can hand Meta a URL
  -- without a Storage round-trip.
  public_url  TEXT NOT NULL,
  -- Audit only; SET NULL so deleting a user doesn't cascade-
  -- delete the account's media.
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);

CREATE INDEX IF NOT EXISTS idx_media_assets_account_created
  ON public.media_assets(account_id, created_at DESC);

-- Backs the "filter by type" UI (Todos / Imágenes / Videos / Documentos).
CREATE INDEX IF NOT EXISTS idx_media_assets_account_kind
  ON public.media_assets(account_id, kind);

-- Backs the name search box (ILIKE '%...%'). pg_trgm would be
-- nicer, but library volumes (hundreds of rows per account, not
-- millions) don't justify the extension yet.
CREATE INDEX IF NOT EXISTS idx_media_assets_account_name
  ON public.media_assets(account_id, file_name);

-- ============================================================
-- 4. Table RLS — mirrors the broadcasts capability split
--    (017_account_sharing.sql): every member reads (viewers
--    included), agent+ writes. UI gates the same actions with
--    useCan('send-messages') so both layers speak one language.
-- ============================================================
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_assets_select ON public.media_assets;
CREATE POLICY media_assets_select ON public.media_assets
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS media_assets_insert ON public.media_assets;
CREATE POLICY media_assets_insert ON public.media_assets
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS media_assets_delete ON public.media_assets;
CREATE POLICY media_assets_delete ON public.media_assets
  FOR DELETE USING (is_account_member(account_id, 'agent'));
