import { MEDIA_MAX_BYTES_BY_KIND } from "@/lib/storage/upload-media";

/**
 * Media Library domain constants + pure helpers (no I/O).
 *
 * The library stores campaign media (WhatsApp template header
 * images / videos / documents) in the dedicated `media-library`
 * Storage bucket (migration 040) and indexes each object with a
 * `media_assets` metadata row. Everything in this file is pure so
 * it can be unit-tested without a Supabase client — see
 * media-kinds.test.ts.
 */

/** Bucket created by migration 040_media_library.sql. */
export const MEDIA_LIBRARY_BUCKET = "media-library";

/**
 * Coarse classification used for the UI filter and the
 * `media_assets.kind` CHECK constraint. Audio is deliberately
 * absent: WhatsApp template headers don't support it (voice notes
 * live in `chat-media`, not in the campaign library).
 */
export type MediaKind = "image" | "video" | "document";

/**
 * MIME allowlist per kind — mirrors the bucket's
 * `allowed_mime_types` in migration 040. The bucket enforces this
 * server-side; we mirror it client-side so the file picker can
 * filter and we can reject BEFORE upload (the same deliberate
 * duplication as `PICKER_ACCEPT` in the inbox composer).
 */
export const MEDIA_LIBRARY_MIME_BY_KIND: Record<MediaKind, readonly string[]> = {
  image: ["image/png", "image/jpeg", "image/webp"],
  video: ["video/mp4", "video/3gpp"],
  document: [
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ],
} as const;

/**
 * Comma-joined `accept` string for the hidden file input — the
 * browser greys out anything outside the allowlist at pick time.
 */
export const MEDIA_LIBRARY_ACCEPT: string = Object.values(
  MEDIA_LIBRARY_MIME_BY_KIND,
)
  .flat()
  .join(",");

/** Per-kind upload ceiling (image 5 MB, video/document 16 MB — Meta's caps). */
export function maxBytesForKind(kind: MediaKind): number {
  return MEDIA_MAX_BYTES_BY_KIND[kind];
}

/**
 * Map a MIME type to its library kind, or null when the type is
 * not in the bucket allowlist (caller rejects the file).
 */
export function kindFromMime(mime: string): MediaKind | null {
  for (const kind of Object.keys(MEDIA_LIBRARY_MIME_BY_KIND) as MediaKind[]) {
    if (MEDIA_LIBRARY_MIME_BY_KIND[kind].includes(mime)) return kind;
  }
  return null;
}

/**
 * Result of validating a picked file against the library rules.
 *
 * Intentionally a FLAT shape, not a discriminated union: the repo
 * compiles with `strict: false`, and boolean-discriminant union
 * narrowing doesn't work without strictNullChecks (the same
 * reason InteractiveValidation/PeekResult narrowing errors exist
 * elsewhere in the codebase). Optional fields keep every access
 * narrowing-free.
 */
export interface MediaFileCheck {
  ok: boolean;
  /** Set iff !ok — why the file was rejected. */
  reason?: "unsupported-type" | "too-large";
  /** Media kind when the MIME type is allow-listed (also set on too-large). */
  kind?: MediaKind;
  /** Set on too-large rejects — the per-kind ceiling that was exceeded. */
  maxBytes?: number;
}

/**
 * Validate a file BEFORE any network traffic: supported type and
 * under the per-kind ceiling (a file the bucket accepts but Meta
 * would reject at send time is caught here — see the comment on
 * MEDIA_MAX_BYTES_BY_KIND in lib/storage/upload-media.ts).
 */
export function checkMediaFile(file: {
  size: number;
  type: string;
}): MediaFileCheck {
  const kind = kindFromMime(file.type);
  if (!kind) return { ok: false, reason: "unsupported-type" };
  const maxBytes = maxBytesForKind(kind);
  if (file.size > maxBytes) return { ok: false, reason: "too-large", kind, maxBytes };
  return { ok: true, kind };
}

/**
 * Human-readable byte size for cards / dialogs ("840 KB",
 * "2.4 MB"). One decimal under 100 of a unit, rounded integer
 * above (nobody reads "312.4 MB").
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 100 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Escape the LIKE wildcards (% and _) in a user-typed search term
 * so the name filter matches them literally instead of turning
 * "100%" into a match-everything pattern. PostgREST passes .ilike()
 * values as bound parameters, so this is the only escaping needed.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}
