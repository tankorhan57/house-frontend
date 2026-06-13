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
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { apiClient, ApiError, type MedicalDocument, type Insight } from "@/lib/api";
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

      <ScoreCard />

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

function ScoreCard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["score"],
    queryFn: () => apiClient.getScore(),
  });

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-foreground">Health score</h2>
      {isLoading ? (
        <div className="mt-4 flex items-center gap-6">
          <Skeleton className="h-32 w-32 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ) : isError || !data ? (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Your health score isn’t available yet. Add documents and complete your profile to
            generate one.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <ScoreRing score={data.score} />
          <div className="flex-1 space-y-3">
            {data.summary && (
              <p className="text-sm leading-relaxed text-foreground/90">{data.summary}</p>
            )}
            {data.factors && data.factors.length > 0 && (
              <ul className="space-y-1.5">
                {data.factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>
                      <span className="font-medium text-foreground">{f.label}</span>
                      {f.detail ? ` — ${f.detail}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
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

  if (isError || insights.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Lightbulb className="h-5 w-5 text-accent" />
        Insights
      </h2>
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
    </div>
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
  const dir = (insight.direction ?? "").toLowerCase();
  const severity = (insight.severity ?? "").toLowerCase();
  const accentBar =
    severity === "high" || severity === "urgent"
      ? "bg-urgent"
      : severity === "medium" || severity === "soon"
        ? "bg-soon"
        : "bg-accent";

  return (
    <Card className="relative flex gap-3 overflow-hidden p-4 pr-10">
      <span className={cn("absolute inset-y-0 left-0 w-1", accentBar)} />
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-accent">
        {dir.includes("high") || dir.includes("up") ? (
          <TrendingUp className="h-4 w-4" />
        ) : dir.includes("low") || dir.includes("down") ? (
          <TrendingDown className="h-4 w-4" />
        ) : (
          <Lightbulb className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{insight.biomarker}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{insight.message}</p>
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
