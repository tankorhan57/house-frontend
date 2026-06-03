import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertCircle, Activity, Loader2 } from "lucide-react";
import { apiClient, type TrendPoint } from "@/lib/api";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/trends")({
  component: TrendsPage,
});

function TrendsPage() {
  const [biomarker, setBiomarker] = useState<string>("");

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.listDocuments(),
  });

  const docs = Array.isArray(documentsQuery.data) ? documentsQuery.data : [];

  // Fetch details to discover recognized biomarkers across the user's documents.
  const detailQueries = useQueries({
    queries: docs.map((d) => ({
      queryKey: ["document", d.documentId],
      queryFn: () => apiClient.getDocument(d.documentId),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const detailsLoading = detailQueries.some((q) => q.isLoading);

  const biomarkers = useMemo(() => {
    const set = new Set<string>();
    for (const q of detailQueries) {
      for (const av of q.data?.abnormal_values ?? []) {
        if (av.name) set.add(av.name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [detailQueries]);

  const trendQuery = useQuery({
    queryKey: ["trend", biomarker],
    queryFn: () => apiClient.getTrend(biomarker),
    enabled: !!biomarker,
  });

  const points: TrendPoint[] = useMemo(() => {
    const raw = trendQuery.data?.points ?? [];
    return [...raw]
      .filter((p) => p && p.date != null && p.value != null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((p) => ({ ...p, value: Number(p.value) }));
  }, [trendQuery.data]);

  const chartData = points.map((p) => {
    const d = new Date(p.date);
    return {
      label: isNaN(d.getTime()) ? p.date : format(d, "MMM yyyy"),
      value: p.value,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Trends</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See how a biomarker has changed across your documents over time.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-2 sm:max-w-xs">
          <label className="text-sm font-medium text-foreground">Biomarker</label>
          {documentsQuery.isLoading || detailsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding biomarkers in your documents…
            </div>
          ) : biomarkers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recognized biomarkers found yet. Upload lab results to start tracking trends.
            </p>
          ) : (
            <Select value={biomarker} onValueChange={setBiomarker}>
              <SelectTrigger>
                <SelectValue placeholder="Select a biomarker" />
              </SelectTrigger>
              <SelectContent>
                {biomarkers.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {biomarker && (
          <div className="mt-6">
            {trendQuery.isLoading && (
              <div className="flex h-72 items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}

            {trendQuery.isError && !trendQuery.isLoading && (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  {trendQuery.error instanceof Error
                    ? trendQuery.error.message
                    : "Could not load this trend."}
                </p>
                <Button variant="outline" onClick={() => trendQuery.refetch()}>
                  Try again
                </Button>
              </div>
            )}

            {!trendQuery.isLoading && !trendQuery.isError && chartData.length === 0 && (
              <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Activity className="h-8 w-8" />
                <p className="text-sm">Not enough data points to chart this biomarker yet.</p>
              </div>
            )}

            {!trendQuery.isLoading && !trendQuery.isError && chartData.length > 0 && (
              <>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-base font-semibold text-foreground">{biomarker}</h2>
                  {trendQuery.data?.unit && (
                    <span className="text-xs text-muted-foreground">
                      Unit: {trendQuery.data.unit}
                    </span>
                  )}
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                        stroke="var(--color-border)"
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                        stroke="var(--color-border)"
                        width={48}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--color-border)",
                          background: "var(--color-card)",
                          color: "var(--color-foreground)",
                          fontSize: 13,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-accent)"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "var(--color-accent)" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Disclaimer />
    </div>
  );
}
