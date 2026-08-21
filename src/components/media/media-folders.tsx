"use client";

import { useState } from "react";
import { Folder, FolderOpen, FolderPlus, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createMediaCategory,
  deleteMediaCategory,
  type MediaCategorySummary,
} from "@/lib/media/media-categories";
import { cn } from "@/lib/utils";

/**
 * Sidebar filter state: "all" = every folder, "uncategorized" = files
 * with no folder, any other string = a category id.
 */
export type CategoryFilter = "all" | "uncategorized" | string;

interface MediaFoldersProps {
  summary: MediaCategorySummary | null;
  selected: CategoryFilter;
  onSelect: (value: CategoryFilter) => void;
  /** Agent+ gate — hides create/delete when false. */
  canWrite: boolean;
  /** Called after a create/delete so the page can refresh the summary. */
  onChanged: () => void;
}

/**
 * Virtual folders sidebar (phase 5). Lists "Todos" + the account's
 * categories (with counts) + "Sin categoría". Selecting one filters
 * the grid and, when a concrete folder is selected, new uploads land
 * in it. Category CRUD is inline and gated by `canWrite`.
 */
export function MediaFolders({
  summary,
  selected,
  onSelect,
  canWrite,
  onChanged,
}: MediaFoldersProps) {
  const t = useTranslations("MediaLibrary");
  const { accountId } = useAuth();

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate() {
    if (!newName.trim() || !accountId) return;
    setCreating(true);
    try {
      await createMediaCategory(newName, accountId);
      setNewName("");
      toast.success(t("folderCreated"));
      onChanged();
    } catch (err) {
      toast.error(
        t("folderCreateFailed", {
          message: err instanceof Error ? err.message : "",
        }),
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!folderToDelete) return;
    setDeleting(true);
    try {
      await deleteMediaCategory(folderToDelete.id);
      toast.success(t("folderDeleted"));
      setFolderToDelete(null);
      if (selected === folderToDelete.id) onSelect("all");
      onChanged();
    } catch (err) {
      toast.error(
        t("folderDeleteFailed", {
          message: err instanceof Error ? err.message : "",
        }),
      );
    } finally {
      setDeleting(false);
    }
  }

  const total = summary?.total ?? 0;
  const uncategorized = summary?.uncategorized ?? 0;

  return (
    <div className="space-y-1">
      <FolderRow
        active={selected === "all"}
        count={total}
        icon={<FolderOpen className="h-4 w-4" />}
        label={t("folderAll")}
        onClick={() => onSelect("all")}
      />

      {summary?.categories.map((cat) => (
        <FolderRow
          key={cat.id}
          active={selected === cat.id}
          count={summary.counts[cat.id] ?? 0}
          icon={<Folder className="h-4 w-4" />}
          label={cat.name}
          onClick={() => onSelect(cat.id)}
          trailing={
            canWrite ? (
              <button
                type="button"
                aria-label={t("folderDeleteAria", { name: cat.name })}
                onClick={(e) => {
                  e.stopPropagation();
                  setFolderToDelete({ id: cat.id, name: cat.name });
                }}
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : undefined
          }
        />
      ))}

      <FolderRow
        active={selected === "uncategorized"}
        count={uncategorized}
        icon={<Folder className="h-4 w-4" />}
        label={t("folderUncategorized")}
        onClick={() => onSelect("uncategorized")}
      />

      {canWrite && (
        <div className="pt-2">
          <div className="flex items-center gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              placeholder={t("folderNewPlaceholder")}
              aria-label={t("folderNewPlaceholder")}
              maxLength={60}
              disabled={creating}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={creating || !newName.trim() || !accountId}
              onClick={() => void handleCreate()}
              aria-label={t("folderCreateAria")}
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderPlus className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={folderToDelete !== null} onOpenChange={(o) => !o && setFolderToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("folderDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("folderDeleteDescription", { name: folderToDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFolderToDelete(null)}
              disabled={deleting}
            >
              {t("deleteCancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FolderRow({
  active,
  count,
  icon,
  label,
  onClick,
  trailing,
}: {
  active: boolean;
  count: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-foreground hover:bg-muted",
      )}
    >
      <span className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
      {trailing}
    </button>
  );
}
