import type { RecoveryRunState, RecoveryCheckpoint } from '@domain/recovery-orchestration';
import {
  assessSlaCoverage,
  buildRunVelocity,
  scoreVelocityProfile,
} from '@domain/recovery-orchestration';
import type { IncidentRecord } from '@domain/recovery-incident-orchestration';
import { withBrand } from '@shared/core';

export interface RunbookSignal {
  readonly runId: RecoveryRunState['runId'];
  readonly score: number;
  readonly labels: readonly string[];
}

export interface IncidentRunbookDigest {
  readonly incidentId: IncidentRecord['id'];
  readonly activeRuns: number;
  readonly warningRuns: number;
  readonly failureRate: number;
  readonly health: 'healthy' | 'attention' | 'critical';
}

export interface RunbookTrendPoint {
  readonly timestamp: string;
  readonly value: number;
}

const toRatio = (numerator: number, denominator: number): number =>
  denominator <= 0 ? 0 : Math.round((numerator / denominator) * 100) / 100;

const buildSyntheticProgramForRun = (run: RecoveryRunState) => ({
  id: withBrand(`${run.programId}-program`, 'RecoveryProgramId'),
  tenant: withBrand(`tenant:${String(run.programId)}`, 'TenantId'),
  service: withBrand(`service:${String(run.programId)}`, 'ServiceId'),
  name: `runbook:${String(run.programId)}`,
  description: 'Synthesized context for runbook-level SLA analysis',
  priority: 'bronze' as const,
  mode: 'defensive' as const,
  window: {
    startsAt: new Date(run.startedAt ?? new Date().toISOString()).toISOString(),
    endsAt: new Date(
      (run.startedAt ? Date.parse(run.startedAt) : Date.now()) + 30 * 60 * 1000,
    ).toISOString(),
    timezone: 'UTC',
  },
  constraints: [],
  topology: {
    rootServices: [String(run.programId)],
    fallbackServices: [],
    immutableDependencies: [] as readonly [string, string][],
  },
  owner: 'recovery-runner',
  steps: [],
  tags: ['synthetic'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const evaluateRunbookSignals = (
  run: RecoveryRunState,
  programSteps: readonly string[],
  checkpoints: readonly RecoveryCheckpoint[],
): RunbookSignal[] => {
  const syntheticProgram = buildSyntheticProgramForRun(run);
  const sla = assessSlaCoverage(
    syntheticProgram,
    run,
    checkpoints,
  );
  const velocity = buildRunVelocity(run, syntheticProgram, checkpoints);
  const velocityScore = scoreVelocityProfile(velocity);
  const signals: RunbookSignal[] = [
    {
      runId: run.runId,
      score: velocityScore,
      labels: programSteps.length > 0 ? ['ordered-steps', 'execution-visible'] : ['empty-plan'],
    },
  ];
  if (!sla.meetsSla) {
    signals.push({
      runId: run.runId,
      score: 0,
      labels: ['sla-breach'],
    });
  }
  return signals.sort((left, right) => right.score - left.score);
};

export const summarizeRunbook = (
  run: RecoveryRunState,
  incidents: readonly IncidentRecord[],
): IncidentRunbookDigest => {
  const matched = incidents.filter((incident) => String(incident.id).includes(String(run.incidentId)));
  const total = matched.length;
  const warnings = matched.filter((incident) => incident.severity === 'critical' || incident.severity === 'extreme').length;
  const failedChecks = 0;
  const failureRate = toRatio(failedChecks, Math.max(1, total));
  const health = total === 0
    ? 'critical'
    : failureRate > 0.25 || warnings > 2
      ? 'critical'
      : failureRate > 0.1
        ? 'attention'
        : 'healthy';
  return {
    incidentId: incidents[0]?.id ?? ('' as IncidentRecord['id']),
    activeRuns: total,
    warningRuns: warnings,
    failureRate,
    health,
  };
};

export const buildTrend = (base: number, step: number, points: number): readonly RunbookTrendPoint[] => {
  const result: RunbookTrendPoint[] = [];
  let cursor = base;
  for (let index = 0; index < points; index += 1) {
    const value = Number((cursor + (index * step)).toFixed(4));
    result.push({ timestamp: new Date(Date.now() + index * 60000).toISOString(), value });
  }
  return result;
};
