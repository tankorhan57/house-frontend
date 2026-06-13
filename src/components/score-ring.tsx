import { cn } from "@/lib/utils";

interface ScoreRingProps {
  score: number;
  size?: number;
  stroke?: number;
  className?: string;
}

/** Color the ring by health-score band: low = urgent, mid = soon, high = routine. */
function ringColor(score: number) {
  if (score >= 75) return "var(--color-routine)";
  if (score >= 50) return "var(--color-soon)";
  return "var(--color-urgent)";
}

export function ScoreRing({ score, size = 132, stroke = 12, className }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamped / 100) * circ;
  const color = ringColor(clamped);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tracking-tight text-foreground">{clamped}</span>
        <span className="text-xs font-medium text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}
