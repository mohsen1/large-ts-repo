import { createTenantId } from '@domain/recovery-stress-lab';
import {
  buildStrategyWindow,
  buildCompositeWindow,
  buildPipelineState,
  enrichForecast,
  pipeline,
  defaultStrategies,
  type StrategyState,
} from '@domain/recovery-stress-lab-intelligence';
import type { ForecastSummary } from '@domain/recovery-stress-lab-intelligence';
import type { Recommendation } from '@domain/recovery-stress-lab-intelligence';

class RegistryLease {
  constructor(readonly token: string) {}
  [Symbol.dispose](): void {
    // no-op
  }
  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

const isHighPriority = (recommendation: Recommendation): boolean => recommendation.severity === 'critical' || recommendation.severity === 'high';

export const buildRegistryTrace = (tenant: string) => {
  const tenantId = createTenantId(tenant);
  const rootWindow = buildStrategyWindow(tenantId, 1);
  const composite = buildCompositeWindow(tenantId, [tenant, rootWindow]);
  return {
    tenantId,
    rootWindow,
    composite,
  };
};

export const runIntelligenceRegistry = async (tenant: string, summary: ForecastSummary, recommendations: readonly Recommendation[]) => {
  const tenantId = createTenantId(tenant);
  const state = buildPipelineState(tenantId, `registry-${tenant}`);
  const pipelineSteps = defaultStrategies;

  const strategy = await pipeline(
    state,
    summary,
    pipelineSteps,
  );

  const enriched = await enrichForecast(strategy.state, summary, recommendations);

  await using registryLease = new RegistryLease(`${tenant}-lease`);
  const scope = new AsyncDisposableStack();
  try {
    const runState: StrategyState = {
      tenantId,
      runId: `run-${tenant}-registry`,
      phase: 'synthesize',
      startedAt: Date.now(),
      notes: ['registry-run'],
    };
    await using _ = new RegistryLease(`phase-${runState.runId}`);
    return {
      tenantId,
      composite: buildCompositeWindow(tenantId, [runState.runId, enriched.state.runId]),
      score: enriched.state.notes.length + enriched.recommendations.length,
      output: strategy.output,
      strategyState: runState,
    };
  } finally {
    await scope.disposeAsync();
  }
};

export const runRegistryWithPriority = async (
  tenant: string,
  summary: ForecastSummary,
  recommendations: readonly Recommendation[],
): Promise<string> => {
  const result = await runIntelligenceRegistry(tenant, summary, recommendations);
  const topPriority = recommendations.filter(isHighPriority).length;
  return `tenant=${result.tenantId} score=${result.score.toFixed(2)} top=${topPriority}`;
};
