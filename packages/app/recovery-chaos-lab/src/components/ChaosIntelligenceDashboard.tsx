import { useMemo } from 'react';
import type { ChaosRunEvent, ChaosRunReport } from '@service/recovery-chaos-orchestrator';
import type { StageBoundary } from '@domain/recovery-chaos-lab';

export interface ChaosIntelligenceDashboardProps {
  readonly report: ChaosRunReport<readonly StageBoundary<string, unknown, unknown>[]> | null;
  readonly events: readonly ChaosRunEvent[];
  readonly eventRatioThreshold?: number;
}

export function ChaosIntelligenceDashboard({
  report,
  events,
  eventRatioThreshold = 0.75
}: ChaosIntelligenceDashboardProps) {
  const buckets = useMemo(() => {
    const grouped = events.reduce<Record<string, number>>((acc, event) => {
      const key = event.kind;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const values = Object.entries(grouped).map(([kind, count]) => ({ kind, count }));
    const ratio = values.reduce((sum) => sum + 1, 0) / Math.max(values.length, 1);
    const status = ratio >= eventRatioThreshold ? 'Healthy' : 'Elevated';
    return {
      values,
      ratio,
      status
    };
  }, [events, eventRatioThreshold]);

  if (!report) {
    return <section>No studio report loaded</section>;
  }

  return (
    <section className="chaos-intelligence-dashboard">
      <header>
        <h3>Chaos Intelligence</h3>
        <small>
          progress {report.progress}% — {report.status}
        </small>
      </header>
      <p>event health {buckets.status}</p>
      <ul>
        {buckets.values.map((entry) => (
          <li key={entry.kind}>
            <strong>{entry.kind}</strong> <span>{entry.count}</span>
          </li>
        ))}
      </ul>
      <aside>
        <small>ratio {buckets.ratio.toFixed(2)}</small>
      </aside>
    </section>
  );
}
