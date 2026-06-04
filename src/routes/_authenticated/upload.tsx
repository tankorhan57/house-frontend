import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  UploadCloud,
  FileText,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { apiClient, uploadToPresignedUrl, ApiError } from "@/lib/api";
import { Link } from "@tanstack/react-router";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

const MAX_SIZE = 20 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];
// Use only MIME types — mixing extensions + MIME types causes issues on some
// browsers (notably iOS Safari) where the file picker ignores `multiple`.
const ACCEPT_ATTR = "application/pdf,image/jpeg,image/png";

const SESSION_KEY = "house-upload-done";

type FileStatus = "pending" | "uploading" | "processing" | "done" | "error";

interface FileEntry {
  file: File;
  id: string;
  status: FileStatus;
  progress: number;
  previewUrl?: string;
  error?: string;
}

/** Display-only record for previously completed uploads restored from sessionStorage. */
interface DoneRecord {
  id: string;
  name: string;
  size: number;
  status: "done";
}

function validate(file: File): string | null {
  if (!ACCEPTED.includes(file.type))
    return "Unsupported file type. Please upload a PDF, JPG, or PNG.";
  if (file.size > MAX_SIZE) return "File is larger than 20 MB.";
  return null;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// sessionStorage helpers – survive iOS page suspension
// ---------------------------------------------------------------------------

function loadDoneRecords(): DoneRecord[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DoneRecord[];
  } catch {
    return [];
  }
}

function saveDoneRecord(entry: FileEntry) {
  try {
    const existing = loadDoneRecords();
    // Avoid duplicates
    if (existing.some((r) => r.id === entry.id)) return;
    existing.push({
      id: entry.id,
      name: entry.file.name,
      size: entry.file.size,
      status: "done",
    });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(existing));
  } catch {
    // sessionStorage full or unavailable — silently continue
  }
}

function clearDoneRecords() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function UploadPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  // Authoritative source of truth for entries — always kept in sync.
  // The async queue loop reads from this ref, never from stale closures.
  const entriesRef = useRef<FileEntry[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);

  // Previously completed uploads restored from sessionStorage (display-only).
  const [restoredDone, setRestoredDone] = useState<DoneRecord[]>([]);

  const [dragging, setDragging] = useState(false);
  const processingRef = useRef(false);

  // On mount, restore any completed uploads from a prior picker session
  useEffect(() => {
    const records = loadDoneRecords();
    if (records.length) {
      setRestoredDone(records);
    }
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach(URL.revokeObjectURL);
      urls.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // State helpers — all mutations go through here so ref stays in sync
  // ---------------------------------------------------------------------------

  const syncSetEntries = useCallback(
    (updater: (prev: FileEntry[]) => FileEntry[]) => {
      setEntries((prev) => {
        const next = updater(prev);
        entriesRef.current = next;
        return next;
      });
    },
    [],
  );

  const patchEntry = useCallback(
    (id: string, patch: Partial<FileEntry>) => {
      syncSetEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      );
    },
    [syncSetEntries],
  );

  // ---------------------------------------------------------------------------
  // Sequential upload queue
  // ---------------------------------------------------------------------------

  const startQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Yield a microtask so any pending setState calls flush to the ref
      await Promise.resolve();

      const entry = entriesRef.current.find(
        (e) => e.status === "pending",
      );
      if (!entry) break;

      try {
        patchEntry(entry.id, {
          status: "uploading",
          progress: 0,
          error: undefined,
        });

        const presign = await apiClient.presign({
          fileName: entry.file.name,
          fileType: entry.file.type,
          fileSize: entry.file.size,
        });

        await uploadToPresignedUrl(presign.uploadUrl, entry.file, (pct) =>
          patchEntry(entry.id, { progress: pct }),
        );

        patchEntry(entry.id, { status: "processing", progress: 100 });

        await apiClient.process({
          documentId: presign.documentId,
          key: presign.key,
          fileName: entry.file.name,
        });

        patchEntry(entry.id, { status: "done" });

        // Persist to sessionStorage so iOS page suspension won't lose it
        const doneEntry = entriesRef.current.find((e) => e.id === entry.id);
        if (doneEntry) saveDoneRecord(doneEntry);

        toast.success(`${entry.file.name} -- done.`);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "Upload failed. Please try again.";
        patchEntry(entry.id, { status: "error", error: msg });
        toast.error(`${entry.file.name}: ${msg}`);
      }
    }

    processingRef.current = false;
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
  }, [patchEntry, queryClient]);

  // ---------------------------------------------------------------------------
  // File addition
  // ---------------------------------------------------------------------------

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const toAdd: FileEntry[] = [];
      Array.from(files).forEach((file) => {
        const err = validate(file);
        if (err) {
          toast.error(`${file.name}: ${err}`);
          return;
        }
        // Deduplicate: skip if a file with same name+size is already present
        const isDuplicate = entriesRef.current.some(
          (e) => e.file.name === file.name && e.file.size === file.size,
        );
        if (isDuplicate) {
          toast.info(`${file.name} is already in the list.`);
          return;
        }
        const previewUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        if (previewUrl) previewUrlsRef.current.add(previewUrl);
        toAdd.push({
          file,
          id: crypto.randomUUID(),
          status: "pending",
          progress: 0,
          previewUrl,
        });
      });
      if (!toAdd.length) return;

      syncSetEntries((prev) => [...prev, ...toAdd]);
      toast.success(
        toAdd.length === 1
          ? "1 file added -- uploading..."
          : `${toAdd.length} files added -- uploading...`,
      );
      // Kick the queue (no-op if already running)
      startQueue();
    },
    [startQueue, syncSetEntries],
  );

  // ---------------------------------------------------------------------------
  // Remove & retry
  // ---------------------------------------------------------------------------

  const removeEntry = useCallback(
    (id: string) => {
      syncSetEntries((prev) => {
        const t = prev.find((e) => e.id === id);
        if (t?.previewUrl) {
          URL.revokeObjectURL(t.previewUrl);
          previewUrlsRef.current.delete(t.previewUrl);
        }
        return prev.filter((e) => e.id !== id);
      });
    },
    [syncSetEntries],
  );

  const retryEntry = useCallback(
    (id: string) => {
      patchEntry(id, { status: "pending", error: undefined });
      // Must kick the queue — it may have stopped after the error
      startQueue();
    },
    [patchEntry, startQueue],
  );

  const clearAll = useCallback(() => {
    entries.forEach((e) => {
      if (e.previewUrl) {
        URL.revokeObjectURL(e.previewUrl);
        previewUrlsRef.current.delete(e.previewUrl);
      }
    });
    syncSetEntries(() => []);
    setRestoredDone([]);
    clearDoneRecords();
  }, [entries, syncSetEntries]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const running = entries.some(
    (e) => e.status === "uploading" || e.status === "processing",
  );
  const doneCount =
    entries.filter((e) => e.status === "done").length + restoredDone.length;
  const totalCount = entries.length + restoredDone.length;
  const allDone =
    totalCount > 0 &&
    entries.every((e) => e.status === "done") &&
    restoredDone.every((r) => r.status === "done");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Upload documents
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add lab reports, imaging summaries, or visit notes (PDF, JPG, or PNG
          -- max 20 MB). Files upload automatically as soon as you select them.
        </p>
      </div>

      <Card className="p-6">
        {/* Drop zone — always clickable, even while uploading */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
            dragging && "border-accent bg-accent/5",
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-accent">
            {running ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : (
              <UploadCloud className="h-7 w-7" />
            )}
          </span>
          <p className="text-sm font-medium text-foreground">
            {running
              ? "Uploading... click to queue more files"
              : "Drag & drop files here, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, JPG, or PNG -- max 20 MB -- select multiple at once or click
            again to add more
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              // Reset so re-selecting the same file triggers onChange again
              e.target.value = "";
            }}
          />
        </div>

        {/* File list */}
        {(entries.length > 0 || restoredDone.length > 0) && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium text-foreground">
                {running
                  ? `Uploading... (${doneCount} of ${totalCount} done)`
                  : `${totalCount} ${totalCount === 1 ? "file" : "files"}`}
              </p>
              {!running && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>

            <ul className="space-y-2">
              {/* Restored done records (from sessionStorage / iOS recovery) */}
              {restoredDone.map((record) => (
                <li
                  key={record.id}
                  className="rounded-lg border border-border bg-muted/40 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {record.name}
                        </p>
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(record.size)} -- Done
                      </p>
                    </div>
                  </div>
                </li>
              ))}

              {/* Active entries */}
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-border bg-muted/40 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                      {entry.previewUrl ? (
                        <img
                          src={entry.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {entry.file.name}
                        </p>
                        {entry.status === "done" && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                        )}
                        {entry.status === "error" && (
                          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                        )}
                        {(entry.status === "uploading" ||
                          entry.status === "processing") && (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(entry.file.size)}
                        {entry.status === "pending" && " -- Waiting..."}
                        {entry.status === "uploading" &&
                          ` -- Uploading ${entry.progress}%`}
                        {entry.status === "processing" &&
                          " -- Analyzing with AI..."}
                        {entry.status === "done" && " -- Done"}
                        {entry.status === "error" && (
                          <span className="text-destructive">
                            {" "}
                            -- {entry.error ?? "Failed"}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Remove button for pending files */}
                    {entry.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Remove file"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}

                    {/* Retry button for failed files */}
                    {entry.status === "error" && (
                      <button
                        type="button"
                        onClick={() => retryEntry(entry.id)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Retry
                      </button>
                    )}
                  </div>
                  {entry.status === "uploading" && (
                    <Progress value={entry.progress} className="mt-2 h-1" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {allDone && (
          <div className="mt-4">
            <Button asChild className="w-full">
              <Link to="/">
                <CheckCircle2 className="h-4 w-4" />
                View {doneCount} {doneCount === 1 ? "document" : "documents"}
              </Link>
            </Button>
          </div>
        )}
      </Card>

      <Disclaimer />
    </div>
  );
}
