import { createRepository, writeSignals } from '@data/recovery-horizon-store';
import {
  type PluginConfig,
  type PluginContract,
  type PluginStage,
  type HorizonSignal,
  type HorizonPlan,
  type JsonLike,
  type HorizonInput,
  type TimeMs,
  type RunId,
  horizonBrand,
} from '@domain/recovery-horizon-engine';
import { collectTimelineWindows, snapshotMetrics } from './horizon-analytics.js';
import { type NoInfer } from '@shared/type-level';
import {
  createWorkflowManager,
  type WorkflowMode,
  type WorkflowReport,
} from '@infrastructure/recovery-scenario-orchestration-adapters';

type PayloadForStage = {
  readonly tenantId?: string;
};

export type MeshExecutionEnvelope<TKind extends PluginStage, TPayload = JsonLike> = {
  readonly tenantId: string;
  readonly window: readonly TKind[];
  readonly run: ReturnType<typeof createWorkflowManager>;
  readonly createdAt: TimeMs;
};

export interface MeshOrchestratorInput {
  readonly tenantId: string;
  readonly mode: WorkflowMode;
  readonly stageWindow: readonly PluginStage[];
  readonly batchSize: number;
}

export interface MeshOrchestratorOutput<TPayload = JsonLike> {
  readonly tenantId: string;
  readonly mode: WorkflowMode;
  readonly stages: readonly PluginStage[];
  readonly executed: number;
  readonly signals: readonly HorizonSignal<PluginStage, TPayload>[];
  readonly metadata: Record<string, string>;
}

export interface MeshRunSession<TKind extends PluginStage> {
  readonly tenantId: string;
  readonly contractCount: number;
  readonly planId: string;
  readonly stages: readonly TKind[];
  readonly startedAt: TimeMs;
  readonly endedAt: TimeMs;
}

export type MeshRunResult<TKind extends PluginStage = PluginStage, TPayload = JsonLike> =
  | { readonly ok: true; readonly session: MeshRunSession<TKind>; readonly output: MeshOrchestratorOutput<TPayload> }
  | { readonly ok: false; readonly error: Error };

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

type SeedPayload = {
  readonly source: string;
  readonly order: number;
  readonly tenantId: string;
};

const seedTenant = (seed: string | undefined): string => seed ?? 'tenant-001';

const toContractId = <TKind extends PluginStage>(
  kind: TKind,
  index: number,
): PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>['id'] =>
  `plugin:${kind}:${index}` as PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>['id'];

const toContracts = <TKind extends PluginStage>(stageWindow: readonly TKind[]): readonly PluginContract<
  TKind,
  PluginConfig<TKind, JsonLike>,
  JsonLike
>[] =>
  stageWindow.map((stage, index) => ({
    kind: stage,
    id: toContractId(stage, index),
    capabilities: [{
      key: stage,
      description: `mesh-contract:${stage}`,
      configSchema: { source: 'mesh-orchestrator' },
    }],
    defaults: {
      pluginKind: stage,
      payload: {
        stage,
        tenantId: 'tenant-001',
        order: index,
        mode: 'orchestrator',
      },
      retryWindowMs: horizonBrand.fromTime(250),
    },
    execute: async (inputs) => inputs.map((entry, offset) => {
      const payload = typeof entry.payload === 'object' && entry.payload !== null ? entry.payload as PayloadForStage : {};
      return {
          id: horizonBrand.fromPlanId(`execution:${entry.pluginKind}:${offset}`),
        kind: entry.pluginKind,
        payload: payload as JsonLike,
        input: {
          version: '1.0.0',
          runId: horizonBrand.fromRunId(`exec:${entry.pluginKind}:${offset}`),
          tenantId: seedTenant(payload.tenantId),
          stage: entry.pluginKind,
          tags: ['orchestrated'],
          metadata: {
            source: 'mesh-orchestrator',
            contract: `${entry.pluginKind}`,
          },
        },
        severity: 'low',
        startedAt: horizonBrand.fromDate(new Date(now()).toISOString()),
      };
    }) as readonly HorizonSignal<TKind, JsonLike>[],
  }));

const buildSeedSignals = <TKind extends PluginStage>(
  tenantId: string,
  stages: readonly TKind[],
): readonly HorizonSignal<TKind, SeedPayload>[] =>
  stages.map((stage, index) => ({
    id: horizonBrand.fromPlanId(`seed:${tenantId}:${stage}:${index}`),
    kind: stage,
    payload: {
      source: 'mesh-orchestrator',
      order: index,
      tenantId,
    },
    input: {
      version: '1.0.0',
      runId: horizonBrand.fromRunId(`seed:${tenantId}:${index}`),
      tenantId,
      stage,
      tags: ['seed', 'orchestrator'],
      metadata: {
        tenantId,
        stage,
        order: index,
      },
    },
    severity: 'low',
    startedAt: horizonBrand.fromDate(new Date(now()).toISOString()),
  }));

const summarizeSignals = <TKind extends PluginStage, TPayload>(
  tenantId: string,
  signals: readonly HorizonSignal<TKind, TPayload>[],
): Record<string, number> => {
  const out = new Map<string, number>();
  for (const signal of signals) {
    out.set(signal.kind, (out.get(signal.kind) ?? 0) + 1);
  }
  out.set('tenant', out.get('tenant') ?? 0);
  out.set(tenantId, out.get(tenantId) ?? 1);
  return Object.fromEntries(out.entries()) as Record<string, number>;
};

export const runControlledMesh = async <TKind extends PluginStage>(
  input: MeshOrchestratorInput,
  maybeContracts?: readonly PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>[],
): Promise<MeshRunResult<TKind, JsonLike>> => {
  const repository = createRepository(input.tenantId);
  const startedAt = now();
  const contracts = maybeContracts ?? toContracts(input.stageWindow as readonly TKind[]);
  const seeds = buildSeedSignals(input.tenantId, input.stageWindow as readonly TKind[]).slice(0, input.batchSize);
  const manager = await createWorkflowManager(input.tenantId, input.mode, contracts as any);

  const metrics = new Map<TKind, number>(input.stageWindow.map((entry) => [entry as TKind, 0]));
  const outputs: HorizonSignal<TKind, JsonLike>[] = [];
  for (const seed of seeds) {
    const results = await manager.run(seed as HorizonSignal<PluginStage, JsonLike>);
    for (const output of results) {
      const typed = output as HorizonSignal<TKind, JsonLike>;
      outputs.push(typed);
      metrics.set(typed.kind, (metrics.get(typed.kind) ?? 0) + 1);
    }
  }

  const timeline = await repository.read({
    tenantId: input.tenantId,
    maxRows: 2000,
    stages: input.stageWindow,
  });

  if (!timeline.ok) {
    await writeSignals(repository, input.tenantId, outputs);
    return {
      ok: false,
      error: new Error(`unable to read timeline ${timeline.error}`),
    };
  }

  const snapshot = await snapshotMetrics(input.tenantId);
  const endedAt = now();
  const session: MeshRunSession<TKind> = {
    tenantId: input.tenantId,
    contractCount: contracts.length,
    planId: `plan:${input.mode}:${input.tenantId}:${input.stageWindow.join('|')}`,
    stages: input.stageWindow as TKind[],
    startedAt,
    endedAt,
  };

  return {
    ok: true,
    session,
    output: {
      tenantId: input.tenantId,
      mode: input.mode,
      stages: input.stageWindow as TKind[],
      executed: timeline.value.total + outputs.length,
      signals: outputs,
      metadata: {
        signature: `${input.mode}:${snapshot.ok ? 'ok' : 'warn'}`,
        totalRows: String(timeline.value.total),
        metrics: JSON.stringify(summarizeSignals(input.tenantId, outputs)),
      },
    },
  };
};

export const runMeshWindowSeries = async (
  tenantId: string,
  windows: PluginStage[][],
): Promise<MeshOrchestratorOutput[]> => {
  const out: MeshOrchestratorOutput[] = [];
  for await (const stageWindow of collectWindows(windows)) {
    const response = await runControlledMesh({
      tenantId,
      mode: 'multi',
      stageWindow,
      batchSize: 3,
    });

    if (response.ok) {
      out.push(response.output);
    } else {
      out.push({
        tenantId,
        mode: 'multi',
        stages: stageWindow,
        executed: 0,
        signals: [],
        metadata: { error: response.error.message },
      });
    }
  }
  return out;
};

async function* collectWindows(windows: PluginStage[][]): AsyncGenerator<PluginStage[]> {
  for (const window of windows) {
    await Promise.resolve();
    yield [...window];
  }
}

export const collectWindowSnapshots = async (
  tenantId: string,
  windows: PluginStage[][]
): Promise<{ tenantId: string; outputs: MeshOrchestratorOutput[]; planIds: string[]; topology: unknown; }> => {
  const outputs = await runMeshWindowSeries(tenantId, windows);
  const topology = await collectTimelineWindows(tenantId);
  return {
    tenantId,
    outputs,
    planIds: outputs.map((entry) => entry.metadata.signature ?? 'none'),
    topology,
  };
};
