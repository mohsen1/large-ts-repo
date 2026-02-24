import { createWindowId, createPluginId, type ForecastSummary, type Recommendation, type TenantId } from './models';
import type { ForecastPoint, ForecastSummary as FullForecastSummary } from './forecast-engine';

export interface StrategyState {
  readonly tenantId: TenantId;
  readonly runId: string;
  readonly phase: 'ingest' | 'synthesize' | 'publish';
  readonly startedAt: number;
  readonly notes: readonly string[];
}

export interface PipelineStrategy<TInput, TOutput> {
  readonly id: string;
  readonly name: string;
  readonly kind: `strategy/${string}`;
  transform: (state: StrategyState, input: TInput) => Promise<TOutput>;
}

export type StrategyResult<TPipeline extends readonly PipelineStrategy<any, any>[], TInput> =
  TPipeline extends readonly [infer THead, ...infer TTail]
    ? THead extends PipelineStrategy<TInput, infer TMid>
      ? TTail extends readonly PipelineStrategy<any, any>[]
        ? StrategyResult<TTail, TMid>
        : TMid
      : never
    : TInput;

export const toSortedRecommendations = (
  recommendations: readonly Recommendation[],
  tenantId: TenantId,
): readonly Recommendation[] => {
  return [...recommendations].toSorted((left, right) => {
    if (left.severity === right.severity) {
      return left.estimatedMitigationMinutes - right.estimatedMitigationMinutes;
    }
    return left.severity.localeCompare(right.severity);
  });
};

export const buildStrategyWindow = (tenantId: TenantId, index: number): string => {
  return `${tenantId}:strategy:${Math.trunc(index)}`;
};

export const buildCompositeWindow = (tenantId: TenantId, segments: readonly string[]): string => {
  return segments.reduce((acc, segment, index) => `${acc}${index === 0 ? '' : '|'}${segment}`, `${tenantId}:composite`);
};

export const scoreByWeight = ({ recommendations, summary }: { recommendations: readonly Recommendation[]; summary: ForecastSummary }): number => {
  const severityScore = recommendations.reduce((acc, recommendation) => {
    switch (recommendation.severity) {
      case 'critical':
        return acc + 1.0;
      case 'high':
        return acc + 0.75;
      case 'medium':
        return acc + 0.4;
      default:
        return acc + 0.1;
    }
  }, 0);

  const forecastWeight = summary.total > 0 ? summary.average : 0.5;
  return Math.min(1, Math.max(0, 0.25 + severityScore * 0.03 + forecastWeight * 0.7));
};

export const buildPipelineState = (tenantId: TenantId, runId: string): StrategyState => ({
  tenantId,
  runId,
  phase: 'ingest',
  startedAt: Date.now(),
  notes: ['strategy pipeline initialized'],
});

const ensureWindowId = (value: string): string => createWindowId(value) as unknown as string;

export const enrichForecast = async (
  state: StrategyState,
  summary: FullForecastSummary,
  recommendations: readonly Recommendation[],
): Promise<{ readonly state: StrategyState; readonly recommendations: readonly Recommendation[]; readonly score: number }> => {
  const runWindow = ensureWindowId(`${state.tenantId}:window:${state.runId}`);
  const score = scoreByWeight({ summary, recommendations: toSortedRecommendations(recommendations, state.tenantId) });
  const strategyWindow = buildStrategyWindow(state.tenantId, summary.total);
  const composite = buildCompositeWindow(state.tenantId, [runWindow, strategyWindow, String(score)]);

  const strategyId = createPluginId(`strategy-${state.runId}`).toString();

  const notes = [
    `strategy=${strategyId}`,
    `window=${composite}`,
    `forecastPoints=${summary.total}`,
    `score=${score.toFixed(4)}`,
  ] as const;

  return {
    state: {
      ...state,
      phase: 'synthesize',
      notes: [...state.notes, ...notes],
    },
    recommendations: recommendations.toSorted((left, right) => right.estimatedMitigationMinutes - left.estimatedMitigationMinutes),
    score,
  };
};

export const pipeline = async <
  const TInput,
  const TOutput,
  const TSteps extends readonly PipelineStrategy<TInput, any>[],
>(
  state: StrategyState,
  input: TInput,
  steps: TSteps,
): Promise<{
  output: StrategyResult<TSteps, TInput>;
  state: StrategyState;
}> => {
  let cursor: unknown = input;
  let currentState = {
    ...state,
    phase: 'synthesize' as StrategyState['phase'],
    notes: [...state.notes, `pipeline-start:${steps.length}`],
  };

  for (const step of steps) {
    const before = currentState;
    const output = await step.transform(
      {
        ...before,
        notes: [...before.notes, `step:${step.id}`],
      },
      cursor as never,
    );
    currentState = {
      ...before,
      notes: [...before.notes, `step:${step.id}:done`],
      phase: before.phase,
    };
    cursor = output;
  }

  return {
    output: cursor as StrategyResult<TSteps, TInput>,
    state: { ...currentState, phase: 'publish' },
  };
};

export const defaultStrategies =
  [
    {
      id: 'strategy:normalize',
      name: 'Normalize',
      kind: 'strategy/normalize',
      transform: async (state: StrategyState, input: FullForecastSummary) => ({
        ...input,
        tenantId: state.tenantId,
      }),
    },
    {
      id: 'strategy:annotate',
      name: 'Annotate',
      kind: 'strategy/annotate',
      transform: async (state: StrategyState, input: FullForecastSummary) => ({
        ...input,
        startedAt: state.startedAt,
      }),
    },
    {
      id: 'strategy:publish',
      name: 'Publish',
      kind: 'strategy/publish',
      transform: async (state: StrategyState, input: FullForecastSummary) => ({
        ...input,
        publishedBy: state.runId,
      }),
    },
  ] as const satisfies readonly PipelineStrategy<FullForecastSummary, FullForecastSummary>[];
