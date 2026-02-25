import { mapAsync } from '@shared/typed-orchestration-core';
import type { NoInfer } from '@shared/type-level';
import type { Brand } from '@shared/core';
import type {
  CascadeBlueprint,
  CascadePolicyTemplate,
  CascadePolicyRun,
} from '@domain/recovery-cascade-intelligence';
import {
  buildExperimentMatrix,
  buildExperimentResult,
  buildExperimentVariants,
  ExperimentResult,
  ExperimentVariant,
  normalizeExperimentBlueprint,
  type ExperimentId,
  type ExperimentLabel,
} from '@domain/recovery-cascade-intelligence';
import {
  createAsyncScope,
  emitScopeSignal,
  openScope,
  type SubscriptionScope,
  withScopeAsync,
} from '@shared/cascade-intelligence-runtime';
import { collectTelemetry } from './telemetry.js';
import type { AsyncLikeIterable } from '@shared/typed-orchestration-core';

export type ExperimentRunnerState = 'queued' | 'running' | 'complete' | 'failed';
export interface ExperimentRunInput<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly blueprint: TBlueprint;
  readonly tenantId: string;
  readonly labels?: readonly ExperimentLabel[];
}

export interface ExperimentRunOutput<TBlueprint extends CascadeBlueprint = CascadeBlueprint> {
  readonly id: ExperimentId;
  readonly state: ExperimentRunnerState;
  readonly variantCount: number;
  readonly result: ExperimentResult<TBlueprint>;
  readonly score: number;
  readonly runtime: string;
}

type AsyncScope = Awaited<ReturnType<typeof openScope>>;

export type RunnerMetrics = {
  readonly count: number;
  readonly averageScore: number;
  readonly runtimeMs: number;
};

const scoreByResult = (result: ExperimentResult<unknown>): number => result.score;
const normalizeState = (state: ExperimentRunnerState): ExperimentRunInput['blueprint']['namespace'] => state as never;

const toRunnerId = (tenantId: string): Brand<string, 'ExperimentRunId'> =>
  `run:${tenantId}:${Date.now()}` as Brand<string, 'ExperimentRunId'>;

const eventToString = (entry: { readonly at: string; readonly event: string; readonly details: string }): string =>
  `${entry.at}:${entry.event}:${entry.details}`;

const collectScopeSignals = async <TBlueprint extends CascadeBlueprint>(
  scope: AsyncScope,
  source: AsyncLikeIterable<{ readonly at: string; readonly name: string }>,
): Promise<string[]> => collectTelemetry([], {
  [Symbol.asyncIterator]: async function* () {
    yield { kind: 'stage.start', elapsedMs: 0, at: new Date().toISOString(), stage: 'stage.0' as const };
    for await (const item of source) {
      if (item.name === 'scope') {
        emitScopeSignal(scope as { signal: (name: string) => void }, `${item.at}:seen`);
      }
      yield { kind: 'stage.end', elapsedMs: Math.max(1, Math.round(Math.random() * 25)), at: new Date().toISOString(), stage: 'stage.scope' as const };
    }
  },
});

export const runExperimentCampaign = async <TBlueprint extends CascadeBlueprint>(
  input: ExperimentRunInput<TBlueprint>,
): Promise<ReadonlyArray<ExperimentRunOutput<TBlueprint>>> => {
  const blueprint = normalizeExperimentBlueprint(input.blueprint, input.labels ?? []);
  const variants = buildExperimentVariants(blueprint);
  const outputs: ExperimentRunOutput<TBlueprint>[] = [];
  const matrix = buildExperimentMatrix(blueprint);

  await using scope = await openScope(`experiment:${input.tenantId}:${input.blueprint.policyId}`);
  scope.signal('campaign.start', { count: variants.length, blueprint: String(input.blueprint.namespace) });

  for await (const _entry of mapAsync(matrix.variants, async (variant, index): Promise<ExperimentRunOutput<TBlueprint>> => {
    const started = performance.now();
    const result = buildExperimentResult(blueprint, variant);
    const timeline = await collectScopeSignals(scope, {
      [Symbol.asyncIterator]: async function* () {
        yield { at: new Date().toISOString(), name: `variant:${index}` };
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    });
    const completed = performance.now();
    scope.signal('variant.complete', { variant: variant.id, score: result.score });
    return {
      id: variant.id,
      state: result.score > 0 ? 'complete' : 'failed',
      variantCount: matrix.variants.length,
      result,
      score: result.score,
      runtime: `${completed - started}:${timeline.length}:${normalizeState('complete')}`,
    };
  })) {
    outputs.push(_entry);
  }

  return outputs;
};

export const summarizeExperimentRun = <TBlueprint extends CascadeBlueprint>(runs: readonly ExperimentRunOutput<TBlueprint>[]): RunnerMetrics => {
  if (runs.length === 0) {
    return {
      count: 0,
      averageScore: 0,
      runtimeMs: 0,
    };
  }

  const runtime = runs
    .map((entry) => Number(entry.runtime.split(':')[0]))
    .filter(Number.isFinite)
    .toSorted((left, right) => right - left);
  const averageRuntime = runtime.reduce((acc, value) => acc + value, 0) / runtime.length;
  const averageScore = runs.reduce((acc, entry) => acc + scoreByResult(entry.result), 0) / runs.length;

  return {
    count: runs.length,
    averageScore: Number(averageScore.toFixed(5)),
    runtimeMs: averageRuntime,
  };
};

export const runCampaignWithScope = <TBlueprint extends CascadeBlueprint>(
  input: ExperimentRunInput<TBlueprint>,
): Promise<ReadonlyArray<ExperimentRunOutput<TBlueprint>>> => {
  return withScopeAsync('campaign', async (scope: SubscriptionScope) => {
    scope.signal('campaign.enter', { namespace: input.blueprint.namespace });
    const result = await runExperimentCampaign(input);
    scope.signal('campaign.exit', { complete: result.length });
    return result;
  });
};

export interface CampaignEnvelope<TBlueprint extends CascadeBlueprint> {
  readonly id: ReturnType<typeof toRunnerId>;
  readonly tenantId: string;
  readonly blueprint: TBlueprint;
  readonly variants: readonly ExperimentVariant<TBlueprint>[];
}

export const buildCampaignEnvelope = <TBlueprint extends CascadeBlueprint>(input: {
  tenantId: string;
  blueprint: TBlueprint;
}): CampaignEnvelope<TBlueprint> => {
  const normalized = normalizeExperimentBlueprint(input.blueprint, []);
  return {
    id: toRunnerId(input.tenantId),
    tenantId: input.tenantId,
    blueprint: input.blueprint,
    variants: buildExperimentVariants(normalized),
  };
};

export const runCampaignFromRun = async <TBlueprint extends CascadeBlueprint>(
  input: { run: CascadePolicyRun<TBlueprint>; tenantId: string; },
): Promise<ExperimentRunOutput<TBlueprint>> => {
  const result = await createAsyncScope('campaign.run');
  result.signal('campaignRun.start', { policy: String(input.run.blueprint.policyId) });

  const envelope = normalizeExperimentBlueprint(input.run.blueprint, [
    `run:${input.tenantId}` as ExperimentLabel,
  ]);
  const selected = buildExperimentVariants(envelope)[0];
  if (selected === undefined) {
    result.signal('campaignRun.empty', {});
    await result.close();
    return {
      id: toRunnerId(input.tenantId),
      state: 'failed',
      variantCount: 0,
      result: buildExperimentResult(envelope, {
        id: `fallback:${input.tenantId}` as ExperimentId,
        name: 'fallback' as ExperimentLabel,
        path: [],
        weight: 0,
        signal: 'experiment.fallback' as const,
        enabled: false,
      }),
      score: 0,
      runtime: '0:0:fallback',
    };
  }

  const runResult = buildExperimentResult(envelope, selected);
  const runtime = `${runResult.score}` as string;
  await result.close();
  return {
    id: toRunnerId(input.tenantId),
    state: 'complete',
    variantCount: 1,
    result: runResult,
    score: runResult.score,
    runtime,
  };
};

export const mapCampaignOutcomes = async <TBlueprint extends CascadeBlueprint>(
  input: NoInfer<TBlueprint> extends TBlueprint ? ExperimentRunOutput<TBlueprint>[] : ExperimentRunOutput<TBlueprint>[],
  limit = 16,
): Promise<ReadonlyArray<Readonly<{ readonly key: string; readonly row: string }>>> => {
  const list = input.slice(0, limit);
  return list.map((entry) => ({
    key: entry.id as string,
    row: `${entry.state}::${entry.variantCount}::${entry.runtime}`,
  }));
};
