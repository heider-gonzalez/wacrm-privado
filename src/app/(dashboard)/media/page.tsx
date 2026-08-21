"use client";

import { useEffect, useRef, useState } from "react";
import { Images, Search, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { MediaCard } from "@/components/media/media-card";
import { MediaDeleteDialog } from "@/components/media/media-delete-dialog";
import {
  MediaFolders,
  type CategoryFilter,
} from "@/components/media/media-folders";
import { MediaPreviewDialog } from "@/components/media/media-preview-dialog";
import { MediaStats } from "@/components/media/media-stats";
import { MediaUploadButton } from "@/components/media/media-upload-button";
import { Skeleton } from "@/components/dashboard/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/hooks/use-can";
import { listMediaAssets } from "@/lib/media/media-assets";
import {
  getMediaCategorySummary,
  moveMediaAsset,
  type MediaCategorySummary,
} from "@/lib/media/media-categories";
import { getMediaStats, type MediaStats as MediaStatsData } from "@/lib/media/media-stats";
import type { MediaKind } from "@/lib/media/media-kinds";
import type { MediaAsset } from "@/types";

/** Debounce for the search box — one round-trip per pause, not per keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

type KindFilter = MediaKind | "all";

export default function MediaLibraryPage() {
  const t = useTranslations("MediaLibrary");
  const canWrite = useCan("send-messages");

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [stats, setStats] = useState<MediaStatsData | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [summary, setSummary] = useState<MediaCategorySummary | null>(null);

  // Monotonic fetch id — a slow response for a stale search/filter
  // must never overwrite a newer one (same guard as contacts).
  const fetchSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [search]);

  async function refreshStats() {
    try {
      setStats(await getMediaStats());
    } catch {
      // Stats are informational — keep whatever we last had.
    }
  }

  async function refreshSummary() {
    try {
      setSummary(await getMediaCategorySummary());
    } catch {
      // Folders are informational — keep whatever we last had.
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStats();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSummary();
  }, []);

  useEffect(() => {
    async function fetchAssets() {
      const seq = ++fetchSeq.current;
      try {
        const rows = await listMediaAssets({
          search: debouncedSearch,
          kind: kindFilter,
          categoryId:
            categoryFilter === "all"
              ? undefined
              : categoryFilter === "uncategorized"
                ? null
                : categoryFilter,
        });
        if (seq !== fetchSeq.current) return; // superseded by a newer fetch
        setAssets(rows);
        setError(null);
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        setError(err instanceof Error ? err.message : t("errorLoad"));
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    }
    void fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, kindFilter, categoryFilter]);

  function handleUploaded(asset: MediaAsset) {
    // The new asset may not match the active search/kind/category
    // filter — prepending unconditionally would show a card the
    // current filter should hide, so only prepend when it belongs.
    const matchesKind = kindFilter === "all" || asset.kind === kindFilter;
    const matchesCategory =
      categoryFilter === "all" ||
      (categoryFilter === "uncategorized"
        ? !asset.category_id
        : asset.category_id === categoryFilter);
    const matchesSearch =
      !debouncedSearch.trim() ||
      asset.file_name
        .toLowerCase()
        .includes(debouncedSearch.trim().toLowerCase());
    if (matchesKind && matchesCategory && matchesSearch) {
      setAssets((prev) => [asset, ...prev]);
    }
    void refreshStats();
    void refreshSummary();
  }

  function handleDeleted(asset: MediaAsset) {
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    void refreshStats();
    void refreshSummary();
  }

  function handleDeleteFromPreview(asset: MediaAsset) {
    setPreviewAsset(null);
    setDeleteTarget(asset);
  }

  function handleMoved() {
    void refreshSummary();
  }

  async function handleMove(asset: MediaAsset, categoryId: string | null) {
    try {
      await moveMediaAsset(asset.id, categoryId);
      // Keep the grid in sync: update in place when the asset still
      // matches the active category filter, drop it otherwise.
      const matchesCategory =
        categoryFilter === "all" ||
        (categoryFilter === "uncategorized"
          ? !categoryId
          : categoryId === categoryFilter);
      setAssets((prev) =>
        matchesCategory
          ? prev.map((a) =>
              a.id === asset.id ? { ...a, category_id: categoryId } : a,
            )
          : prev.filter((a) => a.id !== asset.id),
      );
      void refreshSummary();
    } catch (err) {
      toast.error(
        t("folderMoveFailed", {
          message: err instanceof Error ? err.message : "",
        }),
      );
    }
  }

  async function handleCopyUrl(asset: MediaAsset) {
    try {
      await navigator.clipboard.writeText(asset.public_url);
      toast.success(t("toastUrlCopied"));
    } catch {
      // Clipboard API blocked (permissions / non-secure context) —
      // fall back to showing the URL so the user can copy by hand.
      toast.info(asset.public_url, { duration: 10000 });
    }
  }

  const filtersActive =
    debouncedSearch.trim().length > 0 ||
    kindFilter !== "all" ||
    categoryFilter !== "all";

  // Uploads land in the selected folder when a concrete folder is
  // active; otherwise they stay uncategorized.
  const uploadCategoryId =
    categoryFilter !== "all" && categoryFilter !== "uncategorized"
      ? categoryFilter
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <MediaUploadButton
          canAct={canWrite}
          onUploaded={handleUploaded}
          categoryId={uploadCategoryId}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Folders sidebar (phase 5) — virtual categories. */}
        <aside className="w-full shrink-0 lg:w-56">
          <div className="rounded-xl border border-border bg-card p-3">
            <MediaFolders
              summary={summary}
              selected={categoryFilter}
              onSelect={setCategoryFilter}
              canWrite={canWrite}
              onChanged={handleMoved}
            />
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          {/* Stats (phase 4) — storage used + per-kind counts. */}
          {stats && <MediaStats stats={stats} />}

          {/* Toolbar: name search + kind filter. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="pl-9"
              />
            </div>
            <Select
              value={kindFilter}
              onValueChange={(v) => setKindFilter(v as KindFilter)}
            >
              <SelectTrigger
                className="w-full sm:w-44"
                aria-label={t("filterLabel")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterAll")}</SelectItem>
                <SelectItem value="image">{t("kind.image")}</SelectItem>
                <SelectItem value="video">{t("kind.video")}</SelectItem>
                <SelectItem value="document">{t("kind.document")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            // Skeleton grid mirrors the final layout so first paint
            // doesn't jump once cards land.
            <div
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              aria-label={t("loading")}
            >
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <Skeleton className="aspect-square w-full rounded-none" />
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2">
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                {t("retry")}
              </Button>
            </div>
          ) : assets.length === 0 ? (
            filtersActive ? (
              // Filtered empty state — distinct from the fresh-account
              // one so the user knows the library isn't really empty.
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-card">
                <SearchX className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {t("noResults")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("noResultsHint")}
                </p>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-card">
                <Images className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {t("noFilesYet")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("uploadFirst")}
                </p>
                <div className="mt-4">
                  <MediaUploadButton
                    canAct={canWrite}
                    onUploaded={handleUploaded}
                    categoryId={uploadCategoryId}
                  />
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {assets.map((asset) => (
                <MediaCard
                  key={asset.id}
                  asset={asset}
                  canWrite={canWrite}
                  folders={summary?.categories ?? []}
                  onPreview={setPreviewAsset}
                  onCopyUrl={(a) => void handleCopyUrl(a)}
                  onDelete={setDeleteTarget}
                  onMove={(a, id) => void handleMove(a, id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <MediaPreviewDialog
        asset={previewAsset}
        open={previewAsset !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewAsset(null);
        }}
        onCopyUrl={(a) => void handleCopyUrl(a)}
        onDelete={handleDeleteFromPreview}
        canDelete={canWrite}
        folders={summary?.categories ?? []}
      />
      <MediaDeleteDialog
        asset={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
