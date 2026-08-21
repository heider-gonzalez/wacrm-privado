import { createClient } from "@/lib/supabase/client";

/**
 * Media Library usage lookup (phase 3) — "Utilizado en".
 *
 * Answers "which campaigns and templates reference this asset?"
 * by querying the two link columns added by migrations 041
 * (broadcasts.media_asset_id) and 042 (message_templates.media_
 * asset_id). Both tables are account-scoped by RLS, so these
 * queries only ever return the caller's own rows.
 */

export interface MediaUsageEntry {
  id: string;
  name: string;
}

export interface MediaUsage {
  campaigns: MediaUsageEntry[];
  templates: MediaUsageEntry[];
}

/** Empty usage — the shared "not in use" baseline. */
export function emptyMediaUsage(): MediaUsage {
  return { campaigns: [], templates: [] };
}

/** Total references across both consumers (drives the in-use gate). */
export function mediaUsageCount(usage: MediaUsage): number {
  return usage.campaigns.length + usage.templates.length;
}

/**
 * Fetch every campaign and template referencing one asset. Runs the
 * two lookups in parallel; throws Error(message) so callers can
 * surface it (or fall back to empty) like the rest of the library
 * data layer.
 */
export async function getMediaAssetUsage(
  assetId: string,
): Promise<MediaUsage> {
  const supabase = createClient();

  const [campaignsRes, templatesRes] = await Promise.all([
    supabase.from("broadcasts").select("id, name").eq("media_asset_id", assetId),
    supabase
      .from("message_templates")
      .select("id, name")
      .eq("media_asset_id", assetId),
  ]);

  if (campaignsRes.error) throw new Error(campaignsRes.error.message);
  if (templatesRes.error) throw new Error(templatesRes.error.message);

  return {
    campaigns: (campaignsRes.data ?? []) as MediaUsageEntry[],
    templates: (templatesRes.data ?? []) as MediaUsageEntry[],
  };
}
