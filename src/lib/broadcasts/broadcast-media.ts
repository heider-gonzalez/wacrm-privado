import type { MediaAsset, MessageTemplate } from "@/types";

/**
 * Header media kinds WhatsApp template headers actually support.
 * Audio is intentionally excluded — WhatsApp template headers
 * don't accept it (and the Media Library bucket rejects it, so
 * no asset can have that kind anyway).
 */
export const MEDIA_HEADER_KINDS = ["image", "video", "document"] as const;
export type MediaHeaderKind = (typeof MEDIA_HEADER_KINDS)[number];

/**
 * Template header_type values that count as "media" for the
 * wizard. Anything else (TEXT, undefined, malformed) returns
 * null and the picker block is hidden — same gate the previous
 * URL input used.
 */
export function headerKindFromTemplate(
  template: Pick<MessageTemplate, "header_type">,
): MediaHeaderKind | null {
  const t = template.header_type;
  return MEDIA_HEADER_KINDS.includes(t as MediaHeaderKind)
    ? (t as MediaHeaderKind)
    : null;
}

export interface ResolvedHeaderMedia {
  /** Public URL plumbed to Meta. Empty string when nothing chosen
   *  and no template default. The wizard's "Next" gate uses this. */
  url: string;
  /** media_assets.id when the user picked one, else null. */
  assetId: string | null;
  /** True when the URL comes from the template default rather
   *  than a library asset. Used by the picker to show the note. */
  fromTemplateDefault: boolean;
}

/**
 * Pick the URL Meta will receive at send time.
 *
 * - Library asset wins (the whole point of phase 2: the user
 *   chooses a managed file instead of pasting a URL).
 * - Fall back to the template's stored `header_media_url` when
 *   the user didn't pick one. The builder's existing fallback
 *   (template-send-builder.ts) keeps the server-side fallback
 *   too, so this is purely for wizard validation + persistence
 *   — but we mirror the priority here so the wizard's
 *   validation matches what the server will actually send.
 * - `""` only when neither side has a value: the wizard blocks
 *   "Next" so the campaign can't ship empty.
 */
export function resolveHeaderMedia({
  selectedAsset,
  templateDefaultUrl,
}: {
  selectedAsset: MediaAsset | null;
  templateDefaultUrl?: string | null;
}): ResolvedHeaderMedia {
  if (selectedAsset) {
    return {
      url: selectedAsset.public_url,
      assetId: selectedAsset.id,
      fromTemplateDefault: false,
    };
  }
  const fallback = (templateDefaultUrl ?? "").trim();
  return {
    url: fallback,
    assetId: null,
    fromTemplateDefault: fallback.length > 0,
  };
}