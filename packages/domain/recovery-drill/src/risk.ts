import type {
  DrillExecutionProfile,
  DrillMode,
  DrillQuery,
  DrillRunContext,
  DrillScenario,
  DrillStatus,
  DrillTemplate,
  DrillTemplate as DrillTemplateLike,
} from './types';
import { clamp, normalizeSecondsLimit, parseISODate, safePercent } from './utils';

export interface DrillRiskProfile {
  readonly templateId: string;
  readonly riskScore: number;
  readonly scenarioRisk: number;
  readonly stepRisk: number;
  readonly timeRisk: number;
  readonly dependencyRisk: number;
  readonly operationalRisk: number;
  readonly label: 'low' | 'medium' | 'high' | 'critical';
}

export interface DrillStepRisk {
  readonly stepId: string;
  readonly constraintRisk: number;
  readonly approvalRisk: number;
  readonly latencyRisk: number;
  readonly score: number;
}

export interface RecoveryDrillRunLike {
  readonly id: string;
  readonly templateId: string;
  readonly status: DrillStatus;
  readonly mode: DrillMode;
  readonly profile: DrillExecutionProfile;
  readonly checkpoints: readonly { at: string; stepId: string; status: string; durationMs: number }[];
  readonly context: {
    readonly runId: string;
    readonly templateId: string;
    readonly runAt: string;
    readonly initiatedBy: string;
    readonly mode: DrillMode;
    readonly approvals: number;
  };
}

export interface DriftedRunRecord {
  readonly run: RecoveryDrillRunLike;
  readonly risk: number;
}

const toRisk = (value: number): number => clamp(Math.round(value * 100) / 100, 0, 100);

const label = (risk: number): DrillRiskProfile['label'] =>
  risk >= 80 ? 'critical' : risk >= 60 ? 'high' : risk >= 40 ? 'medium' : 'low';

const stepRisk = (step: DrillScenario['steps'][number]): DrillStepRisk => {
  const constraints = step.constraints;
  const constraintRisk = constraints.length === 0 ? 0 : constraints.reduce((acc, item) => acc + (100 - item.thresholdPct), 0) / constraints.length;
  const approvalRisk = clamp(step.requiredApprovals * 3, 0, 35);
  const latencyRisk = clamp(step.expectedSeconds / 120, 0, 50);
  const score = toRisk(constraintRisk * 0.35 + approvalRisk + latencyRisk);
  return {
    stepId: step.id,
    constraintRisk: Number(constraintRisk.toFixed(2)),
    approvalRisk: Number(approvalRisk.toFixed(2)),
    latencyRisk: Number(latencyRisk.toFixed(2)),
    score,
  };
};

const scenarioWeight = (scenario: DrillScenario): number => {
  const steps = scenario.steps.length * 2;
  const prerequisitePenalty = scenario.prerequisites.length * 3;
  return clamp(scenario.recoveryImpactScore + steps + prerequisitePenalty, 0, 120);
};

const operational = (template: DrillTemplateLike): number => {
  const modeRisk =
    template.mode === 'automated-chaos' ? 35 : template.mode === 'game-day' ? 28 : template.mode === 'customer-sim' ? 18 : 8;
  const approvals = clamp(template.defaultApprovals * 4, 0, 16);
  const stepWeight = clamp(template.scenarios.reduce((acc, scenario) => acc + scenario.steps.length, 0) * 1.8, 0, 18);
  return toRisk(modeRisk + approvals + stepWeight);
};

const dependencies = (template: DrillTemplateLike): number => {
  const set = new Set<string>();
  for (const scenario of template.scenarios) {
    for (const step of scenario.steps) {
      for (const target of step.targetServices) {
        set.add(target);
      }
    }
  }
  return clamp(set.size * 2, 0, 35);
};

export const computeTemplateRiskProfile = (template: DrillTemplateLike): DrillRiskProfile => {
  const scenarioRisks = template.scenarios.map(scenarioWeight);
  const stepRisks = template.scenarios.flatMap((scenario) => scenario.steps).map(stepRisk);
  const stepRiskScore = stepRisks.length === 0 ? 0 : stepRisks.reduce((acc, value) => acc + value.score, 0) / stepRisks.length;
  const scenarioRisk = scenarioRisks.reduce((acc, value) => acc + value, 0);
  const timeRisk = toRisk(
    template.scenarios.reduce(
      (acc, scenario) => acc + scenario.steps.reduce((stepAcc, step) => stepAcc + normalizeSecondsLimit(step.expectedSeconds, 60 * 20), 0),
      0,
    ),
  );
  const dependencyRisk = dependencies(template);
  const operationalRisk = operational(template);

  const riskScore = toRisk(
    0.25 * scenarioRisk +
      0.25 * stepRiskScore +
      0.15 * timeRisk +
      0.15 * (scenarioRisk / Math.max(1, template.scenarios.length)) +
      0.15 * dependencyRisk +
      0.05 * operationalRisk,
  );

  return {
    templateId: template.id,
    riskScore,
    scenarioRisk: Number(scenarioRisk.toFixed(2)),
    stepRisk: Number(stepRiskScore.toFixed(2)),
    timeRisk,
    dependencyRisk,
    operationalRisk,
    label: label(riskScore),
  };
};

export const computeRunRisk = (run: RecoveryDrillRunLike): number => {
  const started = parseISODate(run.context.runAt);
  const checkpoints = run.checkpoints.length;
  const ageMs = Math.max(0, Date.now() - started);
  const successPenalty = clamp(100 - run.profile.successRate * 100, 0, 60);
  const statusPenalty = run.status === 'failed' ? 42 : run.status === 'degraded' ? 20 : run.status === 'cancelled' ? 12 : 0;
  const agePenalty = clamp(ageMs / 120_000, 0, 15);
  const checkpointPenalty = clamp(checkpoints * 2.5, 0, 15);
  return toRisk(successPenalty + statusPenalty + agePenalty + checkpointPenalty);
};

export const buildRiskCatalog = (templates: readonly DrillTemplateLike[]): ReadonlyMap<string, DrillRiskProfile> => {
  const rows = templates.map((template) => [template.id, computeTemplateRiskProfile(template)] as const);
  return new Map(rows);
};

export const summarizeRiskByTenant = (
  templates: readonly { tenantId: string; template: DrillTemplateLike }[],
): {
  tenantId: string;
  total: number;
  avgRisk: number;
  criticalCount: number;
}[] => {
  const byTenant = new Map<string, { total: number; count: number; critical: number }>();
  for (const entry of templates) {
    const profile = computeTemplateRiskProfile(entry.template);
    const current = byTenant.get(entry.tenantId) ?? { total: 0, count: 0, critical: 0 };
    current.total += profile.riskScore;
    current.count += 1;
    if (profile.label === 'critical') current.critical += 1;
    byTenant.set(entry.tenantId, current);
  }

  return [...byTenant.entries()].map(([tenantId, summary]) => ({
    tenantId,
    total: summary.count,
    avgRisk: summary.count === 0 ? 0 : Number((summary.total / summary.count).toFixed(2)),
    criticalCount: summary.critical,
  }));
};

export const riskFromTemplatesAndRuns = (
  templates: readonly { tenantId: string; templateId: string }[],
  runs: readonly RecoveryDrillRunLike[],
): { tenant: string; riskIndex: number; activeScore: number; templateCoverage: number }[] => {
  const grouped = new Map<string, { runCount: number; risk: number }>();
  for (const run of runs) {
    const tenant = templates.find((entry) => entry.templateId === run.templateId)?.tenantId ?? 'global';
    const current = grouped.get(tenant) ?? { runCount: 0, risk: 0 };
    current.runCount += 1;
    current.risk += computeRunRisk(run);
    grouped.set(tenant, current);
  }

  const templateCoverageByTenant = new Map<string, number>();
  for (const template of templates) {
    const next = (templateCoverageByTenant.get(template.tenantId) ?? 0) + 1;
    templateCoverageByTenant.set(template.tenantId, next);
  }

  return [...grouped.entries()].map(([tenant, value]) => {
    const coverage = templateCoverageByTenant.get(tenant) ?? 0;
    return {
      tenant,
      riskIndex: safePercent(value.risk, Math.max(1, value.runCount * 100)),
      activeScore: value.runCount,
      templateCoverage: coverage,
    };
  });
};

export const driftRuns = (runs: readonly RecoveryDrillRunLike[]): DriftedRunRecord[] =>
  runs
    .map((run) => ({ run, risk: computeRunRisk(run) }))
    .sort((left, right) => right.risk - left.risk)
    .map((item) => ({
      run: item.run,
      risk: item.risk,
    }));

export const buildRunProfileTag = (context: DrillRunContext, profile: DrillExecutionProfile): string =>
  `${context.runId}:${context.mode}:${profile.successRate.toFixed(2)}:${profile.queueDepth}`;
