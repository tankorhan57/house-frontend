import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileText,
  CalendarDays,
  Stethoscope,
  BellRing,
  AlertCircle,
  Plus,
} from "lucide-react";
import { apiClient, type MedicalDocument } from "@/lib/api";
import { UrgencyBadge } from "@/components/urgency-badge";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Your documents</h1>
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
          {documents.map((doc) => (
            <DocumentCard key={doc.documentId} doc={doc} />
          ))}
        </div>
      )}

      <Disclaimer />
    </div>
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
