"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Copy,
  ExternalLink,
  FileText,
  LayoutTemplate,
  Megaphone,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/lib/media/media-kinds";
import {
  emptyMediaUsage,
  getMediaAssetUsage,
  mediaUsageCount,
  type MediaUsage,
} from "@/lib/media/media-usage";
import type { MediaAsset } from "@/types";

interface MediaPreviewDialogProps {
  /** Null while nothing is selected — the dialog stays closed. */
  asset: MediaAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopyUrl: (asset: MediaAsset) => void;
}

/**
 * Full-size preview + metadata sheet for one library asset.
 * Images render large, videos get native controls, documents
 * (no inline preview in the browser for Office formats) show an
 * icon with an "open in new tab" escape hatch.
 */
export function MediaPreviewDialog({
  asset,
  open,
  onOpenChange,
  onCopyUrl,
}: MediaPreviewDialogProps) {
  const t = useTranslations("MediaLibrary");

  const [usage, setUsage] = useState<MediaUsage | null>(null);

  // Load "Utilizado en" whenever a different asset is previewed.
  useEffect(() => {
    if (!open || !asset) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsage(null);
    getMediaAssetUsage(asset.id)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        // Usage is informational — a failure shouldn't block the
        // preview. Fall back to empty so the panel shows "not in use".
        if (!cancelled) setUsage(emptyMediaUsage());
      });
    return () => {
      cancelled = true;
    };
  }, [open, asset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {asset && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-8" title={asset.file_name}>
                {asset.file_name}
              </DialogTitle>
              <DialogDescription>
                {t("previewSubtitle", { kind: t(`kind.${asset.kind}`) })}
              </DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[55vh] items-center justify-center overflow-hidden rounded-lg bg-muted">
              {asset.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.public_url}
                  alt={asset.file_name}
                  className="max-h-[55vh] w-auto max-w-full object-contain"
                />
              ) : asset.kind === "video" ? (
                <video
                  src={asset.public_url}
                  controls
                  playsInline
                  className="max-h-[55vh] w-auto max-w-full"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 py-12">
                  <FileText className="h-14 w-14 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t("previewNoInline")}
                  </p>
                </div>
              )}
            </div>

            {/* Metadata grid — the four facts the spec asks for
                (name is in the title) plus the MIME type. */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("metaType")}
                </dt>
                <dd className="mt-0.5">
                  <Badge variant="outline">{t(`kind.${asset.kind}`)}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("metaSize")}
                </dt>
                <dd className="mt-0.5 tabular-nums text-foreground">
                  {formatBytes(asset.size_bytes)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("metaDate")}
                </dt>
                <dd className="mt-0.5 text-foreground">
                  {new Date(asset.created_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("metaMime")}
                </dt>
                <dd
                  className="mt-0.5 truncate text-foreground"
                  title={asset.mime_type}
                >
                  {asset.mime_type}
                </dd>
              </div>
            </dl>

            {/* Reuse info (phase 3) — who references this asset. */}
            {usage && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm font-medium text-foreground">
                  {t("usedInTitle")}
                </p>
                {mediaUsageCount(usage) === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("usedInNone")}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {usage.campaigns.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/broadcasts/${c.id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-primary hover:underline"
                        >
                          <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.name}
                        </Link>
                      </li>
                    ))}
                    {usage.templates.map((tpl) => (
                      <li
                        key={tpl.id}
                        className="inline-flex items-center gap-1.5 text-sm text-foreground"
                      >
                        <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground" />
                        {tpl.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onCopyUrl(asset)}>
                <Copy className="h-4 w-4" />
                {t("actionCopyUrl")}
              </Button>
              <Button
                variant="outline"
                render={
                  <a
                    href={asset.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <ExternalLink className="h-4 w-4" />
                {t("actionOpen")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
