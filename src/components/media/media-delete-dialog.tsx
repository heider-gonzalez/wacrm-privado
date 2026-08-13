"use client";

import { useEffect, useState } from "react";
import { LayoutTemplate, Loader2, Megaphone } from "lucide-react";
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
import { deleteMediaAsset } from "@/lib/media/media-assets";
import {
  emptyMediaUsage,
  getMediaAssetUsage,
  mediaUsageCount,
  type MediaUsage,
} from "@/lib/media/media-usage";
import type { MediaAsset } from "@/types";

interface MediaDeleteDialogProps {
  /** Null while nothing is selected — the dialog stays closed. */
  asset: MediaAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful delete so the page can drop the card. */
  onDeleted: (asset: MediaAsset) => void;
}

/**
 * Destructive-action confirmation (Dialog + buttons — the codebase
 * has no AlertDialog; contacts uses this same shape). Removes the
 * media_assets row and then the Storage object (see the ordering
 * rationale in deleteMediaAsset).
 */
export function MediaDeleteDialog({
  asset,
  open,
  onOpenChange,
  onDeleted,
}: MediaDeleteDialogProps) {
  const t = useTranslations("MediaLibrary");
  const [deleting, setDeleting] = useState(false);
  const [usage, setUsage] = useState<MediaUsage | null>(null);

  // Load usage when a delete target is chosen — the in-use warning
  // must show the real consumers before the user confirms.
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
        if (!cancelled) setUsage(emptyMediaUsage());
      });
    return () => {
      cancelled = true;
    };
  }, [open, asset]);

  const inUse = usage !== null && mediaUsageCount(usage) > 0;

  async function handleDelete() {
    if (!asset) return;
    setDeleting(true);
    try {
      await deleteMediaAsset(asset);
      toast.success(t("toastDeleted", { name: asset.file_name }));
      onOpenChange(false);
      onDeleted(asset);
    } catch (err) {
      toast.error(
        t("toastDeleteFailed", {
          name: asset.file_name,
          message: err instanceof Error ? err.message : "",
        }),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {inUse ? t("deleteInUseTitle") : t("deleteTitle")}
          </DialogTitle>
          <DialogDescription>
            {inUse
              ? t("deleteInUseDescription", {
                  name: asset?.file_name ?? "",
                  count: usage ? mediaUsageCount(usage) : 0,
                })
              : t("deleteDescription", { name: asset?.file_name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        {usage && mediaUsageCount(usage) > 0 && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <ul className="space-y-1.5">
              {usage.campaigns.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-1.5 text-sm text-foreground"
                >
                  <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                  {c.name}
                </li>
              ))}
              {usage.templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="flex items-center gap-1.5 text-sm text-foreground"
                >
                  <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground" />
                  {tpl.name}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("deleteInUseWarning")}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            {t("deleteCancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
