"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Play, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  checkMediaFile,
  formatBytes,
} from "@/lib/media/media-kinds";
import { uploadMediaAsset } from "@/lib/media/media-assets";
import type { MediaAsset } from "@/types";

import { MediaPickerDialog } from "@/components/media/media-picker-dialog";

interface MediaPickerProps {
  /** Header type of the chosen WhatsApp template. Drives the
   *  accepted MIME list and the inline thumbnail style. */
  headerType: "image" | "video" | "document";
  /** Currently selected library asset. null = nothing picked yet. */
  selected: MediaAsset | null;
  onSelect: (asset: MediaAsset | null) => void;
  /** True when the template carries its own `header_media_url`
   *  the wizard may fall back to. Drives the hint copy at the
   *  bottom of the empty state. */
  hasTemplateDefault: boolean;
}

/**
 * Broadcast wizard media picker — phase 2 replacement for the
 * hand-pasted `<Input type="url">`.
 *
 * Three states:
 *
 *   1. selected !== null → preview card + "Change" / "Remove".
 *   2. selected === null  → "Choose from library" + "Upload new
 *      file". Below: a hint if the template default applies.
 *
 * The "Choose" button opens `<MediaPickerDialog>` (filtered
 * grid). The "Upload new" button uses a hidden `<input>`
 * validated with `checkMediaFile` and uploaded with
 * `uploadMediaAsset`, then sets the new asset as selected — same
 * pattern as `MediaUploadButton` but converging on the picker's
 * `onSelect` instead of a generic onUploaded callback.
 *
 * No role gating here: the wizard is already reachable only by
 * users with `canSendMessages` (GatedButton on the broadcast
 * list page), so the picker inherits the upstream gate. Adding
 * GatedButton again would just double the tooltip noise.
 */
export function MediaPicker({
  headerType,
  selected,
  onSelect,
  hasTemplateDefault,
}: MediaPickerProps) {
  const tWiz = useTranslations("Broadcasts.wizard.personalize");
  const tLib = useTranslations("MediaLibrary");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUploadFiles(files: File[]) {
    setUploading(true);
    let picked: MediaAsset | null = null;
    let uploaded = 0;
    for (const file of files) {
      const check = checkMediaFile(file);
      if (!check.ok) {
        if (check.reason === "unsupported-type") {
          toast.error(tLib("toastUnsupportedType", { name: file.name }));
        } else {
          toast.error(
            tLib("toastTooLarge", {
              name: file.name,
              limit: formatBytes(check.maxBytes ?? 0),
            }),
          );
        }
        continue;
      }
      try {
        const asset = await uploadMediaAsset(file);
        uploaded += 1;
        if (!picked) picked = asset;
      } catch (err) {
        toast.error(
          tLib("toastUploadFailed", {
            name: file.name,
            message: err instanceof Error ? err.message : "",
          }),
        );
      }
    }
    if (uploaded > 0) {
      toast.success(tLib("toastUploaded", { count: uploaded }));
    }
    setUploading(false);
    if (picked) {
      // Auto-select the first successful upload so the user can
      // immediately move on without re-opening the picker.
      onSelect(picked);
    }
  }

  const accept = acceptForKind(headerType);

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary">
          {headerType}
        </span>
        <p className="text-sm font-medium text-foreground">
          {tWiz("mediaHeader")}
        </p>
      </div>

      {selected ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:h-16 sm:w-16">
            {selected.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.public_url}
                alt={selected.file_name}
                className="h-full w-full object-cover"
              />
            ) : selected.kind === "video" ? (
              <>
                <video
                  src={selected.public_url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <span className="relative -mt-16 flex h-16 w-full items-center justify-center">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60">
                    <Play className="h-3 w-3 text-white" />
                  </span>
                </span>
              </>
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <FileText className="h-7 w-7 text-muted-foreground" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-medium text-foreground"
              title={selected.file_name}
            >
              {selected.file_name}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {formatBytes(selected.size_bytes)} ·{" "}
              {new Date(selected.created_at).toLocaleDateString()}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPickerOpen(true)}
              >
                {tWiz("change")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onSelect(null)}
              >
                <X className="h-3.5 w-3.5" />
                {tWiz("remove")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(true)}
            >
              {tWiz("chooseFromLibrary")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? tLib("uploading") : tWiz("uploadNew")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length > 0) void handleUploadFiles(files);
              }}
            />
          </div>
          {hasTemplateDefault && (
            <p className="text-xs text-muted-foreground">
              {tWiz("templateDefaultHint")}
            </p>
          )}
        </div>
      )}

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind={headerType}
        selectedId={selected?.id ?? null}
        onPick={(asset) => {
          onSelect(asset);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

/**
 * Build the file-input `accept` attribute for one kind, mirroring
 * the media-library bucket's MIME allowlist (migration 040).
 * Keeping it inline avoids importing MEDIA_LIBRARY_ACCEPT which
 * would include audio (rejected by template headers, but the
 * wizard's file picker shouldn't offer it either).
 */
function acceptForKind(kind: "image" | "video" | "document"): string {
  switch (kind) {
    case "image":
      return "image/png,image/jpeg,image/webp";
    case "video":
      return "video/mp4,video/3gpp";
    case "document":
      return [
        "application/pdf",
        "application/vnd.ms-powerpoint",
        "application/msword",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
      ].join(",");
  }
}