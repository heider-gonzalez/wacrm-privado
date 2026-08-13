"use client";

import {
  Eye,
  FileText,
  Folder,
  MoreVertical,
  Play,
  Copy,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes } from "@/lib/media/media-kinds";
import type { MediaAsset, MediaCategory } from "@/types";

interface MediaCardProps {
  asset: MediaAsset;
  /** False for viewers — hides the delete action (read-only role). */
  canWrite: boolean;
  /** Folders for the "Move to folder" submenu + name lookup (phase 5). */
  folders: MediaCategory[];
  onPreview: (asset: MediaAsset) => void;
  onCopyUrl: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => void;
  /** Move the asset into a folder (null = uncategorized). */
  onMove: (asset: MediaAsset, categoryId: string | null) => void;
}

/**
 * One tile of the media library grid: thumbnail (image / first
 * video frame / document icon), original file name, kind badge,
 * size and upload date, plus an actions menu.
 *
 * The whole thumbnail opens the preview dialog; the menu is kept
 * as a separate floating button so the two click targets never
 * compete.
 */
export function MediaCard({
  asset,
  canWrite,
  folders,
  onPreview,
  onCopyUrl,
  onDelete,
  onMove,
}: MediaCardProps) {
  const t = useTranslations("MediaLibrary");

  const folderName = folders.find((f) => f.id === asset.category_id)?.name;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      {/* Thumbnail — opens the preview dialog. */}
      <button
        type="button"
        onClick={() => onPreview(asset)}
        aria-label={t("cardPreview", { name: asset.file_name })}
        className="block w-full cursor-pointer"
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
              {/* preload="metadata" shows the first frame as the
                  thumbnail without downloading the whole file. */}
              <video
                src={asset.public_url}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
                  <Play className="h-4 w-4 text-white" />
                </span>
              </span>
            </>
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
            </span>
          )}
        </div>
      </button>

      {/* Actions menu — floating over the thumbnail so it stays
          visible on bright images. */}
      <div className="absolute top-2 right-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("cardActions", { name: asset.file_name })}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-black/50 text-white opacity-100 transition-opacity hover:bg-black/70 focus:outline-none sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={4}
            className="min-w-44 bg-popover text-popover-foreground ring-border"
          >
            <DropdownMenuItem
              onClick={() => onPreview(asset)}
              className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <Eye className="size-4" />
              {t("actionView")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onCopyUrl(asset)}
              className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <Copy className="size-4" />
              {t("actionCopyUrl")}
            </DropdownMenuItem>
            {canWrite && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-popover-foreground focus:bg-accent focus:text-accent-foreground">
                  <Folder className="size-4" />
                  {t("actionMoveToFolder")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 min-w-44 overflow-y-auto bg-popover text-popover-foreground ring-border">
                  <DropdownMenuItem
                    onClick={() => onMove(asset, null)}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  >
                    {t("folderUncategorized")}
                  </DropdownMenuItem>
                  {folders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onClick={() => onMove(asset, f.id)}
                      className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                    >
                      {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {canWrite && (
              <DropdownMenuItem
                onClick={() => onDelete(asset)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="size-4" />
                {t("actionDelete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Metadata */}
      <div className="p-3">
        <p
          className="truncate text-sm font-medium text-foreground"
          title={asset.file_name}
        >
          {asset.file_name}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant="outline">{t(`kind.${asset.kind}`)}</Badge>
            {folderName && (
              <Badge
                variant="outline"
                className="max-w-[6.5rem] gap-1 truncate"
                title={folderName}
              >
                <Folder className="h-3 w-3 shrink-0" />
                <span className="truncate">{folderName}</span>
              </Badge>
            )}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatBytes(asset.size_bytes)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(asset.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
