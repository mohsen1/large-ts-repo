import { normalizeLimit } from '@shared/core';
import {
  CommandRunbook,
  CommandStep,
  CommandRunbookId,
  CommandStepId,
  RecoverySignal,
  OrchestrationPlan,
  RecoverySignalId,
  StressPhase,
  SeverityBand,
  TenantId,
  WorkloadTopology,
  WorkloadTarget,
  WorkloadId,
  createRunbookId,
  createStepId,
  createTenantId,
} from './models';
import { buildReadinessWindows, mergeWindows } from './schedule';
import { buildLayers, mapTargetsToNodes } from './topology-intelligence';

export interface MatrixCell {
  readonly runbookId: CommandRunbookId;
  readonly stepId: CommandStepId;
  readonly score: number;
  readonly phase: StressPhase;
}

export interface ReadinessMatrix {
  readonly tenantId: TenantId;
  readonly cells: readonly MatrixCell[];
  readonly scoreByPhase: ReadonlyArray<{ phase: StressPhase; score: number }>;
  readonly total: number;
}

export interface MatrixPlanInput {
  readonly tenantId: TenantId;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly topology: WorkloadTopology;
}

type MatrixBucket = Map<StressPhase, number>;

const PHASES: readonly StressPhase[] = ['observe', 'isolate', 'migrate', 'verify', 'restore', 'standdown'];

const scoreStep = (step: CommandStep, phaseIndex: number, runbookCriticality: number): number => {
  const base = step.estimatedMinutes + step.prerequisites.length;
  const phaseModifier = phaseIndex + 1;
  return base * phaseModifier * Math.max(1, runbookCriticality);
};

const scoreForSignal = (signals: readonly RecoverySignal[], signalId: RecoverySignalId): number => {
  const hit = signals.find((signal) => signal.id === signalId);
  if (!hit) return 0;
  if (hit.severity === 'critical') return 4;
  if (hit.severity === 'high') return 3;
  if (hit.severity === 'medium') return 2;
  return 1;
};

const buildCell = (runbook: CommandRunbook, phase: StressPhase, scoreBySignal: ReadonlyMap<string, number>): MatrixCell => {
  const runbookPhases = PHASES.indexOf(phase);
  const step = runbook.steps.find((candidate) => candidate.phase === phase) ?? null;
  if (!step) {
    return {
      runbookId: runbook.id,
      stepId: createStepId(`${runbook.id}-${phase}`),
      score: 0,
      phase,
    };
  }

  const requirementScore = step.requiredSignals.reduce((carry, required) => {
    return carry + (scoreBySignal.get(required) ?? 0);
  }, 0);

  return {
    runbookId: runbook.id,
    stepId: step.commandId,
    score: scoreStep(step, runbookPhases, 1) + requirementScore,
    phase,
  };
};

const buildScoreBySignal = (signals: readonly RecoverySignal[]): ReadonlyMap<string, number> => {
  const map = new Map<string, number>();
  for (const signal of signals) {
    map.set(String(signal.id), scoreForSignal(signals, signal.id));
  }
  return map;
};

export const buildReadinessMatrix = (input: MatrixPlanInput): ReadinessMatrix => {
  const scoreBySignal = buildScoreBySignal(input.signals);
  const buckets: MatrixBucket = new Map<StressPhase, number>(PHASES.map((phase) => [phase, 0]));
  const cells: MatrixCell[] = [];

  for (const runbook of input.runbooks) {
    for (const phase of PHASES) {
      const cell = buildCell(runbook, phase, scoreBySignal);
      cells.push(cell);
      buckets.set(phase, (buckets.get(phase) ?? 0) + cell.score);
    }
  }

  const scoreByPhase = PHASES.map((phase) => ({
    phase,
    score: buckets.get(phase) ?? 0,
  }));
  const normalized = normalizeLimit(cells.reduce((carry, cell) => carry + cell.score, 0));

  return {
    tenantId: input.tenantId,
    cells,
    scoreByPhase,
    total: normalized,
  };
};

export const buildCriticalityHeatmap = (plan: OrchestrationPlan): ReadonlyArray<{ runbookId: CommandRunbookId; layer: number; criticality: number }> => {
  const topologyTargets: WorkloadTarget[] = plan.runbooks.map((runbook, index) => ({
    tenantId: createTenantId(plan.tenantId),
    workloadId: (runbook.id as unknown) as WorkloadId,
    commandRunbookId: createRunbookId(`${String(runbook.id)}-${index}`),
    name: `${runbook.name}`,
    criticality: (Math.min(5, Math.max(1, runbook.steps.length)) as WorkloadTarget['criticality']),
    region: 'us-east-1',
    azAffinity: ['a', 'b', 'c'],
    baselineRtoMinutes: 15,
    dependencies: [] as unknown as WorkloadTarget['dependencies'],
  }));

  const layers = buildLayers(mapTargetsToNodes(topologyTargets));

  const layerByNode = new Map<string, number>();
  for (const layer of layers) {
    for (const workloadId of layer.workloadIds) {
      layerByNode.set(workloadId, layer.layer);
    }
  }

  return plan.runbooks.map((runbook) => ({
    runbookId: runbook.id,
    layer: layerByNode.get(runbook.id) ?? 0,
    criticality: Math.min(5, runbook.steps.length + 1),
  }));
};

export const evaluatePlanCoverage = (plan: OrchestrationPlan, band: SeverityBand) => {
  const windows = plan.runbooks.flatMap((runbook) => buildReadinessWindows(runbook, band));
  const merged = mergeWindows(
    windows.map((window) => ({
      startMinute: new Date(window.startAt).getHours() * 60 + new Date(window.startAt).getMinutes(),
      endMinute: new Date(window.endAt).getHours() * 60 + new Date(window.endAt).getMinutes(),
      dayIndex: new Date(window.startAt).getUTCDay(),
    })),
    [],
  );
  const normalizedCoverage = normalizeLimit(merged.reduce((acc, window) => acc + (window.endMinute - window.startMinute), 0));

  return {
    runbookCount: plan.runbooks.length,
    windowCount: windows.length,
    mergedWindowCount: merged.length,
    coverage: normalizedCoverage,
    topologyDependencyRatio:
      plan.dependencies.edges.length === 0
        ? 0
        : normalizeLimit(plan.dependencies.edges.length / Math.max(1, plan.dependencies.nodes.length)),
  };
};

export interface PlanDeltaInput {
  readonly previous: Readonly<OrchestrationPlan | null>;
  readonly candidate: OrchestrationPlan;
  readonly band: any;
}

export const compareReadinessPlans = (input: PlanDeltaInput): {
  readonly changed: boolean;
  readonly message: string;
  readonly deltaRunbookCount: number;
} => {
  const previousRunbookCount = input.previous?.runbooks.length ?? 0;
  const deltaRunbookCount = input.candidate.runbooks.length - previousRunbookCount;

  if (!input.previous) {
    return {
      changed: true,
      message: 'No prior plan available',
      deltaRunbookCount,
    };
  }

  const previousMatrix = buildReadinessMatrix({
    tenantId: input.previous.tenantId,
    runbooks: input.previous.runbooks,
    signals: [],
    topology: {
      tenantId: input.previous.tenantId,
      nodes: [],
      edges: [],
    },
  });
  const candidateMatrix = buildReadinessMatrix({
    tenantId: input.candidate.tenantId,
    runbooks: input.candidate.runbooks,
    signals: [],
    topology: {
      tenantId: input.candidate.tenantId,
      nodes: [],
      edges: [],
    },
  });

  const changed = previousMatrix.total !== candidateMatrix.total || deltaRunbookCount !== 0;
  const message = changed
    ? `Plan changed by ${deltaRunbookCount >= 0 ? '+' : ''}${deltaRunbookCount} runbooks`
    : 'Plan unchanged by matrix score';

  return { changed, message, deltaRunbookCount };
};
