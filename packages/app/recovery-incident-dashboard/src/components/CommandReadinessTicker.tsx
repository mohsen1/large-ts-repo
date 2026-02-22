import { useMemo } from 'react';
import type { DashboardSummary } from '../hooks/useIncidentDashboard';

interface CommandReadinessTickerProps {
  readonly summary: DashboardSummary;
  readonly heartbeat: number;
}

export const CommandReadinessTicker = ({ summary, heartbeat }: CommandReadinessTickerProps) => {
  const trend = useMemo(() => {
    const ratio = summary.runningRunCount + summary.failedRunCount === 0
      ? 0
      : summary.runningRunCount / (summary.runningRunCount + summary.failedRunCount);
    return ratio > 0.6 ? 'high' : ratio > 0.25 ? 'medium' : 'low';
  }, [summary.failedRunCount, summary.runningRunCount]);

  return (
    <section className="readiness-ticker">
      <h3>Readiness</h3>
      <p>trend={trend}</p>
      <p>heartbeat={heartbeat}s</p>
      <p>running={summary.runningRunCount}</p>
      <p>failed={summary.failedRunCount}</p>
      <p>approved={summary.approvedPlanCount}</p>
    </section>
  );
};
