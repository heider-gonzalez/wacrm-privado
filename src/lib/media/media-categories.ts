import { createClient } from "@/lib/supabase/client";
import type { MediaCategory } from "@/types";

/**
 * Media Library virtual folders (phase 5) — categories.
 *
 * No physical folders: a category is a label (`media_assets.category_id`)
 * the account groups its media into. This data layer mirrors the thin
 * RLS-reliant style of media-assets.ts — account scoping is enforced by
 * policies, so only the INSERT needs the account_id supplied explicitly
 * (there is no DB default).
 */

/** Folded counts for the folder sidebar. */
export interface CategoryCountResult {
  /** category_id → count (only ids that actually have assets). */
  byId: Record<string, number>;
  /** Assets with no category. */
  uncategorized: number;
  total: number;
}

export interface MediaCategorySummary {
  categories: MediaCategory[];
  /** category_id → count, keyed to the categories above. */
  counts: Record<string, number>;
  uncategorized: number;
  total: number;
}

/**
 * Fold `media_assets` rows (just their `category_id`) into per-folder
 * counts. Pure — unit-testable without a Supabase client.
 */
export function aggregateCategoryCounts(
  rows: { category_id: string | null }[],
): CategoryCountResult {
  const byId: Record<string, number> = {};
  let uncategorized = 0;
  for (const row of rows) {
    if (row.category_id) {
      byId[row.category_id] = (byId[row.category_id] ?? 0) + 1;
    } else {
      uncategorized += 1;
    }
  }
  return { byId, uncategorized, total: rows.length };
}

/** List the account's folders alphabetically. */
export async function listMediaCategories(): Promise<MediaCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("media_categories")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaCategory[];
}

/**
 * Folders + per-folder counts + uncategorized + total, in one round
 * trip (two parallel queries). Powers the sidebar.
 */
export async function getMediaCategorySummary(): Promise<MediaCategorySummary> {
  const supabase = createClient();
  const [catRes, assetRes] = await Promise.all([
    supabase.from("media_categories").select("*").order("name", { ascending: true }),
    supabase.from("media_assets").select("category_id"),
  ]);
  if (catRes.error) throw new Error(catRes.error.message);
  if (assetRes.error) throw new Error(assetRes.error.message);

  const categories = (catRes.data ?? []) as MediaCategory[];
  const folded = aggregateCategoryCounts(
    (assetRes.data ?? []) as { category_id: string | null }[],
  );

  const counts: Record<string, number> = {};
  for (const c of categories) counts[c.id] = folded.byId[c.id] ?? 0;

  return {
    categories,
    counts,
    uncategorized: folded.uncategorized,
    total: folded.total,
  };
}

/** Create a folder. `account_id` is NOT NULL with no DB default. */
export async function createMediaCategory(
  name: string,
  accountId: string,
): Promise<MediaCategory> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("media_categories")
    .insert({ account_id: accountId, name: name.trim() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MediaCategory;
}

/** Delete a folder. Its assets fall back to uncategorized (SET NULL). */
export async function deleteMediaCategory(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("media_categories")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Move an asset into a folder (or out — pass null to uncategorize).
 * The one mutable, non-media field on media_assets (migration 043).
 */
export async function moveMediaAsset(
  assetId: string,
  categoryId: string | null,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("media_assets")
    .update({ category_id: categoryId })
    .eq("id", assetId);
  if (error) throw new Error(error.message);
}
