import { err, ok, type Result } from '@shared/result';
import {
  adaptStages,
  type RuntimeAdapter,
  type RuntimeInput,
  type RuntimeOutput,
  type RuntimeEvent,
  asAdapterLabel,
  type HorizonTenant,
  type HorizonRunId,
  type HorizonEpoch,
} from '@shared/horizon-lab-runtime';
import { defaultSessionWindow } from '@shared/horizon-lab-runtime';
import {
  createRepository,
  type RecoveryHorizonRepository,
  createSyntheticMetricEngine,
  writeSignals,
  type HorizonForecastEngine,
} from '@data/recovery-horizon-store';
import {
  PluginConfig,
  PluginContract,
  PluginStage,
  HorizonSignal,
  HorizonInput,
  RunId,
  JsonLike,
  HorizonPlan,
  TimeMs,
  horizonBrand,
} from '@domain/recovery-horizon-engine';
import {
  parseSyntheticGraphSchema,
  createPlanFromTemplate,
  collectConstraints,
  SyntheticGraph,
  type GraphTimeline,
} from '@domain/recovery-horizon-engine';

const PROFILE_LIST = ['default', 'high-fidelity', 'streaming', 'batch'] as const;
type SupportedProfile = (typeof PROFILE_LIST)[number];
const fallbackSessionWindow = defaultSessionWindow as readonly PluginStage[];

const nowMs = (): TimeMs => Date.now() as TimeMs;
const nowEpoch = (): HorizonEpoch => Date.now() as HorizonEpoch;
const nowRunId = (value: string): HorizonRunId => value as HorizonRunId;
const toRunId = (runId: HorizonRunId): RunId => horizonBrand.fromRunId(String(runId));
const toTenant = (tenantId: string): HorizonTenant => tenantId as HorizonTenant;
const unique = (values: readonly PluginStage[]): readonly PluginStage[] =>
  [...new Set(values)] as readonly PluginStage[];
const isSupportedProfile = (value: string): value is SupportedProfile =>
  PROFILE_LIST.includes(value as SupportedProfile);
const normalizeProfile = (value?: string): SupportedProfile =>
  isSupportedProfile(value ?? 'default') ? (value as SupportedProfile) : 'default';

export interface SyntheticOrchestratorInput {
  readonly tenantId: string;
  readonly owner: string;
  readonly profile?: string;
  readonly stageWindow?: readonly PluginStage[];
}

export interface SyntheticOrchestratorContext {
  readonly runId: HorizonRunId;
  readonly startedAt: TimeMs;
}

export interface SyntheticRunSummary {
  readonly runId: HorizonRunId;
  readonly tenantId: string;
  readonly elapsedMs: TimeMs;
  readonly stageCount: number;
  readonly okCount: number;
  readonly failCount: number;
}

export interface SyntheticOrchestratorResult {
  readonly summary: SyntheticRunSummary;
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly timeline: GraphTimeline<readonly PluginStage[]>;
}

export interface SyntheticForecast {
  readonly tenantId: string;
  readonly planId: string;
  readonly confidence: number;
  readonly projections: readonly {
    readonly stage: PluginStage;
    readonly count: number;
  }[];
}

type Contract = PluginContract<PluginStage, PluginConfig<PluginStage, unknown>, unknown>;
type RuntimeOutputSignal = RuntimeOutput<unknown>;
type StageCountRecord = { [K in PluginStage]: number };

const stageBuckets = (): StageCountRecord => ({
  ingest: 0,
  analyze: 0,
  resolve: 0,
  optimize: 0,
  execute: 0,
});

const stagesFromInput = (input: SyntheticOrchestratorInput): readonly PluginStage[] =>
  input.stageWindow?.length ? unique(input.stageWindow) : unique([...fallbackSessionWindow]);

const buildSignalFromRuntimeOutput = (
  output: RuntimeOutputSignal,
  owner: string,
  profile: SupportedProfile,
): HorizonSignal<PluginStage, JsonLike> => ({
  id: horizonBrand.fromPlanId(`signal:${output.runId}:${output.stage}:${Date.now()}`),
  kind: output.stage as PluginStage,
  payload: output.payload as JsonLike,
  input: {
    version: '1.0.0',
    runId: toRunId(output.runId),
    tenantId: output.trace[0]?.tenant ?? 'tenant-001',
    stage: output.stage as PluginStage,
    tags: [owner, profile, output.stage],
    metadata: {
      windowProfile: profile,
      emittedAt: output.emittedAt,
      eventCount: output.trace.length,
    },
  },
  severity: 'low',
  startedAt: horizonBrand.fromDate(new Date(Number(output.emittedAt)).toISOString()),
});

const collectTimeline = (
  timeline: GraphTimeline<readonly PluginStage[]>,
  events: readonly string[],
): GraphTimeline<readonly PluginStage[]> => ({
  stages: timeline.stages,
  ordered: timeline.ordered,
  events,
});

const toHorizonPlan = (
  input: SyntheticOrchestratorInput,
  window: readonly PluginStage[],
): HorizonPlan => {
  parseSyntheticGraphSchema({
    planName: `${input.owner}:${input.tenantId}:${Date.now()}`,
    tenantId: input.tenantId,
    nodes: window.map((stage, index) => ({ id: `${input.tenantId}-${index}`, kind: stage })),
    edges: window.map((stage, index) => ({
      from: `${input.tenantId}-${index}`,
      to: `${input.tenantId}-${index + 1}`,
    })).slice(0, -1),
  });

  return createPlanFromTemplate(
    {
      tenant: toTenant(input.tenantId),
      version: '1.0.0',
    },
    window,
  );
};

const createContracts = (tenantId: string, profile: SupportedProfile, owner: string): readonly Contract[] => {
  const profileSeed = { tenantId, owner, profile } as Record<string, JsonLike>;
  const stages = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const;

  return stages.map((stage, index) => ({
    kind: stage,
    id: (`plugin:${tenantId}:${stage}:${index}` as unknown) as Contract['id'],
    capabilities: [
      {
        key: stage,
        description: `Synthetic contract ${stage}`,
        configSchema: {
          owner,
          profile,
          stage,
        },
      },
    ],
    defaults: {
      pluginKind: stage,
      payload: {
        owner,
        profile,
        seed: profileSeed,
        phase: stage,
        runIndex: index,
      },
      retryWindowMs: horizonBrand.fromTime(500),
    } as PluginConfig<PluginStage, JsonLike>,
    execute: async (config, signal) => {
      if (signal.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }

      const primary = config.at(0) as PluginConfig<PluginStage, JsonLike> | undefined;
      if (!primary) {
        return [];
      }

      return [
        {
          id: horizonBrand.fromPlanId(`contract:${tenantId}:${stage}:${Date.now()}`),
          kind: stage,
          payload: {
            contractKind: stage,
            owner,
            profile,
            config: primary as JsonLike,
            stageIndex: index,
          },
          input: {
            version: '1.0.0',
            runId: horizonBrand.fromRunId(`run:${tenantId}:${Date.now()}`),
            tenantId,
            stage,
            tags: ['preview', stage],
            metadata: {
              owner,
              profile,
            },
          },
          severity: 'low',
          startedAt: horizonBrand.fromDate(new Date().toISOString()),
        },
      ];
    },
  }));
};

const createAdapters = (
  tenantId: string,
  contracts: readonly Contract[],
  window: readonly PluginStage[],
  profile: SupportedProfile,
): readonly RuntimeAdapter[] =>
  contracts
    .filter((contract) => window.includes(contract.kind))
    .map((contract) => ({
      kind: contract.kind,
      describe: (input) => `${contract.id}:${input.stage}:${profile}`,
      run: async (input, context, signal) => {
        if (signal?.aborted) {
          return [] as RuntimeOutputSignal[];
        }

        const runOutput: RuntimeOutputSignal = {
          tenant: input.tenant,
          runId: context.trace.runId,
          stage: contract.kind,
          payload: {
            contractId: contract.id,
            tenantId,
            owner: (input.payload as { readonly owner?: string }).owner ?? tenantId,
            profile,
            executedAt: context.startedAt,
          },
          emittedAt: nowEpoch(),
          trace: [],
        };
        return [runOutput];
      },
    }));

const runTimeline = <TEvents extends readonly RuntimeEvent[]>(events: TEvents): readonly string[] =>
  events.map((event) => `${event.stage}:${event.kind}:${event.elapsedMs}`);

export const collectSyntheticPlanInput = (input: HorizonInput): {
  version: string;
  tenant: string;
  stage: string;
  tags: readonly string[];
} => ({
  version: input.version,
  tenant: input.tenantId,
  stage: input.stage,
  tags: input.tags,
});

export const normalizePlanInput = (input: HorizonInput): {
  stage: PluginStage;
  version: string;
  runId: RunId;
  tenantId: string;
  tags: readonly string[];
  metadata: Record<string, JsonLike>;
} => ({
  stage: input.stage as PluginStage,
  version: input.version,
  runId: input.runId,
  tenantId: input.tenantId,
  tags: input.tags,
  metadata: input.metadata,
});

export const foldSignalsByStage = <TSignals extends readonly HorizonSignal<PluginStage, JsonLike>[]>(
  signals: TSignals,
): StageCountRecord => {
  const counts = stageBuckets();
  for (const signal of signals) {
    counts[signal.input.stage] = (counts[signal.input.stage] ?? 0) + 1;
  }
  return counts;
};

export const rankedStages = <T extends StageCountRecord>(counts: T): readonly PluginStage[] =>
  (Object.entries(counts) as [PluginStage, number][])
    .toSorted((left, right) => right[1] - left[1])
    .map(([stage]) => stage);

export const summarizeOrchestrator = <T extends SyntheticOrchestratorResult>(result: T) => ({
  tenantId: result.summary.tenantId,
  runId: result.summary.runId,
  stageCount: result.summary.stageCount,
  totalSignals: result.signals.length,
});

export const buildForecastRequest = <T extends string>(tenantId: T, runId: T) => ({
  tenantId,
  targetRunId: horizonBrand.fromRunId(`forecast:${runId}`),
  horizonMs: (3_000 as TimeMs),
  includeWarnings: true,
} as const);

export class SyntheticHorizonOrchestrator {
  readonly #repository: RecoveryHorizonRepository;
  readonly #engine: HorizonForecastEngine;

  constructor(repository?: RecoveryHorizonRepository, forecastEngine?: HorizonForecastEngine) {
    this.#repository = repository ?? createRepository('tenant-001', 'tenant-002');
    this.#engine = forecastEngine ?? createSyntheticMetricEngine(this.#repository);
  }

  async run(input: SyntheticOrchestratorInput): Promise<Result<SyntheticOrchestratorResult>> {
    const startedAt = nowMs();
    const profile = normalizeProfile(input.profile);
    const stageWindow = stagesFromInput(input);
    const runId = nowRunId(`run:${input.tenantId}:${Date.now()}`);
    const tenant = toTenant(input.tenantId);
    const runIdDomain = toRunId(runId);

    const plan = toHorizonPlan(input, stageWindow);
    void plan;
    const contracts = createContracts(input.tenantId, profile, input.owner).filter((contract) =>
      stageWindow.includes(contract.kind),
    );
    const adapters = createAdapters(input.tenantId, contracts, stageWindow, profile);
    const constraints = collectConstraints(stageWindow);
    const startupStage = stageWindow[0] ?? 'ingest';
    const runtimeInput: RuntimeInput<{
      runId: HorizonRunId;
      tenant: string;
      owner: string;
      profile: SupportedProfile;
      constraints: readonly unknown[];
    }> = {
      tenant: input.tenantId,
      runId,
      stage: startupStage,
      payload: {
        runId,
        tenant: input.tenantId,
        owner: input.owner,
        profile,
        constraints,
      },
    };

    try {
      const result = await adaptStages({
        tenant: input.tenantId,
        runId,
        adapters,
        input: runtimeInput,
      });
      if (!result.ok) {
        return err(result.error);
      }

      const signals = result.outputs.map((entry) =>
        buildSignalFromRuntimeOutput(entry, input.owner, profile),
      );

      const writeArgs = signals.map((signal) => ({
        tenantId: input.tenantId,
        signal,
      }));
      const applied = await this.#repository.applyBatch({ tenantId: input.tenantId, stages: stageWindow }, writeArgs);
      if (!applied.ok) {
        return err(applied.error);
      }

      const events = result.trace.length
        ? result.trace
        : [
          {
            stage: startupStage,
            kind: `${startupStage.toUpperCase()}_STAGE` as RuntimeEvent['kind'],
            startedAt: nowEpoch(),
            elapsedMs: 0,
            ok: true,
            errors: [],
            pluginLabel: asAdapterLabel(startupStage),
          },
        ];

      const graph = SyntheticGraph.fromSignals(tenant, runIdDomain, contracts);
      const execution = await graph.execute(
        {
          tenant,
          runId: runIdDomain,
          payload: {
            tenantId: input.tenantId,
            window: stageWindow,
            constraints,
            profile,
            runId,
          },
        },
        {
          onRun: (nodeId, stage, elapsedMs) => {
            void nodeId;
            void stage;
            void elapsedMs;
          },
        },
      );

      const forecast = await this.#engine.forecast({
        tenantId: input.tenantId,
        targetRunId: toRunId(runId),
        horizonMs: nowMs(),
        includeWarnings: true,
      });
      if (!forecast.ok) {
        return err(forecast.error);
      }

      const okCount = runTimeline(result.trace).length + signals.length;
      const failCount = Math.max(0, stageWindow.length - okCount);
      const summary: SyntheticRunSummary = {
        runId,
        tenantId: input.tenantId,
        elapsedMs: horizonBrand.fromTime(nowMs() - startedAt),
        stageCount: stageWindow.length,
        okCount,
        failCount,
      };

      await writeSignals(
        this.#repository,
        input.tenantId,
        signals.map((signal) => ({
          ...signal,
          input: {
            ...signal.input,
            metadata: {
              ...signal.input.metadata,
              forecastConfidence: forecast.value.confidence,
              projectionCount: forecast.value.projections.length,
            },
          },
        })),
      );

      return ok({
        summary,
        signals,
        timeline: collectTimeline(execution.timeline, runTimeline(result.trace)),
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getForecast(tenantId: string): Promise<Result<SyntheticForecast | undefined>> {
    const snapshot = await this.#engine.forecast({
      tenantId,
      targetRunId: horizonBrand.fromRunId(`forecast:${tenantId}:${Date.now()}`),
      horizonMs: 1_200 as TimeMs,
      includeWarnings: true,
    });

    if (!snapshot.ok) {
      return err(snapshot.error);
    }

    return ok({
      tenantId,
      planId: snapshot.value.planId,
      confidence: snapshot.value.confidence,
      projections: snapshot.value.projections.map((entry) => ({
        stage: entry.stage,
        count: entry.count,
      })),
    });
  }

  async preview(input: SyntheticOrchestratorInput): Promise<Result<readonly HorizonSignal<PluginStage, JsonLike>[]>> {
    const profile = normalizeProfile(input.profile);
    const window = stagesFromInput(input);
    const contracts = createContracts(input.tenantId, profile, input.owner);
    const constraints = collectConstraints(window);
    const graph = SyntheticGraph.fromSignals(toTenant(input.tenantId), toRunId(nowRunId(`preview:${Date.now()}`)), contracts);

    const output = graph.nodes.slice(0, 3).map((entry, index) => ({
      id: horizonBrand.fromPlanId(`${input.tenantId}:preview:${index}`),
      kind: entry.node.kind,
      payload: entry.node.state,
      input: {
        version: '1.0.0',
        runId: horizonBrand.fromRunId(`preview:${input.tenantId}`),
        tenantId: input.tenantId,
        stage: entry.node.kind,
        tags: [input.owner, profile, ...constraints.map((constraint) => constraint.stage)],
        metadata: {
          profile,
          constraints: constraints.length,
        },
      },
      severity: 'low',
      startedAt: horizonBrand.fromDate(new Date().toISOString()),
    }) as HorizonSignal<PluginStage, JsonLike>);

    return ok(output);
  }
}

export const runSynthetic = async (
  input: SyntheticOrchestratorInput,
  repository?: RecoveryHorizonRepository,
): Promise<Result<SyntheticRunSummary>> => {
  const orchestrator = new SyntheticHorizonOrchestrator(repository);
  const result = await orchestrator.run(input);
  if (!result.ok) {
    return err(result.error);
  }
  return ok(result.value.summary);
};
