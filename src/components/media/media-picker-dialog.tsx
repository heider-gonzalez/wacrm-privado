"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Play, Search, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listMediaAssets, uploadMediaAsset } from "@/lib/media/media-assets";
import {
  checkMediaFile,
  formatBytes,
  MEDIA_LIBRARY_BUCKET,
} from "@/lib/media/media-kinds";
import { getMediaStats, type MediaStats } from "@/lib/media/media-stats";
import type { MediaAsset } from "@/types";

interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kind to filter by — matches the template header type. */
  kind: "image" | "video" | "document";
  /** Currently-selected asset id (for highlight only). */
  selectedId?: string | null;
  /** Called with the picked asset. Closes the dialog. */
  onPick: (asset: MediaAsset) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Modal that lists the account's Media Library filtered to one
 * kind, plus an inline "Upload new file" action. Reuses the
 * Media Library's data layer (`listMediaAssets`,
 * `uploadMediaAsset`) and the same per-file validation + race
 * guard pattern as /media, so behaviour stays consistent.
 *
 * Shared between the broadcast wizard and the template manager:
 * strings live in the `MediaLibrary` namespace so neither consumer
 * leaks its own copy. The picker is a controlled dialog — the
 * parent owns the open state and the picked asset. We intentionally
 * DON'T permit delete here (the picker is for choosing; cleanup
 * happens on the library page itself).
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  kind,
  selectedId,
  onPick,
}: MediaPickerDialogProps) {
  const t = useTranslations("MediaLibrary");

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchSeq = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [search]);

  // Reset search when reopening so each pick session is fresh.
  // MUST run before the fetch effect: it bumps fetchSeq so the
  // fetch effect's own ++fetchSeq.current wins over any in-flight
  // fetch from a previous opening. (Effects run top-to-bottom in
  // declaration order on mount/update.)
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch("");
    setDebouncedSearch("");
    setShowAll(false);
    ++fetchSeq.current;
  }, [open]);

  // Load per-kind counts so the empty state can tell an actually-empty
  // library apart from "has files, just none of this kind".
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMediaStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        // Stats are informational — "upload your first file" is an
        // acceptable fallback when we can't count.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch filtered assets while the dialog is open. The race guard
  // (monotonic fetchSeq) prevents a slow prior fetch from
  // overwriting a fresher one — same pattern as /media.
  useEffect(() => {
    if (!open) return;
    async function fetchAssets() {
      const seq = ++fetchSeq.current;
      setLoading(true);
      setError(null);
      try {
        const rows = await listMediaAssets({
          kind: showAll ? undefined : kind,
          search: debouncedSearch,
        });
        if (seq !== fetchSeq.current) return;
        setAssets(rows);
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        setError(err instanceof Error ? err.message : t("errorLoad"));
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    }
    void fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, debouncedSearch, showAll]);

  async function handleUploadFiles(files: File[]) {
    setUploading(true);
    let picked: MediaAsset | null = null;
    let uploaded = 0;
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
        const asset = await uploadMediaAsset(file);
        uploaded += 1;
        // First successful upload becomes the default pick so the
        // single-file common case is one click → done.
        if (!picked) picked = asset;
      } catch (err) {
        toast.error(
          t("toastUploadFailed", {
            name: file.name,
            message: err instanceof Error ? err.message : "",
          }),
        );
      }
    }
    if (uploaded > 0) {
      toast.success(t("toastUploaded", { count: uploaded }));
    }
    setUploading(false);
    if (picked) {
      onPick(picked);
    }
  }

  const accept = (() => {
    // Local import keeps the const consumer side in one place; we
    // can't import from media-kinds top-level because the MIME
    // map is keyed by kind and MEDIA_LIBRARY_ACCEPT is all-kinds.
    // Inline is fine — same source as the media-library bucket.
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
      default:
        return undefined;
    }
  })();

  const totalCount = stats
    ? stats.counts.image + stats.counts.video + stats.counts.document
    : 0;

  // How many assets live in the OTHER kinds — drives the "Show all"
  // toggle and the "no files of this kind" empty state.
  const otherKindCount = stats
    ? kind === "image"
      ? stats.counts.video + stats.counts.document
      : kind === "video"
        ? stats.counts.image + stats.counts.document
        : stats.counts.image + stats.counts.video
    : 0;

  const showAllToggle = otherKindCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("pickerTitle")}</DialogTitle>
          <DialogDescription>
            {t("pickerSubtitle", { kind: t(`kind.${kind}`) })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="border-border bg-muted pl-8 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <Button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? t("uploading") : t("pickerUploadNew")}
          </Button>
          {showAllToggle && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAll((v) => !v)}
              className="border-border"
            >
              {showAll
                ? t("pickerShowKind", { kind: t(`kind.${kind}`) })
                : t("pickerShowAll")}
            </Button>
          )}
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

        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bucket: {MEDIA_LIBRARY_BUCKET}
              </p>
            </div>
          ) : assets.length === 0 ? (
            <div className="py-12 text-center">
              {debouncedSearch ? (
                <p className="text-sm text-muted-foreground">
                  {t("noResultsHint")}
                </p>
              ) : stats !== null && totalCount > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t("pickerEmptyKind", { kind: t(`kind.${kind}`) })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("pickerOtherKinds", {
                      images: stats.counts.image,
                      videos: stats.counts.video,
                      documents: stats.counts.document,
                    })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("uploadFirst")}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3">
              {assets.map((asset) => {
                const isSelected = selectedId === asset.id;
                const mismatched = showAll && asset.kind !== kind;
                const mismatchHint = mismatched
                  ? t("pickerMismatchHint", {
                      kind: t(`kind.${asset.kind}`),
                      required: t(`kind.${kind}`),
                    })
                  : undefined;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    disabled={mismatched}
                    onClick={() => onPick(asset)}
                    title={mismatchHint}
                    className={`group relative overflow-hidden rounded-lg border bg-card text-left transition-colors ${
                      mismatched
                        ? "cursor-not-allowed opacity-40"
                        : "hover:border-primary/50"
                    } ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border"
                    }`}
                    aria-label={
                      mismatchHint ?? t("cardPreview", { name: asset.file_name })
                    }
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      {asset.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.public_url}
                          alt={asset.file_name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : asset.kind === "video" ? (
                        <>
                          <video
                            src={asset.public_url}
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60">
                              <Play className="h-3.5 w-3.5 text-white" />
                            </span>
                          </span>
                        </>
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <FileText className="h-9 w-9 text-muted-foreground" />
                        </span>
                      )}
                    </div>
                    <div className="p-2">
                      <p
                        className="truncate text-xs font-medium text-foreground"
                        title={asset.file_name}
                      >
                        {asset.file_name}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {formatBytes(asset.size_bytes)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("deleteCancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
