import { useCallback, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud, FileText, Loader2, X, CheckCircle2 } from "lucide-react";
import { apiClient, uploadToPresignedUrl, ApiError } from "@/lib/api";
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

type Stage = "idle" | "uploading" | "processing" | "done";

const STAGE_LABEL: Record<Exclude<Stage, "idle">, string> = {
  uploading: "Securely uploading your document…",
  processing: "Reading and explaining your document…",
  done: "All done! Redirecting…",
};

function validate(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) {
    return "Unsupported file type. Please upload a PDF, JPG, or PNG.";
  }
  if (file.size > MAX_SIZE) {
    return "That file is larger than 20MB. Please upload a smaller file.";
  }
  return null;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);

  const busy = stage === "uploading" || stage === "processing" || stage === "done";

  const selectFile = useCallback((f: File) => {
    const err = validate(f);
    if (err) {
      toast.error(err);
      return;
    }
    setFile(f);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (busy) return;
      const f = e.dataTransfer.files?.[0];
      if (f) selectFile(f);
    },
    [busy, selectFile],
  );

  const handleUpload = async () => {
    if (!file) return;
    try {
      setProgress(0);
      setStage("uploading");
      const presign = await apiClient.presign({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      await uploadToPresignedUrl(presign.uploadUrl, file, setProgress);

      setStage("processing");
      await apiClient.process({
        documentId: presign.documentId,
        key: presign.key,
        fileName: file.name,
      });

      setStage("done");
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Your document is ready.");
      navigate({ to: "/document/$id", params: { id: presign.documentId } });
    } catch (err) {
      setStage("idle");
      setProgress(0);
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong during upload. Please try again.";
      toast.error(message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Upload a document</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a lab report, imaging summary, or visit note (PDF, JPG, or PNG up to 20MB).
        </p>
      </div>

      {busy ? (
        <Card className="flex flex-col items-center gap-4 p-12 text-center">
          {stage === "done" ? (
            <CheckCircle2 className="h-10 w-10 text-routine" />
          ) : (
            <Loader2 className="h-10 w-10 animate-spin text-accent" />
          )}
          <p className="text-sm font-medium text-foreground">{STAGE_LABEL[stage]}</p>
          {stage === "uploading" && (
            <div className="w-full max-w-xs space-y-1">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            This can take a moment. Please keep this page open.
          </p>
        </Card>
      ) : (
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
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-12 text-center transition-colors",
              dragging && "border-accent bg-accent/5",
            )}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-accent">
              <UploadCloud className="h-7 w-7" />
            </span>
            <p className="text-sm font-medium text-foreground">
              Drag &amp; drop your file here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">PDF, JPG, or PNG · max 20MB</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) selectFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
              <FileText className="h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <Button className="mt-4 w-full" disabled={!file} onClick={handleUpload}>
            <UploadCloud className="h-4 w-4" />
            Upload &amp; analyze
          </Button>
        </Card>
      )}

      <Disclaimer />
    </div>
  );
}
