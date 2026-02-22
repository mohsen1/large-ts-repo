import { withBrand } from '@shared/core';
import type { RecoverySignal, RunPlanSnapshot, RunSession, SessionStatus } from '@domain/recovery-operations-models';
import {
  buildCommandSurface,
  summarizeSurface,
} from '@domain/recovery-operations-models/command-surface';
import { buildOrchestrationMatrix, buildReadinessProfile } from '@domain/recovery-operations-models/orchestration-matrix';

interface ReadinessSignalMatrixProps {
  readonly sessionId: string;
  readonly plans: readonly RunPlanSnapshot[];
  readonly signals: readonly { source: string; severity: number; confidence: number }[];
}

interface SignalCell {
  readonly runId: string;
  readonly planId: string;
  readonly score: number;
  readonly laneCount: number;
  readonly cycleRisk: number;
}

const toRunSession = (
  sessionId: string,
  signals: readonly { source: string; severity: number; confidence: number }[],
): RunSession => ({
  id: withBrand(sessionId, 'RunSessionId'),
  runId: withBrand(`${sessionId}:run`, 'RecoveryRunId'),
  ticketId: withBrand(`${sessionId}:ticket`, 'RunTicketId'),
  planId: withBrand(`${sessionId}:plan`, 'RunPlanId'),
  status: 'running' as SessionStatus,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  constraints: {
    maxParallelism: 3,
    maxRetries: 1,
    timeoutMinutes: 30,
    operatorApprovalRequired: false,
  },
  signals: signals.map((signal) => ({
    id: `${sessionId}:${signal.source}`,
    source: signal.source,
    severity: signal.severity,
    confidence: signal.confidence,
    detectedAt: new Date().toISOString(),
    details: {},
  }) as RecoverySignal),
});

export const ReadinessSignalMatrix = ({ sessionId, plans, signals }: ReadinessSignalMatrixProps) => {
  const rows = plans.map((plan): SignalCell => {
    const runSession = toRunSession(sessionId, signals);
    const surface = buildCommandSurface(runSession, plan);
    const profile = buildReadinessProfile(runSession, plan);
    const matrixData = buildOrchestrationMatrix(runSession, plan);
    const summary = summarizeSurface(surface);
    return {
      runId: String(runSession.runId),
      planId: plan.id,
      score: summary.average,
      laneCount: profile.lanes.length,
      cycleRisk: matrixData.cycleRisk,
    };
  });

  return (
    <section>
      <h3>Readiness signal matrix</h3>
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Plan</th>
            <th>Score</th>
            <th>Lanes</th>
            <th>Cycle Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: SignalCell) => (
            <tr key={`${row.runId}:${row.planId}`}>
              <td>{row.runId}</td>
              <td>{row.planId}</td>
              <td>{row.score.toFixed(2)}</td>
              <td>{row.laneCount}</td>
              <td>{row.cycleRisk.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
