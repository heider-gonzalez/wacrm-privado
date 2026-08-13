import { createClient } from "@/lib/supabase/client";
import {
  deleteAccountMedia,
  uploadAccountMedia,
} from "@/lib/storage/upload-media";
import type { MediaAsset } from "@/types";
import {
  escapeLikeTerm,
  kindFromMime,
  MEDIA_LIBRARY_BUCKET,
  type MediaKind,
} from "./media-kinds";

/**
 * Media Library data layer (browser). All queries run through the
 * singleton Supabase client with the caller's JWT — account scoping
 * and the agent+ write gate are enforced by RLS (migration 040),
 * so these functions stay thin and throw Error(message) for the
 * UI to surface via toast.
 */

export interface ListMediaAssetsOptions {
  /** Free-text filter on the ORIGINAL file name (case-insensitive). */
  search?: string;
  /** Kind filter; "all" / undefined = every kind. */
  kind?: MediaKind | "all";
}

/**
 * List the caller's account media, newest first. RLS scopes the
 * query to the account, so no explicit account filter is needed
 * (and adding one would just repeat the JWT claim).
 */
export async function listMediaAssets(
  { search, kind }: ListMediaAssetsOptions = {},
): Promise<MediaAsset[]> {
  const supabase = createClient();

  let query = supabase
    .from("media_assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (kind && kind !== "all") {
    query = query.eq("kind", kind);
  }

  const term = search?.trim();
  if (term) {
    query = query.ilike("file_name", `%${escapeLikeTerm(term)}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAsset[];
}

/**
 * Upload one file to the library bucket and index it with a
 * media_assets row.
 *
 * Validation is the caller's responsibility (`checkMediaFile` in
 * media-kinds.ts runs in the picker); the kind guard here is
 * defence-in-depth for direct callers.
 *
 * If the metadata insert fails after the object landed in Storage
 * (RLS denial, network cut), the object is rolled back — an
 * unindexed object would be an invisible orphan the library can
 * never list or delete.
 */
export async function uploadMediaAsset(file: File): Promise<MediaAsset> {
  const kind = kindFromMime(file.type);
  if (!kind) {
    throw new Error(`Unsupported file type: ${file.type || file.name}`);
  }

  const supabase = createClient();
  const uploaded = await uploadAccountMedia(MEDIA_LIBRARY_BUCKET, file);

  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      account_id: uploaded.accountId,
      bucket: MEDIA_LIBRARY_BUCKET,
      path: uploaded.path,
      file_name: file.name,
      mime_type: file.type,
      kind,
      size_bytes: file.size,
      public_url: uploaded.publicUrl,
      uploaded_by: uploaded.userId,
    })
    .select()
    .single();

  if (error) {
    await deleteAccountMedia(MEDIA_LIBRARY_BUCKET, uploaded.path).catch(
      () => {},
    );
    throw new Error(error.message);
  }

  return data as MediaAsset;
}

/**
 * Delete a library asset: metadata row first, Storage object
 * second.
 *
 * Row-first ordering keeps the two stores consistent on failure:
 * if the row delete fails (RLS, network), the object stays AND the
 * library entry stays — nothing visibly breaks. Deleting the
 * object first could instead leave a card pointing at a 404. The
 * object GC is best-effort (same contract as the other
 * deleteAccountMedia callers): a missed delete is a storage nit,
 * not something to surface to the user.
 */
export async function deleteMediaAsset(asset: MediaAsset): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("media_assets")
    .delete()
    .eq("id", asset.id);
  if (error) throw new Error(error.message);

  await deleteAccountMedia(asset.bucket, asset.path).catch(() => {});
}
