import {
  type RecoverySimulationResult,
  type OrchestrationPlan,
  type CommandRunbook,
  type RecoverySignal,
  type TenantId,
  type WorkloadTopology,
  type CommandRunbookId,
  type WorkloadTopologyNode,
  type WorkloadTopologyEdge,
  createTenantId,
  createSignalId,
  type ForecastSummary,
  type Recommendation,
} from './models';
import {
  buildCompositeWindow,
  type StrategyState,
  enrichForecast,
} from './strategy-pipeline';
import {
  type ForecastPoint,
  collectForecasts,
  summarizeRecommendations,
  type ForecastSummary as InternalForecastSummary,
} from './forecast-engine';
import type { StageSignal } from './models';

export interface IntelligenceInputs {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan;
  readonly simulation: RecoverySimulationResult;
  readonly topology: WorkloadTopology;
}

export interface IntelligenceBundle {
  readonly tenantId: TenantId;
  readonly forecasts: readonly ForecastPoint[];
  readonly summary: ForecastSummary;
  readonly recommendations: readonly Recommendation[];
  readonly strategyWindow: string;
}

export interface IntelligenceSignalTransform {
  readonly signalId: RecoverySignal['id'];
  readonly class: RecoverySignal['class'];
  readonly severity: RecoverySignal['severity'];
}

const normalizeSignalSource = (signalId: string): string =>
  signalId.includes(':') ? signalId.split(':').slice(-1).join('') : signalId;

export const toStageSignals = (tenantId: TenantId, signals: readonly RecoverySignal[]): readonly StageSignal[] =>
  signals.map((signal) => ({
    signal: signal.id,
    tenantId,
    signalClass: signal.class,
    severity: signal.severity,
    score: normalizeSignalWeight(signal),
    createdAt: signal.createdAt.length,
    source: normalizeSignalSource(signal.title),
  }));

export const inferSignalClassWeight = (phase: string): number => {
  if (phase === 'observe' || phase === 'isolate') {
    return 0.95;
  }
  if (phase === 'migrate' || phase === 'restore') {
    return 0.72;
  }
  return 0.35;
};

export const toSignalTransforms = (runbooks: readonly CommandRunbook[]): readonly IntelligenceSignalTransform[] => {
  const map = new Map<string, IntelligenceSignalTransform>();

  for (const runbook of runbooks) {
    for (const step of runbook.steps) {
      const base = inferSignalClassWeight(step.phase);
      const phaseClass =
        base > 0.8
          ? 'availability'
          : base > 0.6
            ? 'performance'
            : 'integrity';

      for (const signalId of step.requiredSignals) {
        if (!signalId) {
          continue;
        }

        map.set(signalId, {
          signalId,
          class: phaseClass,
          severity: base > 0.85 ? 'critical' : base > 0.75 ? 'high' : base > 0.5 ? 'medium' : 'low',
        });
      }
    }
  }

  return [...map.values()];
};

const normalizeSignalWeight = (signal: RecoverySignal): number => {
  const classSignal = signal.class;
  const base =
    classSignal === 'availability'
      ? 0.95
      : classSignal === 'performance'
        ? 0.65
        : classSignal === 'integrity'
          ? 0.45
          : 0.25;
  return base;
};

const mapRunbookToSyntheticSignals = (runbooks: readonly CommandRunbook[]): readonly RecoverySignal[] =>
  runbooks.flatMap((runbook) =>
    runbook.steps.flatMap((step) =>
      step.requiredSignals.map((requiredSignal, index) => ({
        id: requiredSignal,
        class: (toSignalTransforms([runbook]).find((item) => item.signalId === requiredSignal)?.class ?? 'availability') as RecoverySignal['class'],
        severity: (toSignalTransforms([runbook]).find((item) => item.signalId === requiredSignal)?.severity ?? 'medium') as RecoverySignal['severity'],
        title: `${runbook.name}:${step.title}:${index}`,
        createdAt: step.title,
        metadata: {
          runbook: runbook.id,
          commandId: step.commandId,
        },
      })),
    ),
  );

export const normalizeRecommendationTimeline = async (
  inputs: IntelligenceInputs,
): Promise<IntelligenceBundle> => {
  const tenantId = inputs.tenantId;
  const runbookSignals = mapRunbookToSyntheticSignals(inputs.plan.runbooks);
  const signals = toStageSignals(tenantId, runbookSignals);

  const forecastSignals = await collectForecasts(signals, tenantId);
  const forecastSummary: InternalForecastSummary = {
    tenantId,
    total: forecastSignals.length,
    average: forecastSignals.reduce((count, point) => count + point.forecast, 0) / Math.max(1, forecastSignals.length),
    min: forecastSignals.reduce((min, point) => Math.min(min, point.forecast), Number.POSITIVE_INFINITY),
    max: forecastSignals.reduce((max, point) => Math.max(max, point.forecast), Number.NEGATIVE_INFINITY),
    points: forecastSignals,
  };

  const recommendations = summarizeRecommendations(forecastSummary);
  const strategyState: StrategyState = {
    tenantId,
    runId: `${tenantId}:default`,
    phase: 'ingest',
    startedAt: Date.now(),
    notes: ['bootstrap'],
  };

  const enriched = await enrichForecast(strategyState, forecastSummary, recommendations);

  const nodes = pickTopologyNodes(inputs.topology.nodes);
  const edges = pickTopologyEdges(inputs.topology.edges);
  const summaryWindow = buildCompositeWindow(tenantId, [
    inputs.simulation.endedAt,
    inputs.simulation.startedAt,
    String(nodes.length),
    String(edges.length),
    inputs.plan.scenarioName,
  ]);

  return {
    tenantId,
    forecasts: forecastSignals,
    summary: {
      tenantId,
      total: forecastSummary.total,
      average: forecastSummary.average,
      min: forecastSummary.min,
      max: forecastSummary.max,
      points: forecastSummary.points,
    },
    recommendations: enriched.recommendations,
    strategyWindow: summaryWindow,
  };
};

const pickTopologyNodes = (
  nodes: readonly WorkloadTopologyNode[],
): readonly WorkloadTopologyNode[] => nodes.toSorted((left, right) => right.criticality - left.criticality);

const pickTopologyEdges = (
  edges: readonly WorkloadTopologyEdge[],
): readonly WorkloadTopologyEdge[] => edges.toSorted((left, right) => right.coupling - left.coupling);

export const buildIntelligenceSnapshot = (recommendations: readonly Recommendation[]): readonly Record<string, unknown>[] =>
  recommendations.map((recommendation, index) => ({
    sequence: index,
    code: recommendation.code,
    severity: recommendation.severity,
    phase: recommendation.phase,
    rationaleLength: recommendation.rationale.length,
    mitigation: recommendation.estimatedMitigationMinutes,
  }));

export const mapByPhase = (recommendations: readonly Recommendation[]): ReadonlyMap<string, readonly Recommendation[]> => {
  const grouped = new Map<string, Recommendation[]>();

  for (const recommendation of recommendations) {
    const values = grouped.get(recommendation.phase) ?? [];
    values.push(recommendation);
    grouped.set(recommendation.phase, values);
  }

  return new Map(grouped);
};

export const deriveSyntheticSignals = (
  tenantId: string,
  count: number,
  runbooks: readonly CommandRunbookId[],
): readonly RecoverySignal[] =>
  Array.from({ length: count }).map((_, index) => ({
    id: createSignalId(`${tenantId}-${index}:signal`),
    class: index % 3 === 0 ? 'availability' : index % 3 === 1 ? 'performance' : 'integrity',
    severity: index % 4 === 0 ? 'critical' : index % 4 === 1 ? 'high' : index % 4 === 2 ? 'medium' : 'low',
    title: `synthetic-${runbooks[index % Math.max(1, runbooks.length)]}`,
    createdAt: new Date(Date.now() - index * 1000).toISOString(),
    metadata: { synthetic: true, tenantId },
  }));
