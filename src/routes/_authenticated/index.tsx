import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  FileText,
  CalendarDays,
  Stethoscope,
  BellRing,
  AlertCircle,
  Plus,
  Lightbulb,
  X,
  Loader2,
} from "lucide-react";
import {
  apiClient,
  ApiError,
  normalizeScoreBreakdown,
  type MedicalDocument,
  type Insight,
} from "@/lib/api";
import { UrgencyBadge } from "@/components/urgency-badge";
import { ScoreRing } from "@/components/score-ring";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : format(d, "MMM d, yyyy");
}

function Dashboard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.listDocuments(),
  });

  const documents = Array.isArray(data) ? data : [];
  const hasDocuments = documents.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Your health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plain-language summaries of your medical records.
          </p>
        </div>
        <Button asChild>
          <Link to="/upload">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </Link>
        </Button>
      </div>

      <HealthProfileCard hasDocuments={hasDocuments} docsLoading={isLoading} />

      <InsightsSection />

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">Recent documents</h2>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-3 h-4 w-48" />
              <Skeleton className="mt-2 h-4 w-40" />
            </Card>
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Could not load your documents."}
          </p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            Try again
          </Button>
        </Card>
      )}

      {!isLoading && !isError && documents.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-accent">
            <FileText className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">No documents yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Upload a lab report, imaging summary, or visit note to get a clear, plain-language
            explanation.
          </p>
          <Button asChild className="mt-2">
            <Link to="/upload">
              <Plus className="h-4 w-4" />
              Upload your first document
            </Link>
          </Button>
        </Card>
      )}

      {!isLoading && !isError && documents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {documents.map((doc, i) => (
            <DocumentCard
              key={`${doc.documentId ?? "document"}-${doc.fileName ?? "file"}-${i}`}
              doc={doc}
            />
          ))}
        </div>
      )}

      <Disclaimer />
    </div>
  );
}

function HealthProfileCard({
  hasDocuments,
  docsLoading,
}: {
  hasDocuments: boolean;
  docsLoading: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["score"],
    queryFn: () => apiClient.getScore(),
  });

  // Empty state: no documents yet -> grey ring at 0 + upload CTA.
  if (!docsLoading && !hasDocuments) {
    return (
      <Card className="flex flex-col items-center gap-5 p-8 text-center sm:flex-row sm:text-left">
        <ScoreRing score={0} />
        <div className="flex-1 space-y-3">
          <h2 className="text-base font-semibold text-foreground">Health Profile</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Upload your first document to start building your health profile.
          </p>
          <Button asChild>
            <Link to="/upload">
              <Plus className="h-4 w-4" />
              Upload your first document
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (isLoading || docsLoading) {
    return (
      <Card className="p-6">
        <h2 className="text-base font-semibold text-foreground">Health Profile</h2>
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
          <Skeleton className="h-36 w-36 rounded-full" />
          <div className="flex-1 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  const score = data?.score ?? 0;
  const bars = normalizeScoreBreakdown(data?.breakdown);

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-foreground">Health Profile</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        A completeness meter — how much of your health picture you've added so far.
      </p>
      <div className="mt-5 flex flex-col items-center gap-7 sm:flex-row sm:items-center">
        <ScoreRing score={score} />
        <div className="flex-1 space-y-3 self-stretch">
          {bars.map((bar) => (
            <ComponentBar key={bar.label} label={bar.label} value={bar.value} max={bar.max} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function ComponentBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ring-track">
        <div
          className="h-full rounded-full bg-teal transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function InsightsSection() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["insights"],
    queryFn: () => apiClient.getInsights(),
  });

  const dismiss = useMutation({
    mutationFn: (insight: Insight) =>
      apiClient.dismissInsight({ biomarker: insight.biomarker, message: insight.message }),
    onMutate: async (insight) => {
      await queryClient.cancelQueries({ queryKey: ["insights"] });
      const prev = queryClient.getQueryData<Insight[]>(["insights"]);
      queryClient.setQueryData<Insight[]>(["insights"], (old) =>
        (old ?? []).filter(
          (i) => !(i.biomarker === insight.biomarker && i.message === insight.message),
        ),
      );
      return { prev };
    },
    onError: (err, _insight, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["insights"], ctx.prev);
      toast.error(err instanceof ApiError ? err.message : "Could not dismiss this insight.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["insights"] }),
  });

  const insights = Array.isArray(data) ? data : [];

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-3 h-4 w-full" />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Lightbulb className="h-5 w-5 text-accent" />
        Insights
      </h2>
      {isError || insights.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Upload 3+ documents with the same biomarker to see trends.
        </Card>
      ) : (
        <div className="grid gap-3">
          {insights.map((insight, i) => (
            <InsightCard
              key={`${insight.biomarker}-${i}`}
              insight={insight}
              onDismiss={() => dismiss.mutate(insight)}
              dismissing={dismiss.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Severity = "info" | "watch" | "urgent";

function normalizeSeverity(severity?: string): Severity {
  const s = (severity ?? "").toLowerCase();
  if (s === "urgent" || s === "high" || s === "critical") return "urgent";
  if (s === "watch" || s === "medium" || s === "soon" || s === "warn") return "watch";
  return "info";
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    info: "bg-accent/15 text-accent",
    watch: "bg-soon/20 text-soon-foreground",
    urgent: "bg-urgent/15 text-urgent",
  };
  const labels: Record<Severity, string> = {
    info: "Info",
    watch: "Watch",
    urgent: "Urgent",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[severity],
      )}
    >
      {labels[severity]}
    </span>
  );
}

function InsightCard({
  insight,
  onDismiss,
  dismissing,
}: {
  insight: Insight;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const severity = normalizeSeverity(insight.severity);
  const accentBar =
    severity === "urgent" ? "bg-urgent" : severity === "watch" ? "bg-soon" : "bg-accent";

  return (
    <Card className="relative flex gap-3 overflow-hidden p-4 pr-10">
      <span className={cn("absolute inset-y-0 left-0 w-1", accentBar)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{insight.biomarker}</p>
          <SeverityBadge severity={severity} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{insight.message}</p>
        {(insight.value != null || insight.reference_range) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {insight.value != null && (
              <span className="font-medium text-foreground">
                {insight.value}
                {insight.unit ? ` ${insight.unit}` : ""}
              </span>
            )}
            {insight.reference_range ? ` · range ${insight.reference_range}` : ""}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        disabled={dismissing}
        aria-label="Dismiss insight"
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        {dismissing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </button>
    </Card>
  );
}

function DocumentCard({ doc }: { doc: MedicalDocument }) {
  return (
    <Link to="/document/$id" params={{ id: doc.documentId }} className="group block">
      <Card className="h-full p-5 transition-all hover:border-accent hover:shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-accent">
              <FileText className="h-4.5 w-4.5" />
            </span>
            <h3 className="font-semibold text-foreground">
              {doc.document_type || doc.fileName || "Document"}
            </h3>
          </div>
          <UrgencyBadge urgency={doc.urgency} />
        </div>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span>{formatDate(doc.date_of_service)}</span>
          </div>
          {doc.provider_name && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Stethoscope className="h-4 w-4" />
              <span>{doc.provider_name}</span>
            </div>
          )}
        </dl>

        {doc.follow_up_recommended && (
          <div className="mt-4 flex items-center gap-1.5 rounded-md bg-soon/15 px-2.5 py-1.5 text-xs font-medium text-foreground">
            <BellRing className="h-3.5 w-3.5 text-soon" />
            Follow-up recommended
          </div>
        )}
      </Card>
    </Link>
  );
}
