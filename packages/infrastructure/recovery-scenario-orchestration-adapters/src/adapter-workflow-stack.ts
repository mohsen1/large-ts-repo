import {
  createAdapterRegistry,
  type AdapterManifest,
  type AdapterRegistry,
  type AdapterRegistryKey,
} from './adapter-registry.js';
import type {
  PluginContract,
  PluginConfig,
  PluginStage,
  HorizonSignal,
  JsonLike,
  TimeMs,
  PlanId,
} from '@domain/recovery-horizon-engine';
import { horizonBrand } from '@domain/recovery-horizon-engine';
import { RecursivePath } from '@shared/type-level';

export type WorkflowMode = 'single' | 'multi';

export interface WorkflowManifest<TKind extends PluginStage, TPayload = JsonLike>
  extends AdapterManifest<TKind, TPayload> {
  readonly run: (payload: HorizonSignal<TKind, JsonLike>, abortSignal: AbortSignal) => Promise<readonly HorizonSignal<TKind, JsonLike>[]>;
}

export interface StageWorkflow<TKind extends PluginStage, TPayload = JsonLike> {
  readonly kind: TKind;
  readonly manifest: WorkflowManifest<TKind, TPayload>;
}

export interface WorkflowStackReport<TKind extends PluginStage, TPayload = JsonLike> {
  readonly tenantId: string;
  readonly stages: readonly TKind[];
  readonly runs: number;
  readonly emitted: number;
  readonly startedAt: TimeMs;
  readonly finishedAt: TimeMs;
  readonly logs: readonly string[];
}

export interface WorkflowStackInput<TKind extends PluginStage, TPayload = JsonLike> {
  readonly tenantId: string;
  readonly workflows: readonly StageWorkflow<TKind, TPayload>[];
  readonly mode: WorkflowMode;
}

type StackEvent = { readonly time: TimeMs; readonly message: string };

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

const asLog = (value: unknown): string =>
  value instanceof Error ? `${value.name}:${value.message}` : `${value}`;

const collectStages = <TKind extends PluginStage>(workflows: readonly StageWorkflow<TKind, JsonLike>[]): readonly TKind[] =>
  workflows.map((entry) => entry.kind);

const toManifestMap = <TKind extends PluginStage, TPayload>(
  workflows: readonly StageWorkflow<TKind, TPayload>[],
): readonly AdapterManifest<TKind, TPayload>[] =>
  workflows.map((entry) => ({
    key: entry.manifest.key,
    kind: entry.kind,
    tags: entry.manifest.tags,
    route: entry.manifest.route,
    install: entry.manifest.install,
    run: entry.manifest.run,
    remove: entry.manifest.remove,
  }));

const asIterator = <T>(values: readonly T[]): AsyncGenerator<T> =>
  (async function* () {
    for (const value of values) {
      await Promise.resolve();
      yield value;
    }
  })();

const buildContractsFromManifests = <TKind extends PluginStage, TPayload>(
  tenantId: string,
  manifests: readonly WorkflowManifest<TKind, TPayload>[],
): readonly PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>[] =>
  manifests.map((manifest, index) => ({
    kind: manifest.kind,
    id: `${tenantId}:contract:${manifest.kind}:${index}` as PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>['id'],
    capabilities: [{
      key: manifest.kind,
      description: `workflow:${manifest.kind}`,
      configSchema: {
        tenantId,
        route: manifest.route,
      },
    }],
    defaults: {
      pluginKind: manifest.kind,
      payload: {
        kind: manifest.kind,
        route: manifest.route,
      },
      retryWindowMs: horizonBrand.fromTime(150),
    },
    execute: async (inputs) => {
      const out: HorizonSignal<TKind, JsonLike>[] = [];
      for (const item of inputs) {
        out.push({
          id: horizonBrand.fromPlanId(`${tenantId}:${manifest.kind}:${item.pluginKind}:${now()}`),
          kind: item.pluginKind,
          payload: item.payload,
          input: {
            version: '1.0.0',
            runId: horizonBrand.fromRunId(`stack:${tenantId}:${item.pluginKind}`),
            tenantId,
            stage: item.pluginKind,
            tags: [manifest.key],
            metadata: {
              workflow: manifest.key,
            },
          },
          severity: 'low',
          startedAt: horizonBrand.fromDate(new Date(now()).toISOString()),
        });
      }
      return out;
    },
  }));

export const runWorkflowStack = async <TKind extends PluginStage, TPayload extends JsonLike>(
  input: WorkflowStackInput<TKind, TPayload>,
  seedSignals: readonly HorizonSignal<TKind, TPayload>[],
): Promise<WorkflowStackReport<TKind, TPayload>> => {
  const startedAt = now();
  const logs: string[] = [];
  const events: StackEvent[] = [];
  const manifests = toManifestMap(input.workflows);
  const contracts = buildContractsFromManifests(input.tenantId, manifests as readonly WorkflowManifest<TKind, JsonLike>[]);
  const registry = await createAdapterRegistry<TKind, JsonLike>(input.tenantId, contracts);

  const records = await registry.snapshot();
  const manifestMap = new Map<TKind, WorkflowManifest<TKind, TPayload>>();
  for (const record of records) {
    manifestMap.set(record.manifest.kind, record.manifest as WorkflowManifest<TKind, TPayload>);
  }

  let emitted = 0;
  const orderedStages = collectStages(input.workflows);
  for await (const workflow of asIterator(input.workflows)) {
    logs.push(`managed:${workflow.kind}`);
    events.push({ time: now(), message: `stage:${workflow.kind}` });
  }

  if (input.mode === 'single') {
    const lead = input.workflows[0];
    if (!lead) {
      await registry[Symbol.asyncDispose]();
      return {
        tenantId: input.tenantId,
        stages: orderedStages,
        runs: records.length,
        emitted,
        startedAt,
        finishedAt: now(),
        logs,
      };
    }

    for await (const signal of asIterator(seedSignals)) {
      const leadManifest = manifestMap.get(lead.kind) ?? lead.manifest;
      const output = await leadManifest.run(signal, new AbortController().signal);
      emitted += output.length;
      logs.push(`${leadManifest.key}:${output.length}`);
      events.push({ time: now(), message: `${lead.kind}:single:${output.length}` });
    }
  } else {
    for await (const signal of asIterator(seedSignals)) {
      for (const workflow of input.workflows) {
        if (workflow.kind !== signal.kind) {
          continue;
        }
        const manifest = manifestMap.get(workflow.kind) ?? workflow.manifest;
        const output = await manifest.run(signal, new AbortController().signal);
        emitted += output.length;
        logs.push(`${manifest.key}:${output.length}`);
        events.push({ time: now(), message: `${workflow.kind}:multi:${output.length}` });
      }
    }
  }

  const logLines = events.map((entry) => `${entry.time}:${entry.message}`);
  await registry[Symbol.asyncDispose]();
  return {
    tenantId: input.tenantId,
    stages: orderedStages,
    runs: records.length,
    emitted,
    startedAt,
    finishedAt: now(),
    logs: [...logs, ...logLines],
  };
};

export const traceWorkflowStack = async <TKind extends PluginStage>(
  tenantId: string,
  input: TKind,
): Promise<readonly string[]> => {
  const lines = [...new Set([`stack:${tenantId}`, `entry:${input}`, `trace:${tenantId}:${input}`, asLog(input)])];
  if (!lines.length) {
    await Promise.resolve();
  }
  return lines;
};

export const bindWorkflowManifest = <TKind extends PluginStage, TPayload>(
  tenantId: string,
  kind: TKind,
): WorkflowManifest<TKind, TPayload> => ({
  key: `${tenantId}:${kind}` as AdapterRegistryKey<TKind>,
  kind,
  tags: [tenantId, kind],
  route: `workflow.${tenantId}.${kind}` as RecursivePath<{ key: string; tenantId: string; contract: string }>,
  install: async () => [
    {
      tenantId,
      stage: kind,
      signalId: `${tenantId}:${kind}:installed`,
      contractId: `${tenantId}:${kind}`,
      verb: 'install',
      at: now(),
      payload: { kind, tenantId } as TPayload,
    },
  ],
  run: async (signal) => [
    {
      ...signal,
      input: {
        ...signal.input,
        tags: [...signal.input.tags, 'workflow'],
      },
    },
  ],
  remove: async () => [
    {
      tenantId,
      stage: kind,
      signalId: `${tenantId}:${kind}:removed`,
      contractId: `${tenantId}:${kind}`,
      verb: 'remove',
      at: now(),
      payload: { kind, tenantId } as TPayload,
    },
  ],
});

export const createWorkflowRegistry = async <TKind extends PluginStage, TPayload>(
  tenantId: string,
  workflow: StageWorkflow<TKind, TPayload>,
): Promise<AdapterRegistry<TKind, TPayload>> => {
  const manifests = toManifestMap([workflow]);
  const contracts = buildContractsFromManifests(tenantId, manifests as readonly WorkflowManifest<TKind, JsonLike>[]);
  const registry = await createAdapterRegistry<TKind, TPayload>(tenantId, contracts);
  await registry.install(tenantId, workflow.kind, workflow.manifest as unknown as AdapterManifest<TKind, TPayload>);
  return registry as AdapterRegistry<TKind, TPayload>;
};

export const formatPlanId = (tenantId: string, kind: PluginStage): PlanId =>
  horizonBrand.fromPlanId(`workflow:${tenantId}:${kind}`) as PlanId;
