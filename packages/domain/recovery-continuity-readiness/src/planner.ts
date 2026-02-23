import { randomUUID } from 'node:crypto';
import { ok, fail, type Result } from '@shared/result';
import { withBrand, normalizeLimit } from '@shared/core';
import { buildSignalSeries, dedupeSignals, rankSignalsByWeight } from './signals';
import { choosePlan, evaluateCoverage, buildCoverageTrend, normalizeRiskBand, describePlanTrend } from './readiness';
import {
  ContinuityReadinessIds,
  type ContinuityReadinessSurface,
  type ContinuityReadinessCandidatePlan,
  type ContinuityReadinessTenantId,
  type ContinuityObjective,
  type ContinuityReadinessRun,
  type ContinuityReadinessSurfaceId,
  type ContinuityReadinessEnvelope,
} from './types';

export interface PlannerRunInput {
  readonly tenantId: ContinuityReadinessTenantId;
  readonly surfaceId: ContinuityReadinessSurfaceId;
  readonly tenantName: string;
  readonly signals: ContinuityReadinessSurface['signals'];
  readonly objectives: readonly ContinuityObjective[];
  readonly horizonMinutes: number;
}

const nowIso = (): string => new Date().toISOString();

const buildPlanSteps = (planLabel: string): readonly ContinuityReadinessCandidatePlan['runbook'][number][] => [
  {
    id: withBrand(`step:${planLabel}:observe:${randomUUID()}`, 'ContinuityReadinessStepId'),
    order: 1,
    title: 'Signal stabilization hold',
    command: 'srectl hold --signals --surface',
    expectedDurationMinutes: 12,
    owner: 'sre-ops',
  },
  {
    id: withBrand(`step:${planLabel}:stabilize:${randomUUID()}`, 'ContinuityReadinessStepId'),
    order: 2,
    title: 'Trigger secondary readiness checks',
    command: 'srectl validate --secondary-only',
    expectedDurationMinutes: 22,
    owner: 'recovery-team',
  },
  {
    id: withBrand(`step:${planLabel}:handoff:${randomUUID()}`, 'ContinuityReadinessStepId'),
    order: 3,
    title: 'Publish handoff summary',
    command: 'srectl handoff --notify-all',
    expectedDurationMinutes: 6,
    owner: 'incident-commander',
  },
];

const toPlan = (
  tenantId: ContinuityReadinessTenantId,
  surfaceId: ContinuityReadinessSurfaceId,
  tag: string,
  objective: ContinuityObjective,
  signals: ContinuityReadinessSurface['signals'],
  score: number,
): ContinuityReadinessCandidatePlan => ({
  id: ContinuityReadinessIds.plan(`${tenantId}:plan:${tag}:${randomUUID()}`),
  tenantId,
  label: `${tag} ${surfaceId.toString().slice(0, 6)}`,
  phase: tag.includes('stabilize') ? 'stabilize' : 'observe',
  score,
  risk: normalizeRiskBand(score),
  signals,
  runbook: buildPlanSteps(tag),
  objective,
  createdBy: 'readiness-planner',
  createdAt: nowIso(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 180).toISOString(),
  tags: [tag, objective.slaName.toLowerCase()],
});

const buildObjectiveRuns = (
  input: PlannerRunInput,
  planLimit: number,
): Result<readonly ContinuityReadinessCandidatePlan[], Error> => {
  if (input.signals.length === 0 && input.objectives.length === 0) {
    return fail(new Error('no signals or objectives provided'));
  }

  const prepared = dedupeSignals(rankSignalsByWeight(input.signals)).slice(0, normalizeLimit(planLimit));
  const planInputs = input.objectives.length > 0
    ? input.objectives.map((objective, index) => {
      const objectiveTag = `${String(objective.id)}-${index}`;
      return { objective, tag: objectiveTag, signals: prepared };
    })
    : [{
      objective: {
        id: withBrand(`${input.tenantId}:default-objective`, 'ContinuityObjectiveId'),
        tenantId: input.tenantId,
        targetRtoMinutes: 15,
        targetRpoMinutes: 5,
        slaName: 'Default continuity envelope',
        criticality: 'medium',
        owners: ['ops'],
      } as ContinuityObjective,
      tag: 'default-observe',
      signals: prepared,
    }];

  const plans = planInputs.map(({ objective, tag, signals }) => {
    const score = Math.round(
      15 +
      objective.criticality.length * 10 +
      signals.reduce((total, signal) => total + signal.severity * 0.25 + signal.confidence * 10, 0) / Math.max(1, signals.length),
    );
    return toPlan(input.tenantId, input.surfaceId, tag, objective, signals, Math.max(5, Math.min(99, score)));
  });

  return ok(plans);
};

const buildRun = (input: {
  tenantId: ContinuityReadinessTenantId;
  surfaceId: ContinuityReadinessSurfaceId;
  selected?: ContinuityReadinessCandidatePlan;
  coverage: ReadonlyArray<unknown>;
  startedAt: string;
}): ContinuityReadinessRun => {
  const selected = input.selected;
  const active = selectedPlanToRisk(selected) !== 'critical';
  const plan = selected ?? {
    id: ContinuityReadinessIds.plan(`${input.tenantId}:fallback`),
    tenantId: input.tenantId,
    label: 'Fallback readiness plan',
    phase: 'observe',
    score: 40,
    risk: 'high',
    signals: [],
    runbook: [],
    objective: {
      id: withBrand(`${input.tenantId}:fallback-objective`, 'ContinuityObjectiveId'),
      tenantId: input.tenantId,
      targetRtoMinutes: 15,
      targetRpoMinutes: 5,
      slaName: 'Fallback continuity objective',
      criticality: 'medium',
      owners: ['ops'],
    },
    createdBy: 'planner',
    createdAt: input.startedAt,
    expiresAt: input.startedAt,
    tags: ['fallback'],
  };

  return {
    id: ContinuityReadinessIds.run(`${input.tenantId}:run:${Date.now()}`),
    surfaceId: input.surfaceId,
    tenantId: input.tenantId,
    planId: plan.id,
    phase: plan.phase,
    startedAt: input.startedAt,
    startedBy: 'planner',
    expectedFinishAt: new Date(Date.now() + 1000 * 60 * 90).toISOString(),
    currentScore: plan.score,
    riskBand: selectedPlanToRisk(plan),
    active,
    metadata: {
      generatedAt: input.startedAt,
      signalCount: input.coverage.length,
      objectiveCount: input.coverage.length,
      phase: plan.phase,
    },
  };
};

const selectedPlanToRisk = (plan: ContinuityReadinessCandidatePlan | undefined): ContinuityReadinessCandidatePlan['risk'] =>
  plan?.risk ?? 'critical';

export interface PlannerRunOutput {
  readonly envelope: ContinuityReadinessEnvelope;
  readonly summary: string;
}

export const buildReadinessEnvelope = (input: PlannerRunInput): Result<PlannerRunOutput, Error> => {
  const preparedSignals = buildSignalSeries(input.signals, 40);
  const plans = buildObjectiveRuns(input, 12);
  if (!plans.ok) {
    return fail(plans.error);
  }

  const coverage = evaluateCoverage(input.objectives.length ? input.objectives : [
    {
      id: withBrand(`${input.tenantId}:default-objective`, 'ContinuityObjectiveId'),
      tenantId: input.tenantId,
      targetRtoMinutes: 15,
      targetRpoMinutes: 5,
      slaName: input.tenantName,
      criticality: 'medium',
      owners: ['ops'],
    } as ContinuityObjective,
  ], [...preparedSignals]);

  const projection = buildCoverageTrend(
    preparedSignals.map((signal) => signal.severity),
    {
      from: nowIso(),
      to: new Date(Date.now() + input.horizonMinutes * 60_000).toISOString(),
      minutes: Math.max(1, input.horizonMinutes),
    },
  );

  const picked = choosePlan(plans.value, 1);
  if (!picked.ok) {
    return fail(picked.error);
  }

  const selected = picked.value;
  const now = nowIso();
  const run = buildRun({
    tenantId: input.tenantId,
    surfaceId: input.surfaceId,
    selected: selected ?? undefined,
    coverage,
    startedAt: now,
  });

  const surface: ContinuityReadinessSurface = {
    id: input.surfaceId,
    tenantId: input.tenantId,
    signals: preparedSignals,
    plans: plans.value,
    metrics: [
      {
        timestamp: nowIso(),
        latencyP95Ms: 120 + input.horizonMinutes,
        availability: 99.4,
        throughputQps: 240,
        errorRate: 0.021 + plans.value.length / 100,
      },
    ],
    lastUpdated: nowIso(),
  };

  const envelope: ContinuityReadinessEnvelope = {
    tenantId: input.tenantId,
    surface,
    coverage,
    run,
    projection,
  };

  const summary = selected
    ? `${selected.label} selected: ${describePlanTrend(selected)} (score ${selected.score})`
    : 'No plan selected for this surface';

  return ok({ envelope, summary });
};
