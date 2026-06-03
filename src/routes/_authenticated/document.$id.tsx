import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  Stethoscope,
  FileText,
  AlertCircle,
  ListChecks,
  MessageCircleQuestion,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { apiClient, type AbnormalValue } from "@/lib/api";
import { UrgencyBadge } from "@/components/urgency-badge";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/document/$id")({
  component: DocumentDetailPage,
});

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : format(d, "MMMM d, yyyy");
}

/** Extract question-style sentences from the interpretation text. */
function parseQuestions(interpretation?: string): string[] {
  if (!interpretation) return [];
  const matches = interpretation.match(/[^.?!\n]*\?/g) ?? [];
  const cleaned = matches
    .map((q) => q.replace(/^[\s\-*•:]+/, "").trim())
    .filter((q) => q.length > 8);
  return Array.from(new Set(cleaned)).slice(0, 8);
}

function DirectionIcon({ direction }: { direction?: string }) {
  const d = (direction ?? "").toLowerCase();
  if (d.includes("high") || d.includes("up") || d === "h")
    return <TrendingUp className="h-4 w-4 text-urgent" />;
  if (d.includes("low") || d.includes("down") || d === "l")
    return <TrendingDown className="h-4 w-4 text-accent" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["document", id],
    queryFn: () => apiClient.getDocument(id),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Card className="p-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </Card>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Could not load this document."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">Back to documents</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const questions = parseQuestions(data.interpretation);
  const abnormal: AbnormalValue[] = data.abnormal_values ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All documents
      </Link>

      {/* Header */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {data.document_type || data.fileName || "Document"}
              </h1>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  {formatDate(data.date_of_service)}
                </span>
                {data.provider_name && (
                  <span className="flex items-center gap-1.5">
                    <Stethoscope className="h-4 w-4" />
                    {data.provider_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <UrgencyBadge urgency={data.urgency} />
        </div>
      </Card>

      {/* Interpretation */}
      {data.interpretation && (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-foreground">What this means</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {data.interpretation}
          </p>
        </Card>
      )}

      {/* Key findings */}
      {data.key_findings && data.key_findings.length > 0 && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ListChecks className="h-4.5 w-4.5 text-accent" />
            Key findings
          </h2>
          <ul className="mt-3 space-y-2">
            {data.key_findings.map((finding, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-foreground/90">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {finding}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Abnormal values */}
      {abnormal.length > 0 && (
        <Card className="overflow-hidden p-0">
          <h2 className="border-b border-border px-6 py-4 text-base font-semibold text-foreground">
            Values outside the typical range
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Value</th>
                  <th className="px-3 py-3 font-medium">Unit</th>
                  <th className="px-3 py-3 font-medium">Reference range</th>
                  <th className="px-6 py-3 text-center font-medium">Direction</th>
                </tr>
              </thead>
              <tbody>
                {abnormal.map((row, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-b border-border last:border-0",
                      i % 2 === 1 && "bg-muted/40",
                    )}
                  >
                    <td className="px-6 py-3 font-medium text-foreground">{row.name}</td>
                    <td className="px-3 py-3 text-foreground">{row.value}</td>
                    <td className="px-3 py-3 text-muted-foreground">{row.unit || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.reference_range || "—"}
                    </td>
                    <td className="px-6 py-3">
                      <span className="flex items-center justify-center gap-1.5">
                        <DirectionIcon direction={row.direction} />
                        <span className="text-xs capitalize text-muted-foreground">
                          {row.direction || "—"}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Questions to ask your doctor */}
      {questions.length > 0 && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <MessageCircleQuestion className="h-4.5 w-4.5 text-accent" />
            Questions to ask your doctor
          </h2>
          <ul className="mt-3 space-y-2.5">
            {questions.map((q, i) => (
              <li
                key={i}
                className="rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-foreground/90"
              >
                {q}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Disclaimer />
    </div>
  );
}
