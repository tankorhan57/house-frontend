import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <p>
        House is a patient education tool, not medical advice. Always consult a qualified medical
        professional.
      </p>
    </div>
  );
}
