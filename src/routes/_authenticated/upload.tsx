import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileText, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
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
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

type FileStatus = "pending" | "uploading" | "processing" | "done" | "error";

interface FileEntry {
  file: File;
  id: string;
  status: FileStatus;
  progress: number;
  previewUrl?: string;
  error?: string;
}

function validate(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return "Unsupported file type. Please upload a PDF, JPG, or PNG.";
  if (file.size > MAX_SIZE) return "File is larger than 20MB.";
  return null;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const entriesRef = useRef<FileEntry[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const processingRef = useRef(false);

  // Keep ref in sync so the async queue loop can always read fresh state
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach(URL.revokeObjectURL);
      urls.clear();
    };
  }, []);

  const patchEntry = useCallback((id: string, patch: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  // Self-sustaining sequential upload loop.
  // Starts when files are added; keeps going until the queue is empty.
  const startQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    for (;;) {
      // One tick so any pending setEntries calls have flushed to the ref
      await Promise.resolve();
      const entry = entriesRef.current.find((e) => e.status === "pending" || e.status === "error");
      if (!entry) break;

      try {
        patchEntry(entry.id, { status: "uploading", progress: 0, error: undefined });

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
        toast.success(`${entry.file.name} — done.`);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Upload failed. Please try again.";
        patchEntry(entry.id, { status: "error", error: msg });
        toast.error(`${entry.file.name}: ${msg}`);
      }
    }

    processingRef.current = false;
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
  }, [patchEntry, queryClient]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const toAdd: FileEntry[] = [];
      Array.from(files).forEach((file) => {
        const err = validate(file);
        if (err) {
          toast.error(`${file.name}: ${err}`);
          return;
        }
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        if (previewUrl) previewUrlsRef.current.add(previewUrl);
        toAdd.push({ file, id: crypto.randomUUID(), status: "pending", progress: 0, previewUrl });
      });
      if (!toAdd.length) return;

      // Update ref immediately so the queue loop sees the new files right away
      entriesRef.current = [...entriesRef.current, ...toAdd];
      setEntries((prev) => [...prev, ...toAdd]);
      toast.success(toAdd.length === 1 ? "1 file added — uploading…" : `${toAdd.length} files added — uploading…`);
      startQueue();
    },
    [startQueue],
  );

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const t = prev.find((e) => e.id === id);
      if (t?.previewUrl) {
        URL.revokeObjectURL(t.previewUrl);
        previewUrlsRef.current.delete(t.previewUrl);
      }
      const next = prev.filter((e) => e.id !== id);
      entriesRef.current = next;
      return next;
    });
  }, []);

  const running = entries.some((e) => e.status === "uploading" || e.status === "processing");
  const doneCount = entries.filter((e) => e.status === "done").length;
  const allDone = entries.length > 0 && entries.every((e) => e.status === "done");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Upload documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add lab reports, imaging summaries, or visit notes (PDF, JPG, or PNG · max 20MB).
          Files upload automatically as soon as you select them.
        </p>
      </div>

      <Card className="p-6">
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
            {running ? "Uploading… click to queue more files" : "Drag & drop files here, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, JPG, or PNG · max 20MB · select multiple at once or click again to add more
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {entries.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium text-foreground">
                {running
                  ? `Uploading… (${doneCount} of ${entries.length} done)`
                  : `${entries.length} ${entries.length === 1 ? "file" : "files"}`}
              </p>
              {!running && (
                <button
                  type="button"
                  onClick={() => {
                    entries.forEach((e) => {
                      if (e.previewUrl) {
                        URL.revokeObjectURL(e.previewUrl);
                        previewUrlsRef.current.delete(e.previewUrl);
                      }
                    });
                    entriesRef.current = [];
                    setEntries([]);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>

            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                      {entry.previewUrl ? (
                        <img src={entry.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{entry.file.name}</p>
                        {entry.status === "done" && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                        )}
                        {entry.status === "error" && (
                          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                        )}
                        {(entry.status === "uploading" || entry.status === "processing") && (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(entry.file.size)}
                        {entry.status === "pending" && " · Waiting…"}
                        {entry.status === "uploading" && ` · Uploading ${entry.progress}%`}
                        {entry.status === "processing" && " · Analyzing with AI…"}
                        {entry.status === "done" && " · Done"}
                        {entry.status === "error" && (
                          <span className="text-destructive"> · {entry.error ?? "Failed"}</span>
                        )}
                      </p>
                    </div>
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
                    {entry.status === "error" && (
                      <button
                        type="button"
                        onClick={() => patchEntry(entry.id, { status: "pending", error: undefined })}
                        className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
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
