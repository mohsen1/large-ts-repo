import type {
  LabExecution,
  LabPlan,
  LabSignal,
  OrchestrationLab,
  OrchestrationLabEnvelope,
  OrchestrationPolicy,
} from './types';
import { summarizeLab, estimateThroughput } from './insights';
import { buildRecoveryForecast, summarizeForecast } from './forecasting';

export interface ExecutionTrend {
  readonly runId: LabExecution['id'];
  readonly status: LabExecution['status'];
  readonly startedAt: string;
  readonly endedAt: string | undefined;
  readonly durationMinutes: number;
  readonly stepCoverage: number;
}

export interface LabOpsReport {
  readonly envelopeId: OrchestrationLabEnvelope['id'];
  readonly tenantId: string;
  readonly generatedAt: string;
  readonly signalDensity: number;
  readonly averagePlanScore: number;
  readonly averageConfidence: number;
  readonly topPlan: LabPlan['id'] | undefined;
  readonly riskSummary: string;
  readonly throughput: number;
  readonly forecast: string;
  readonly trends: readonly ExecutionTrend[];
  readonly metadata: { readonly state: string; readonly criticalSignals: number; readonly recommendation: string };
}

interface ExecutionRecord {
  readonly envelope: OrchestrationLabEnvelope;
  readonly executions?: readonly LabExecution[];
}

const clampSignalDensity = (lab: OrchestrationLab): number => {
  const hasSignals = lab.signals.length;
  const hasWindows = Math.max(1, lab.windows.length);
  return hasSignals / hasWindows;
};

const averagePlanScore = (plans: readonly LabPlan[]): number => {
  if (plans.length === 0) {
    return 0;
  }
  const sum = plans.reduce((acc, plan) => acc + plan.score, 0);
  return Number((sum / plans.length).toFixed(3));
};

const averagePlanConfidence = (plans: readonly LabPlan[]): number => {
  if (plans.length === 0) {
    return 0;
  }
  const sum = plans.reduce((acc, plan) => acc + plan.confidence, 0);
  return Number((sum / plans.length).toFixed(3));
};

const planStepMix = (plan: LabPlan): { readonly automated: number; readonly manual: number } => {
  if (plan.steps.length === 0) {
    return { automated: 0, manual: 0 };
  }
  const automated = plan.steps.filter((step) => isAutomatedStep(step)).length;
  const manual = plan.steps.length - automated;
  return { automated, manual };
};

const isAutomatedStep = (step: { readonly owner: string }): boolean => step.owner.toLowerCase() === 'automated';

const criticalSignals = (signals: readonly LabSignal[]): number =>
  signals.filter((signal) => signal.tier === 'critical').length;

const executionTrendForPolicy = (execution: LabExecution, plan: LabPlan): ExecutionTrend => {
  const endedAt = execution.completedAt;
  const durationMinutes = endedAt
    ? Math.max(0, (new Date(endedAt).getTime() - new Date(execution.startedAt).getTime()) / 60000)
    : undefined;

  const mix = planStepMix(plan);
  const stepCoverage = mix.automated / Math.max(1, mix.automated + mix.manual);

  return {
    runId: execution.id,
    status: execution.status,
    startedAt: execution.startedAt,
    endedAt,
    durationMinutes: durationMinutes ? Number(durationMinutes.toFixed(2)) : 0,
    stepCoverage,
  };
};

const mapPlanTrends = (
  record: ExecutionRecord,
  executions: readonly LabExecution[] = [],
): readonly ExecutionTrend[] => {
  const executionByPlan = new Map<string, LabExecution[]>();
  const pool = executions.length > 0 ? executions : (record.executions ?? []);

  for (const execution of pool) {
    const key = String(execution.planId);
    const bucket = executionByPlan.get(key) ?? [];
    bucket.push(execution);
    executionByPlan.set(key, bucket);
  }

  const planById = new Map<string, LabPlan>();
  for (const plan of record.envelope.plans) {
    planById.set(String(plan.id), plan);
  }

  const trends: ExecutionTrend[] = [];
  for (const [planId, byPlan] of executionByPlan) {
    const plan = planById.get(planId);
    if (!plan) {
      continue;
    }
    for (const execution of byPlan) {
      trends.push(executionTrendForPolicy(execution, plan));
    }
  }

  return trends;
};

export const buildOpsReport = (
  lab: OrchestrationLab,
  policy: OrchestrationPolicy,
  selectedPlan: LabPlan | undefined,
  executions: readonly LabExecution[] = [],
  records: readonly ExecutionRecord[] = [],
): LabOpsReport => {
  const scoreInput = lab.plans.map((entry) => ({
    labId: lab.id,
    planId: entry.id,
    readiness: entry.score,
    resilience: entry.confidence,
    complexity: entry.steps.length,
    controlImpact: 0.7,
    timestamp: lab.updatedAt,
  }));

  const insights = summarizeLab(lab, scoreInput, selectedPlan);

  const forecast = buildRecoveryForecast(lab, 6);
  const selected = selectedPlan?.id;
  const filteredRecords = records.filter((record) =>
    record.envelope.id === `env:${lab.id}` || record.envelope.lab.id === lab.id,
  );

  const selectedRecord = filteredRecords[0];
  const trends = selectedRecord
    ? mapPlanTrends(selectedRecord, executions)
    : [];

  const throughput = estimateThroughput(insights.totalSignals === 0 ? [] : lab.plans.map((entry) => ({
    labId: lab.id,
    planId: entry.id,
    readiness: entry.score,
    resilience: entry.score,
    complexity: entry.steps.length,
    controlImpact: 0.9,
    timestamp: lab.updatedAt,
  })));

  const firstFailure = trends.find((trend) => trend.status === 'failed');

  return {
    envelopeId: `env:${lab.id}` as OrchestrationLabEnvelope['id'],
    tenantId: lab.tenantId,
    generatedAt: new Date().toISOString(),
    signalDensity: clampSignalDensity(lab),
    averagePlanScore: averagePlanScore(lab.plans),
    averageConfidence: averagePlanConfidence(lab.plans),
    topPlan: selected,
    riskSummary: `critical=${criticalSignals(lab.signals)}, top=${insights.topPlan ?? 'none'}, decision=${insights.lastDecision ?? 'none'}`,
    throughput,
    forecast: summarizeForecast(forecast),
    trends,
    metadata: {
      state: insights.totalSignals > 0 ? 'active' : 'idle',
      criticalSignals: criticalSignals(lab.signals),
      recommendation: firstFailure ? `has-failure:${firstFailure.runId}` : policy.id,
    },
  };
};
