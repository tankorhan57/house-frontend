import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  urgent: "bg-urgent text-urgent-foreground",
  soon: "bg-soon text-soon-foreground",
  routine: "bg-routine text-routine-foreground",
};

const LABELS: Record<string, string> = {
  urgent: "Urgent",
  soon: "Soon",
  routine: "Routine",
};

export function UrgencyBadge({ urgency, className }: { urgency?: string; className?: string }) {
  if (!urgency) return null;
  const key = urgency.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide",
        STYLES[key] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {LABELS[key] ?? urgency}
    </span>
  );
}
