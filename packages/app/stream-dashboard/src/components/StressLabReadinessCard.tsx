import { useMemo } from 'react';
import { StreamStressLabWorkspace } from '../types/stressLab';

export interface StressLabReadinessCardProps {
  workspace: StreamStressLabWorkspace;
}

export function StressLabReadinessCard({ workspace }: StressLabReadinessCardProps) {
  const score = useMemo(() => {
    const runbooks = workspace.runbooks.length;
    const signals = workspace.runbookSignals.length;
    const baseline = Math.max(1, runbooks + signals);
    return Math.round(((runbooks * 2 + signals) / baseline) * 100);
  }, [workspace.runbooks.length, workspace.runbookSignals.length]);

  const riskBand = useMemo(() => {
    if (!workspace.simulation) return 'unknown';
    if (workspace.simulation.riskScore > 0.66) return 'high';
    if (workspace.simulation.riskScore > 0.33) return 'medium';
    return 'low';
  }, [workspace.simulation]);

  return (
    <section>
      <h3>Readiness</h3>
      <p>Readiness score: {score}</p>
      <p>Risk band: {riskBand}</p>
      <p>Signals: {workspace.runbookSignals.map((signal) => signal.id).slice(0, 8).join(', ') || 'none'}</p>
    </section>
  );
}
