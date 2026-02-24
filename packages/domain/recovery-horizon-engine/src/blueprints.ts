import type {
  HorizonPlan,
  HorizonSignal,
  PluginConfig,
  PluginContract,
  PluginStage,
  JsonLike,
  TimeMs,
  StageLabel,
  RunId,
  PlanId,
} from './types.js';
import { horizonBrand } from './types.js';
import {
  type HorizonRunId,
  type HorizonSessionId,
  type HorizonTenant,
  type HorizonTraceId,
  type PluginContext,
  type PluginFactory,
  type PluginStateMachine,
  createRegistry,
} from '@shared/horizon-lab-runtime';
import { makeStagePlan, mergePlan } from './orchestration.js';

type BrandedRunId = ReturnType<typeof horizonBrand.fromRunId>;
type BrandedPlanId = ReturnType<typeof horizonBrand.fromPlanId>;
type BrandedTime = ReturnType<typeof horizonBrand.fromTime>;

type BlueprintContractInput = PluginConfig<PluginStage, JsonLike>;
type BlueprintContract = PluginContract<PluginStage, BlueprintContractInput, JsonLike>;

type TimelineSignal = {
  readonly index: number;
  readonly stage: PluginStage;
  readonly label: StageLabel<PluginStage>;
  readonly startedAt: BrandedTime;
};

type BlueprintContextMeta<TContext> = {
  readonly tenant: HorizonTenant;
  readonly sessionId: HorizonSessionId;
  readonly traceId: HorizonTraceId;
  readonly startedAt: TimeMs;
  readonly metadata: TContext;
};

type BlueprintQuery<TContext> = {
  readonly contracts: readonly BlueprintContract[];
  readonly context: BlueprintContextMeta<TContext>;
  readonly registry: ReturnType<typeof createRegistry>;
  readonly window: readonly PluginStage[];
  readonly labels: readonly StageLabel<PluginStage>[];
  readonly timeline: readonly TimelineSignal[];
};

export type StagePlanFactory = {
  readonly stage: PluginStage;
  readonly label: StageLabel<PluginStage>;
  readonly weight: number;
};

export type BlueprintStep<TContext> = {
  readonly stage: PluginStage;
  readonly context: TContext;
  readonly config: BlueprintContractInput;
  readonly enabled: boolean;
};

export type BlueprintPlan<TContext> = readonly BlueprintStep<TContext>[];

export type BlueprintContext<TContext> = {
  readonly tenant: HorizonTenant;
  readonly sessionId: HorizonSessionId;
  readonly traceId: HorizonTraceId;
  readonly startedAt: TimeMs;
  readonly metadata: TContext;
};

export interface BlueprintInput<TContext> {
  readonly tenant: HorizonTenant;
  readonly sessionId: HorizonSessionId;
  readonly traceId: HorizonTraceId;
  readonly context: TContext;
  readonly payload: JsonLike;
  readonly stageWindow: readonly PluginStage[];
}

export interface BlueprintOutput<TContext> {
  readonly planId: BrandedPlanId;
  readonly context: BlueprintContext<TContext>;
  readonly contracts: readonly BlueprintContract[];
  readonly metadata: JsonLike & { readonly tenant: HorizonTenant };
}

type StageRecord<TStage extends PluginStage> = {
  readonly stage: TStage;
  readonly label: StageLabel<TStage>;
  readonly startedAt: TimeMs;
  readonly order: number;
};

type BuildOutput = PluginFactory<PluginStage, BlueprintContractInput, HorizonSignal<PluginStage, JsonLike>>;

const toStageLabel = <T extends PluginStage>(stage: T): StageLabel<T> => (`${stage.toUpperCase()}_STAGE` as StageLabel<T>);

const nowStamp = (offset = 0): BrandedTime => horizonBrand.fromTime(Date.now() + offset);

const toTenantId = (value: string): HorizonTenant => value as HorizonTenant;
const toSessionId = (value: string): HorizonSessionId => value as HorizonSessionId;
const toTraceId = (value: string): HorizonTraceId => value as HorizonTraceId;
const toRuntimeRunId = (value: string): HorizonRunId => value as HorizonRunId;
const toRunId = (value: string): BrandedRunId => horizonBrand.fromRunId(value);
const toPlanId = (value: string): BrandedPlanId => horizonBrand.fromPlanId(value);

const asRecord = (value: JsonLike): Record<string, JsonLike> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, JsonLike>;
  }
  return {};
};

const asText = (value: JsonLike, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const toPayloadRecord = (payload: JsonLike): Record<string, JsonLike> => {
  const source = asRecord(payload);
  return {
    tenantId: source.tenantId,
    ...source,
  };
};

const withSeedContext = (payload: JsonLike, stage: PluginStage, order: number): JsonLike => {
  const seeded = toPayloadRecord(payload);
  return {
    ...seeded,
    stage,
    order,
    seed: true,
  };
};

const brandContractId = (stage: PluginStage, seed: string): BlueprintContract['id'] =>
  (`plugin:${stage}:${seed}` as BlueprintContract['id']);

const buildSignal = (
  stage: PluginStage,
  input: BlueprintContractInput,
  order: number,
  runId: RunId,
): HorizonSignal<PluginStage, JsonLike> => ({
  id: horizonBrand.fromPlanId(`signal:${stage}:${input.pluginKind}:${order}:${runId}`),
  kind: stage,
  payload: input.payload,
  input: {
    version: '1.0.0',
    runId,
    tenantId: asText(toPayloadRecord(input.payload).tenantId, 'tenant-001'),
    stage,
    tags: ['blueprint', stage],
    metadata: {
      source: 'blueprint',
      stage,
      order,
    },
  },
  severity: 'low',
  startedAt: horizonBrand.fromDate(new Date().toISOString()),
});

const asMachine = (): PluginStateMachine<BlueprintContractInput, HorizonSignal<PluginStage, JsonLike>> => ({
  initialize(context: PluginContext<BlueprintContractInput>) {
    const tenant = asText(toPayloadRecord(context.payload.payload).tenantId, 'tenant-001');
    if (!tenant) {
      throw new Error('missing tenantId in blueprint signal payload');
    }
  },
  async next(state: BlueprintContractInput) {
    return buildSignal(state.pluginKind, state, 0, asRunId(state.payload));
  },
  finalize(state: BlueprintContractInput) {
    return buildSignal(state.pluginKind, state, -1, asRunId(state.payload));
  },
});

const asRunId = (payload: JsonLike): RunId => {
  const candidate = asText(toPayloadRecord(payload).tenantId, 'seed');
  return horizonBrand.fromRunId(`run:${candidate}:${Date.now()}`);
};

const toFactory = (contract: BlueprintContract): BuildOutput => {
  const context = {
    tenant: toTenantId(asText(toPayloadRecord(contract.defaults.payload).tenantId, 'tenant-001')),
    runId: toRunId(`factory:${contract.kind}:${Date.now()}`),
    sessionId: toSessionId(`session:${contract.kind}:${Date.now()}`),
    metadata: { contract: contract.id, stage: contract.kind, createdAt: nowStamp() },
    payload: contract.defaults,
  };

  const machine = asMachine();
  machine.initialize(context as unknown as PluginContext<BlueprintContractInput>);

  const metadataSchema = contract.capabilities.reduce<Record<string, Record<string, JsonLike>>>((acc, capability) => {
    acc[capability.key] = {
      kind: capability.key,
      description: capability.description,
      ...capability.configSchema,
    };
    return acc;
  }, {});

  return {
    kind: contract.kind,
    label: toStageLabel(contract.kind),
    stageLabel: toStageLabel(contract.kind),
    describe: () => `${contract.kind}@${contract.id}`,
    create: (input: BlueprintContractInput) => {
      const initialized = asMachine();
      initialized.initialize({
        tenant: context.tenant,
        runId: toRuntimeRunId(`${context.runId}`),
        sessionId: context.sessionId,
        metadata: context.metadata,
        payload: input,
      });
      return initialized;
    },
    defaults: contract.defaults,
    metadataSchema,
  };
};

const fromPayloadToConfig = (stage: PluginStage, payload: JsonLike): BlueprintContractInput => ({
  pluginKind: stage,
  payload,
  retryWindowMs: horizonBrand.fromTime(1200),
});

export const normalizePluginContract = (
  contract: PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>,
): PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike> => ({
  ...contract,
  id: brandContractId(contract.kind, contract.id),
});

export const composeBlueprintContracts = (
  input: {
    readonly stageWindow: readonly PluginStage[];
    readonly payload: JsonLike;
    readonly tenant: HorizonTenant;
    readonly sessionId: HorizonSessionId;
    readonly traceId: HorizonTraceId;
  },
  contracts: readonly BlueprintContract[] = [],
): BlueprintQuery<typeof input.payload> => {
  const context = {
    tenant: input.tenant,
    sessionId: input.sessionId,
    traceId: input.traceId,
    startedAt: nowStamp(),
    metadata: input.payload,
  } satisfies BlueprintContextMeta<typeof input.payload>;

  const seeds = input.stageWindow.map<(BlueprintContract)>((stage, order) => {
    const seededPayload = withSeedContext(input.payload, stage, order);
    return {
      kind: stage,
      id: brandContractId(stage, `seed-${order}`),
      capabilities: [{ key: stage, description: `seed:${stage}`, configSchema: {} }],
      defaults: fromPayloadToConfig(stage, seededPayload),
      execute: async (inputs: readonly BlueprintContractInput[]) =>
        Promise.resolve(
          inputs.map((entry, signalIndex) =>
            buildSignal(stage, entry, signalIndex, asRunId(entry.payload)),
          ),
        ),
    };
  });

  const selected = contracts.length ? contracts : seeds;
  const registry = createRegistry(selected.map(toFactory));
  const timeline = input.stageWindow.map<StageRecord<PluginStage>>((stage, index) => ({
    stage,
    label: toStageLabel(stage),
    startedAt: nowStamp(index * 17),
    order: index,
  }));

  return {
    context,
    timeline: timeline.map((entry, index) => ({
      index,
      stage: entry.stage,
      label: entry.label,
      startedAt: entry.startedAt,
    })),
    labels: timeline.map((entry) => entry.label),
    contracts: selected,
    registry,
    window: input.stageWindow,
  };
};

export const buildPlanFromBlueprint = <TContext>(
  tenant: HorizonTenant,
  sessionId: HorizonSessionId,
  input: BlueprintInput<TContext>,
  output: BlueprintOutput<TContext>,
): HorizonPlan => {
  const head = input.stageWindow[0] ?? 'ingest';
  const timeline = makeStagePlan(input.tenant, output.planId, input.stageWindow);
  const reverseWindow = [...input.stageWindow].reverse();
  const adjacent = makeStagePlan(input.tenant, toPlanId(`adjacent:${output.planId}`), reverseWindow);
  const merged = mergePlan(timeline, adjacent);

  return {
    id: output.planId,
    tenantId: tenant,
    startedAt: nowStamp(),
    pluginSpan: {
      stage: head,
      label: toStageLabel(head),
      startedAt: nowStamp(),
      durationMs: horizonBrand.fromTime(merged.timeline.length * 11),
    },
    payload: {
      merged,
      tenant,
      sessionId,
      ...toPayloadRecord(output.metadata),
    },
  };
};

export const mergeBlueprintSignals = (
  left: readonly HorizonSignal<PluginStage, JsonLike>[],
  right: readonly HorizonSignal<PluginStage, JsonLike>[],
) => {
  const dedupe = new Map<string, HorizonSignal<PluginStage, JsonLike>>();
  const merged = [...left, ...right];
  for (const signal of merged) {
    dedupe.set(signal.id, signal);
  }
  const deduped = [...dedupe.values()];
  return {
    deduped,
    total: deduped.length,
    unique: new Set(deduped.map((signal) => signal.kind)).size,
  };
};

export const traceIdSuffix = (tenant: string, order: number): string => `${tenant}-${order.toString().padStart(3, '0')}`;

export const validateBlueprint = <TContext>(
  plans: readonly BlueprintOutput<TContext>[],
) => {
  const issues = plans.reduce<
    {
      path: readonly string[];
      message: string;
      severity: 'error' | 'warn';
    }[]
  >((acc, plan, order) => {
    if (!plan.contracts.length) {
      acc.push({
        path: ['blueprint', String(order), 'contracts'],
        message: 'no contracts for blueprint',
        severity: 'error',
      });
    }
    if (!plan.metadata?.tenant) {
      acc.push({
        path: ['blueprint', String(order), 'tenant'],
        message: 'missing tenant metadata',
        severity: 'warn',
      });
    }
    return acc;
  }, []);

  return issues.length ? { ok: false, errors: issues } : { ok: true, value: true };
};

export const summarizeBlueprint = <TContext>(plan: BlueprintOutput<TContext>) => ({
  planId: plan.planId,
  tenant: plan.context.tenant,
  session: plan.context.sessionId,
  labels: plan.contracts.map((contract) => toStageLabel(contract.kind)),
  stageCount: plan.contracts.length,
  started: plan.context.startedAt,
}) satisfies {
  readonly planId: BrandedPlanId;
  readonly tenant: HorizonTenant;
  readonly session: HorizonSessionId;
  readonly labels: readonly StageLabel<PluginStage>[];
  readonly stageCount: number;
  readonly started: TimeMs;
};

export const blueprintTimeline = <TContext>(output: BlueprintOutput<TContext>) =>
  output.contracts.map((contract, index) => ({
    index,
    stage: contract.kind,
    label: toStageLabel(contract.kind),
  }));
