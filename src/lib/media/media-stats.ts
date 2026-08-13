import { createClient } from "@/lib/supabase/client";
import type { MediaKind } from "./media-kinds";

/**
 * Media Library statistics (phase 4).
 *
 * Aggregates the account's `media_assets` rows into the four facts
 * the stats panel shows: total storage used plus per-kind counts
 * and bytes (image / video / document). The aggregation lives in a
 * pure helper so it can be unit-tested without a Supabase client.
 */

export interface MediaStats {
  /** Sum of every asset's `size_bytes` — "espacio ocupado". */
  totalBytes: number;
  /** Number of assets per kind. */
  counts: Record<MediaKind, number>;
  /** Bytes per kind (drives the stacked storage bar). */
  bytes: Record<MediaKind, number>;
}

export function emptyMediaStats(): MediaStats {
  return {
    totalBytes: 0,
    counts: { image: 0, video: 0, document: 0 },
    bytes: { image: 0, video: 0, document: 0 },
  };
}

/** Minimal row shape the query returns — just the two columns we need. */
export interface MediaStatsRow {
  kind: MediaKind | string;
  size_bytes: number | null;
}

/**
 * Fold a list of `media_assets` rows into a MediaStats. Pure — no I/O.
 * Rows with a null/unknown kind are ignored (the DB CHECK makes them
 * impossible, but the client can't assume a malformed row never slips
 * through a hand-written cast).
 */
export function aggregateMediaStats(rows: MediaStatsRow[]): MediaStats {
  const stats = emptyMediaStats();
  for (const row of rows) {
    const kind = row.kind as MediaKind;
    if (kind !== "image" && kind !== "video" && kind !== "document") {
      continue;
    }
    const size = typeof row.size_bytes === "number" && row.size_bytes >= 0
      ? row.size_bytes
      : 0;
    stats.counts[kind] += 1;
    stats.bytes[kind] += size;
    stats.totalBytes += size;
  }
  return stats;
}

/**
 * Fetch the account's media statistics. Selects only `kind` and
 * `size_bytes` (a thin projection — the library holds hundreds of
 * rows, not millions) and leaves the summation to the pure helper.
 * RLS scopes the query to the caller's account.
 */
export async function getMediaStats(): Promise<MediaStats> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("media_assets")
    .select("kind, size_bytes");
  if (error) throw new Error(error.message);
  return aggregateMediaStats((data ?? []) as MediaStatsRow[]);
}
