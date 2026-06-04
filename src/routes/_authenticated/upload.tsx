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

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

type FileStatus = "pending" | "uploading" | "processing" | "done" | "error";

interface FileEntry {
  file: File;
  id: string;
  uploadName: string;
  status: FileStatus;
  progress: number;
  previewUrl?: string;
  documentId?: string;
  storageKey?: string;
  error?: string;
}

function uniqueUploadName(file: File, id: string) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dotIndex = safeName.lastIndexOf(".");
  const uniquePrefix = `upload_${Date.now()}_${file.lastModified}_${file.size}_${id.replace(/-/g, "")}`;
  if (dotIndex <= 0) return `${uniquePrefix}_${safeName}`;
  return `${uniquePrefix}_${safeName.slice(0, dotIndex)}${safeName.slice(dotIndex)}`;
}

function validate(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) {
    return "Unsupported file type. Please upload a PDF, JPG, or PNG.";
  }
  if (file.size > MAX_SIZE) {
    return "File is larger than 20MB.";
  }
  return null;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(file: File) {
  return file.type.startsWith("image/");
}

function UploadPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  const updateEntry = (id: string, patch: Partial<FileEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const addFiles = useCallback((files: FileList | File[]) => {
    const newEntries: FileEntry[] = [];
    Array.from(files).forEach((file) => {
      const err = validate(file);
      if (err) {
        toast.error(`${file.name}: ${err}`);
        return;
      }
      const previewUrl = isImage(file) ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      const id = crypto.randomUUID();
      newEntries.push({
        file,
        id,
        uploadName: uniqueUploadName(file, id),
        status: "pending",
        progress: 0,
        previewUrl,
      });
    });
    if (newEntries.length) {
      setEntries((prev) => [...prev, ...newEntries]);
      toast.success(
        newEntries.length === 1 ? "1 file selected." : `${newEntries.length} files selected.`,
      );
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (running) return;
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [running, addFiles],
  );

  const removeEntry = (id: string) =>
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((e) => e.id !== id);
    });

  const handleUpload = async () => {
    const pending = entries.filter((e) => e.status === "pending" || e.status === "error");
    if (!pending.length) return;

    setRunning(true);

    // Process files sequentially — Bedrock analysis takes ~25s per file and
    // API Gateway has a 29s timeout, so parallel calls would race and fail.
    let anyError = false;
    // Diagnostic: detect when the backend hands back the same storage key or
    // documentId for different files. Include completed entries too, because
    // users often add files in separate browse/drop actions.
    const seenIds = new Map(
      entries
        .filter((entry) => entry.documentId)
        .map((entry) => [entry.documentId as string, entry.file.name]),
    );
    const seenKeys = new Map(
      entries
        .filter((entry) => entry.storageKey)
        .map((entry) => [entry.storageKey as string, entry.file.name]),
    );
    let collisionDetected = false;

    for (const entry of pending) {
      try {
        updateEntry(entry.id, { status: "uploading", progress: 0, error: undefined });
        const presign = await apiClient.presign({
          fileName: entry.uploadName,
          fileType: entry.file.type,
          fileSize: entry.file.size,
        });

        console.info("[upload] presign result", {
          file: entry.file.name,
          uploadName: entry.uploadName,
          documentId: presign.documentId,
          key: presign.key,
        });
        toast.info(`Uploading ${entry.file.name}`);

        const idOwner = seenIds.get(presign.documentId);
        const keyOwner = seenKeys.get(presign.key);
        if (idOwner || keyOwner) {
          collisionDetected = true;
          console.error(
            "[upload] DUPLICATE presign — the backend returned an identical " +
              (idOwner ? "documentId" : "key") +
              " for two different files. The second upload will overwrite the first.",
            {
              file: entry.file.name,
              collidesWith: idOwner ?? keyOwner,
              documentId: presign.documentId,
              key: presign.key,
            },
          );
        }
        seenIds.set(presign.documentId, entry.file.name);
        seenKeys.set(presign.key, entry.file.name);

        await uploadToPresignedUrl(presign.uploadUrl, entry.file, (pct) =>
          updateEntry(entry.id, { progress: pct }),
        );

        updateEntry(entry.id, { status: "processing", progress: 100 });
        await apiClient.process({
          documentId: presign.documentId,
          key: presign.key,
          fileName: entry.uploadName,
        });

        updateEntry(entry.id, {
          status: "done",
          documentId: presign.documentId,
          storageKey: presign.key,
        });
        toast.success(`${entry.file.name} uploaded and analyzed.`);
      } catch (err) {
        anyError = true;
        const message =
          err instanceof ApiError ? err.message : "Upload failed. Please try again.";
        updateEntry(entry.id, { status: "error", error: message });
        toast.error(`${entry.file.name}: ${message}`);
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["documents"] });
    setRunning(false);

    if (collisionDetected) {
      toast.error(
        "The storage service gave the same location to multiple files, so they " +
          "overwrote each other. This is a server configuration issue — each file " +
          "needs a unique storage key.",
        { duration: 8000 },
      );
      return;
    }

    if (!anyError) {
      toast.success(
        pending.length === 1 ? "Document ready." : `${pending.length} documents ready.`,
      );
    }
  };

  const pendingCount = entries.filter(
    (e) => e.status === "pending" || e.status === "error",
  ).length;
  const allDone = entries.length > 0 && entries.every((e) => e.status === "done");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Upload documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add lab reports, imaging summaries, or visit notes (PDF, JPG, or PNG up to 20MB each).
        </p>
      </div>

      <Card className="p-6">
        <div
          role="button"
          tabIndex={0}
          onClick={() => !running && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !running) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!running) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
            dragging && "border-accent bg-accent/5",
            running && "pointer-events-none opacity-50",
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-accent">
            <UploadCloud className="h-7 w-7" />
          </span>
          <p className="text-sm font-medium text-foreground">
            Drag &amp; drop files here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, JPG, or PNG · max 20MB · multiple files supported
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
                {entries.length} {entries.length === 1 ? "file" : "files"} selected
              </p>
              {!running && (
                <button
                  type="button"
                  onClick={() => {
                    entries.forEach((entry) => {
                      if (entry.previewUrl) {
                        URL.revokeObjectURL(entry.previewUrl);
                        previewUrlsRef.current.delete(entry.previewUrl);
                      }
                    });
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
                      <p className="truncate text-sm font-medium text-foreground">{entry.file.name}</p>
                      {entry.status === "done" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-routine" />
                      ) : entry.status === "error" ? (
                        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                      ) : entry.status === "uploading" || entry.status === "processing" ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(entry.file.size)}
                      {entry.status === "uploading" && ` · Uploading ${entry.progress}%`}
                      {entry.status === "processing" && " · Analyzing…"}
                      {entry.status === "done" && " · Done"}
                      {entry.status === "error" && ` · ${entry.error ?? "Failed"}`}
                    </p>
                  </div>
                  {(entry.status === "pending" || entry.status === "error") && !running && (
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
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

        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            disabled={pendingCount === 0 || running}
            onClick={handleUpload}
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                {pendingCount > 1
                  ? `Upload & analyze ${pendingCount} files`
                  : "Upload & analyze"}
              </>
            )}
          </Button>
          {allDone && (
            <Button asChild variant="outline">
              <Link to="/">
                <CheckCircle2 className="h-4 w-4" />
                View documents
              </Link>
            </Button>
          )}
        </div>
      </Card>

      <Disclaimer />
    </div>
  );
}
