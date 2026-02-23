import {
  CommandRunbook,
  OrchestrationPlan,
  RecoverySignal,
  RecoverySimulationResult,
  SeverityBand,
  TenantId,
  WorkloadTarget,
  WorkloadTopology,
  compileValidationBundle,
  summarizeSignals,
  computePlanMetric,
  summarizeSimulation,
  forecastExecution,
  compareSimulationsForDrift,
} from '@domain/recovery-stress-lab';

export interface LabContext {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly runbooks: readonly CommandRunbook[];
  readonly targets: readonly WorkloadTarget[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly simulation: RecoverySimulationResult | null;
  readonly plan: OrchestrationPlan | null;
}

export interface LabHealthMetrics {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly topology: {
    readonly nodes: number;
    readonly edges: number;
    readonly valid: boolean;
  };
  readonly runbooks: {
    readonly count: number;
    readonly valid: boolean;
  };
  readonly signals: {
    readonly total: number;
    readonly critical: number;
  };
  readonly plan: {
    readonly exists: boolean;
    readonly estimatedMinutes: number;
    readonly windowCoverage: number;
    readonly runbooks: number;
  };
  readonly simulation: {
    readonly hasResult: boolean;
    readonly durationMinutes: number;
    readonly avgConfidence: number;
    readonly maxActive: number;
  };
}

export interface DriftNotice {
  readonly changed: boolean;
  readonly metrics: {
    readonly riskDelta: number;
    readonly slaDelta: number;
    readonly durationDelta: number;
  };
  readonly reason: string;
}

export interface CommandReadinessPlan {
  readonly tenantId: TenantId;
  readonly actionItems: ReadonlyArray<{
    readonly code: string;
    readonly title: string;
    readonly rationale: string;
  }>;
}

export interface AnalysisReport {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly metrics: LabHealthMetrics;
  readonly issues: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
  readonly readinessPlan: CommandReadinessPlan;
  readonly forecast: ReturnType<typeof forecastExecution> | null;
}

const severityWeight = (band: SeverityBand): number => {
  if (band === 'critical') return 4;
  if (band === 'high') return 3;
  if (band === 'medium') return 2;
  return 1;
};

const toWarnings = (issues: readonly string[]) => {
  return issues.map((entry) => `warn:${entry}`);
};

export const evaluateLabContext = (input: LabContext): AnalysisReport => {
  const validation = compileValidationBundle(input.tenantId, {
    topology: input.topology,
    runbooks: input.runbooks,
    signals: input.signals,
    band: input.band,
  });
  const signalDigest = summarizeSignals(input.tenantId, input.signals);
  const topologyValid = validation.breakdown.topology.valid;
  const runbooksValid = validation.breakdown.runbooks.valid;
  const plan = input.plan;
  const simulation = input.simulation;
  const planMetric = plan ? computePlanMetric(plan) : null;
  const simulationSummary = simulation ? summarizeSimulation(input.tenantId, input.band, simulation) : null;
  const forecast = plan && simulation ? forecastExecution(plan, simulation) : null;

  const issues: string[] = validation.issues.map((issue) => `${issue.code}: ${issue.message}`);
  const warnings: string[] = validation.warnings.map((warning) => warning.message);
  const actionItems = [
    ...validation.breakdown.topology.issues,
    ...validation.breakdown.runbooks.issues,
    ...validation.breakdown.signals.issues,
  ].map((entry) => ({
    code: entry.code,
    title: entry.message,
    rationale: entry.remediation,
  }));

  const readinessBias = 10 - Math.min(8, severityWeight(input.band));
  const readinessScore = Math.max(0, Math.min(100, readinessBias * 10 + (runbooksValid ? 30 : -20) + (topologyValid ? 30 : -20)));

  actionItems.push({
    code: 'readiness-score',
    title: `Readiness score: ${readinessScore}`,
    rationale: `Computed from band ${input.band} and validation result`,
  });

  const healthMetrics: LabHealthMetrics = {
    tenantId: input.tenantId,
    band: input.band,
    topology: {
      nodes: input.topology.nodes.length,
      edges: input.topology.edges.length,
      valid: topologyValid,
    },
    runbooks: {
      count: input.runbooks.length,
      valid: runbooksValid,
    },
    signals: {
      total: signalDigest.totalSignals,
      critical: signalDigest.criticalSignals,
    },
    plan: {
      exists: Boolean(plan),
      estimatedMinutes: planMetric?.estimatedMinutes ?? 0,
      windowCoverage: planMetric?.windowCoverage ?? 0,
      runbooks: planMetric?.runbookCount ?? 0,
    },
    simulation: {
      hasResult: Boolean(simulation),
      durationMinutes: simulationSummary?.tickCount ?? 0,
      avgConfidence: simulationSummary?.avgConfidence ?? 0,
      maxActive: simulationSummary?.maxActive ?? 0,
    },
  };

  return {
    tenantId: input.tenantId,
    band: input.band,
    metrics: healthMetrics,
    issues,
    warnings: toWarnings(warnings),
    readinessPlan: { tenantId: input.tenantId, actionItems },
    forecast,
  };
};

export const compareAgainstHistory = (
  tenantId: TenantId,
  current: RecoverySimulationResult,
  previous: RecoverySimulationResult | null,
): DriftNotice => {
  if (!previous) {
    return {
      changed: false,
      metrics: {
        riskDelta: 0,
        slaDelta: 0,
        durationDelta: 0,
      },
      reason: 'No historical simulation baseline',
    };
  }
  const diff = compareSimulationsForDrift(previous, current);
  return {
    changed: diff.changed,
    metrics: diff.metrics,
    reason: diff.reason,
  };
};

export const rankRunbooksByReadiness = (runbooks: readonly CommandRunbook[]): readonly { id: CommandRunbook['id']; score: number }[] => {
  return runbooks
    .map((runbook) => ({
      id: runbook.id,
      score: runbook.steps.reduce((carry, step) => carry + step.estimatedMinutes + step.prerequisites.length * 1.5, 0),
    }))
    .sort((left, right) => left.score - right.score)
    .map((entry) => ({ id: entry.id, score: Math.round(entry.score) }));
};
