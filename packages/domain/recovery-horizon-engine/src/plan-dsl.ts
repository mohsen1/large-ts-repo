import { z } from 'zod';
import type { NoInfer } from '@shared/type-level';
import type {
  PluginStage,
  PluginConfig,
  PluginContract,
  HorizonPlan,
  TimeMs,
  StageLabel,
  HorizonSignal,
  JsonLike,
  PlanId,
  RunId,
} from './types.js';
import { horizonBrand } from './types.js';

export type StageTuple<T extends readonly PluginStage[]> = readonly [...T];

export type StageLabelTuple<T extends readonly PluginStage[]> = {
  readonly [K in keyof T]: T[K] extends PluginStage ? StageLabel<T[K]> : never;
};

export interface StepContext {
  readonly tenantId: string;
  readonly owner: string;
  readonly startedAt: TimeMs;
  readonly tags: readonly string[];
}

export interface DSLStep<TKind extends PluginStage, TPayload = JsonLike> {
  readonly stage: TKind;
  readonly label: StageLabel<TKind>;
  readonly contract: PluginContract<TKind, PluginConfig<TKind, TPayload>, TPayload>;
  readonly config: PluginConfig<TKind, TPayload>;
  readonly weight: number;
  readonly timeoutMs: number;
  readonly enabled: boolean;
  execute(input: PluginConfig<TKind, TPayload>): Promise<HorizonSignal<TKind, TPayload>[]>;
}

export interface DSLPlanSpec<T extends readonly PluginStage[]> {
  readonly tenantId: string;
  readonly namespace: string;
  readonly stages: StageTuple<T>;
  readonly defaultOwner: string;
  readonly tags: readonly string[];
  readonly labelByStage: StageLabelTuple<T>;
}

export interface DSLPlan<T extends readonly PluginStage[]> {
  readonly planId: PlanId;
  readonly runId: RunId;
  readonly tenantId: string;
  readonly namespace: string;
  readonly stages: StageTuple<T>;
  readonly owner: string;
  readonly createdAt: TimeMs;
  readonly signature: string;
}

const nowMs = (): TimeMs => Date.now() as TimeMs;

const pluginConfigSchema = <TKind extends PluginStage>(kind: TKind) =>
  z.object({
    pluginKind: z.literal(kind),
    payload: z.record(z.unknown()),
    retryWindowMs: z.number().nonnegative().int(),
  });

const brandStageContract = <TKind extends PluginStage>(owner: string, stage: TKind) => {
  return `${owner}:${stage}` as PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>['id'];
};

export const buildStep = <
  TKind extends PluginStage,
  TPayload = JsonLike,
>(
  input: {
    stage: TKind;
    owner: string;
    payload: TPayload;
    timeoutMs?: number;
    enabled?: boolean;
    execute: (config: PluginConfig<TKind, TPayload>) => Promise<HorizonSignal<TKind, TPayload>[]>;
  },
): DSLStep<TKind, TPayload> => {
  const schema = pluginConfigSchema(input.stage);
  const contractPayload = {
    pluginKind: input.stage,
    payload: input.payload,
    retryWindowMs: horizonBrand.fromTime(input.timeoutMs ?? 250),
  };

  const parsed = schema.parse(contractPayload);
  const normalizedConfig = {
    pluginKind: input.stage,
    payload: input.payload,
    retryWindowMs: horizonBrand.fromTime(parsed.retryWindowMs as number),
  } satisfies PluginConfig<TKind, TPayload>;

  return {
    stage: input.stage,
    label: `${input.stage.toUpperCase()}_STAGE` as StageLabel<TKind>,
    contract: {
      kind: input.stage,
      id: brandStageContract(input.owner, input.stage),
      capabilities: [
        {
          key: input.stage,
          description: `${input.owner}.${input.stage}`,
          configSchema: {
            retryWindowMs: 'number',
            payload: 'object',
          },
        },
      ],
      defaults: normalizedConfig,
      execute: async (entryInput) => {
        if (!entryInput.length) {
          return [];
        }
        const first = entryInput[0];
        if (!first || first.pluginKind !== input.stage) {
          return [];
        }
        return input.execute(first as PluginConfig<TKind, TPayload>);
      },
    },
    config: normalizedConfig,
    weight: 1,
    timeoutMs: input.timeoutMs ?? 300,
    enabled: input.enabled ?? true,
    execute: async (next) => input.execute(next),
  };
};

export const buildBlueprintFromSteps = <T extends readonly PluginStage[]>(
  spec: NoInfer<DSLPlanSpec<T>>,
  _steps: readonly DSLStep<T[number], JsonLike>[],
): DSLPlan<T> => {
  const planSignature = spec.stages.map((stage, index) => `${stage}#${index}`).join('|');

  return {
    planId: horizonBrand.fromPlanId(`plan-${spec.tenantId}-${spec.namespace}-${Date.now()}`),
    runId: horizonBrand.fromRunId(`run-${spec.tenantId}-${Date.now()}`),
    tenantId: spec.tenantId,
    namespace: spec.namespace,
    stages: spec.stages,
    owner: spec.defaultOwner,
    createdAt: nowMs(),
    signature: planSignature,
  };
};

export const makePipeline = <T extends readonly PluginStage[]>() => <
  TSpec extends {
    readonly stages: StageTuple<T>;
    readonly build: () => readonly DSLStep<T[number], JsonLike>[];
  },
  TContext extends StepContext,
>(
  spec: TSpec,
  context: TContext,
): { readonly config: TContext; readonly stages: StageTuple<T> } => {
  const runtimeSteps = spec.build();
  const expected = spec.stages.join('|');
  const actual = runtimeSteps.map((step) => step.stage).join('|');
  if (expected !== actual) {
    throw new Error(`pipeline mismatch ${expected} != ${actual}`);
  }

  return {
    config: {
      ...context,
      tags: [...context.tags],
    },
    stages: spec.stages,
  };
};

export const normalizePlanFromBlueprint = (
  blueprint: DSLPlan<StageTuple<PluginStage[]>>,
  contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
): HorizonPlan => {
  const first = blueprint.stages.at(0) ?? 'ingest';
  return {
    id: blueprint.planId,
    tenantId: blueprint.tenantId,
    startedAt: nowMs(),
    pluginSpan: {
      stage: first,
      label: `${first.toUpperCase()}_STAGE` as StageLabel<PluginStage>,
      startedAt: nowMs(),
      durationMs: horizonBrand.fromTime(blueprint.stages.length * 10),
    },
    payload: {
      tenantId: blueprint.tenantId,
      runId: blueprint.runId,
      signature: blueprint.signature,
      namespace: blueprint.namespace,
      stages: [...blueprint.stages],
      owner: blueprint.owner,
      contractCount: contracts.length,
      contractKinds: [...new Set(contracts.map((contract) => contract.kind))],
    },
  };
};

export const inferStageStats = <T extends readonly PluginSignalLikeRecord[]>(
  steps: NoInfer<T>,
): { readonly stage: PluginSignalLikeRecord['kind']; readonly count: number }[] => {
  const totals = steps.reduce<Record<PluginStage, number>>((acc, step) => {
    acc[step.kind] = (acc[step.kind] ?? 0) + 1;
    return acc;
  }, {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  });

  return (Object.entries(totals) as [PluginStage, number][]).map(([kind, count]) => ({ stage: kind, count }));
};

export const compilePlanPlan = <T extends readonly PluginStage[]>(
  stages: StageTuple<T>,
  owner: string,
): DSLPlanSpec<T> => ({
  tenantId: 'tenant-001',
  namespace: 'default',
  stages,
  defaultOwner: owner,
  tags: ['compile', owner],
  labelByStage: stages.map((entry) => `${entry.toUpperCase()}_STAGE`) as StageLabelTuple<T>,
});

type PluginSignalLikeRecord = HorizonSignal<PluginStage, JsonLike>;
