"use client";

import { FileText, HardDrive, Image as ImageIcon, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatBytes } from "@/lib/media/media-kinds";
import type { MediaKind } from "@/lib/media/media-kinds";
import type { MediaStats } from "@/lib/media/media-stats";

/** Accent colour per kind — used for both the stacked bar and the legend. */
const KIND_COLORS: Record<MediaKind, string> = {
  image: "bg-primary",
  video: "bg-blue-500",
  document: "bg-amber-500",
};

const KINDS: MediaKind[] = ["image", "video", "document"];

/**
 * Media Library stats panel (phase 4): four fact cards (storage used
 * + per-kind counts) and a stacked bar showing how the used space
 * breaks down by type. Pure presentational — receives an already
 * aggregated `MediaStats` from the page.
 */
export function MediaStats({ stats }: { stats: MediaStats }) {
  const t = useTranslations("MediaLibrary");
  const { totalBytes, counts, bytes } = stats;

  const cards: { label: string; value: string; icon: React.ReactNode }[] = [
    {
      label: t("statsUsed"),
      value: formatBytes(totalBytes),
      icon: <HardDrive className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: t("statsImages"),
      value: String(counts.image),
      icon: <ImageIcon className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: t("statsVideos"),
      value: String(counts.video),
      icon: <Video className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: t("statsDocuments"),
      value: String(counts.document),
      icon: <FileText className="h-4 w-4 text-muted-foreground" />,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card p-3"
          >
            <div className="flex items-center gap-1.5">
              {card.icon}
              <span className="text-xs text-muted-foreground">
                {card.label}
              </span>
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Stacked storage bar + legend. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={t("statsBarAria", { used: formatBytes(totalBytes) })}
        >
          {totalBytes > 0 &&
            KINDS.map((kind) =>
              bytes[kind] > 0 ? (
                <div
                  key={kind}
                  className={KIND_COLORS[kind]}
                  style={{ width: `${(bytes[kind] / totalBytes) * 100}%` }}
                />
              ) : null,
            )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {KINDS.map((kind) => (
            <div
              key={kind}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${KIND_COLORS[kind]}`}
              />
              {t(`kind.${kind}`)} · {counts[kind]} · {formatBytes(bytes[kind])}
            </div>
          ))}
        </div>
        {totalBytes === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("statsEmpty")}
          </p>
        )}
      </div>
    </div>
  );
}
