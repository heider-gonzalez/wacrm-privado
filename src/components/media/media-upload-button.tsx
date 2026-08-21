"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { GatedButton } from "@/components/ui/gated-button";
import { uploadMediaAsset } from "@/lib/media/media-assets";
import {
  checkMediaFile,
  formatBytes,
  MEDIA_LIBRARY_ACCEPT,
} from "@/lib/media/media-kinds";
import type { MediaAsset } from "@/types";

interface MediaUploadButtonProps {
  /** False for viewers — button renders disabled with the
   *  "Read-only" tooltip (GatedButton pattern). */
  canAct: boolean;
  /** Called once per successfully uploaded asset (prepend to grid). */
  onUploaded: (asset: MediaAsset) => void;
  /** Virtual folder to place uploads into (phase 5). Null = uncategorized. */
  categoryId?: string | null;
}

/**
 * Upload CTA for the media library: hidden <input type=file> +
 * GatedButton, following the same pattern as the flows node form
 * and the inbox composer (no drag-drop component exists in the
 * codebase — pickers everywhere else are hidden inputs too).
 *
 * Every picked file is validated with `checkMediaFile` BEFORE any
 * network traffic: unsupported types and files over the per-kind
 * Meta cap are rejected with a toast instead of landing in the
 * bucket as orphans. Files upload sequentially so a big batch
 * doesn't saturate the connection and failures are attributable
 * per file.
 */
export function MediaUploadButton({
  canAct,
  onUploaded,
  categoryId,
}: MediaUploadButtonProps) {
  const t = useTranslations("MediaLibrary");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: File[]) {
    setUploading(true);
    let uploadedCount = 0;

    for (const file of files) {
      const check = checkMediaFile(file);
      if (!check.ok) {
        if (check.reason === "unsupported-type") {
          toast.error(t("toastUnsupportedType", { name: file.name }));
        } else {
          toast.error(
            t("toastTooLarge", {
              name: file.name,
              limit: formatBytes(check.maxBytes ?? 0),
            }),
          );
        }
        continue;
      }

      try {
        const asset = await uploadMediaAsset(file, categoryId ?? null);
        uploadedCount += 1;
        onUploaded(asset);
      } catch (err) {
        toast.error(
          t("toastUploadFailed", {
            name: file.name,
            message: err instanceof Error ? err.message : "",
          }),
        );
      }
    }

    if (uploadedCount > 0) {
      toast.success(t("toastUploaded", { count: uploadedCount }));
    }
    setUploading(false);
  }

  return (
    <>
      <GatedButton
        canAct={canAct}
        gateReason="upload media"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {uploading ? t("uploading") : t("upload")}
      </GatedButton>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={MEDIA_LIBRARY_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Reset so picking the same file twice still fires change.
          e.target.value = "";
          if (files.length > 0) void handleFiles(files);
        }}
      />
    </>
  );
}
