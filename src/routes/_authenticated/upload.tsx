import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileText, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
import { apiClient, uploadToPresignedUrl, ApiError } from "@/lib/api";
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
const ACCEPT_ATTR = "application/pdf,image/jpeg,image/png";
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
  if (!ACCEPTED.includes(file.type))
    return "Unsupported file type. Please upload a PDF, JPG, or PNG.";
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
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach(URL.revokeObjectURL);
      urls.clear();
    };
  }, []);

  const appendFiles = useCallback((files: FileList | File[]) => {
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
    if (toAdd.length) {
      setEntries((prev) => [...prev, ...toAdd]);
      toast.success(toAdd.length === 1 ? "1 file added." : `${toAdd.length} files added.`);
    }
  }, []);

  const removeEntry = (id: string) =>
    setEntries((prev) => {
      const t = prev.find((e) => e.id === id);
      if (t?.previewUrl) {
        URL.revokeObjectURL(t.previewUrl);
        previewUrlsRef.current.delete(t.previewUrl);
      }
      return prev.filter((e) => e.id !== id);
    });

  const handleUpload = async () => {
    setEntries((current) => {
      const pending = current.filter((e) => e.status === "pending" || e.status === "error");
      if (!pending.length) return current;
      (async () => {
        setRunning(true);
        let anyError = false;
        const snap = current.filter((e) => e.status === "pending" || e.status === "error");
        for (const entry of snap) {
          try {
            setEntries((p) =>
              p.map((e) =>
                e.id === entry.id
                  ? { ...e, status: "uploading", progress: 0, error: undefined }
                  : e,
              ),
            );
            const presign = await apiClient.presign({
              fileName: entry.file.name,
              fileType: entry.file.type,
              fileSize: entry.file.size,
            });
            await uploadToPresignedUrl(presign.uploadUrl, entry.file, (pct) =>
              setEntries((p) => p.map((e) => (e.id === entry.id ? { ...e, progress: pct } : e))),
            );
            setEntries((p) =>
              p.map((e) => (e.id === entry.id ? { ...e, status: "processing", progress: 100 } : e)),
            );
            await apiClient.process({
              documentId: presign.documentId,
              key: presign.key,
              fileName: entry.file.name,
            });
            setEntries((p) => p.map((e) => (e.id === entry.id ? { ...e, status: "done" } : e)));
          } catch (err) {
            anyError = true;
            const msg = err instanceof ApiError ? err.message : "Upload failed. Please try again.";
            setEntries((p) =>
              p.map((e) => (e.id === entry.id ? { ...e, status: "error", error: msg } : e)),
            );
            toast.error(`${entry.file.name}: ${msg}`);
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["documents"] });
        setRunning(false);
        if (!anyError)
          toast.success(snap.length === 1 ? "Document ready." : `${snap.length} documents ready.`);
      })();
      return current;
    });
  };

  const pendingCount = entries.filter((e) => e.status === "pending" || e.status === "error").length;
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
            if (e.dataTransfer.files?.length) appendFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors",
            dragging && "border-accent bg-accent/5",
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-accent">
            <UploadCloud className="h-7 w-7" />
          </span>
          <p className="text-sm font-medium text-foreground">
            Drag &amp; drop files here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, JPG, or PNG · max 20MB · hold Cmd (Mac) or Ctrl (Windows) to select multiple
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) appendFiles(e.target.files);
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
                    entries.forEach((e) => {
                      if (e.previewUrl) {
                        URL.revokeObjectURL(e.previewUrl);
                        previewUrlsRef.current.delete(e.previewUrl);
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
                        <img src={entry.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {entry.file.name}
                        </p>
                        {entry.status === "done" ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
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
                {pendingCount > 1 ? `Upload & analyze ${pendingCount} files` : "Upload & analyze"}
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
