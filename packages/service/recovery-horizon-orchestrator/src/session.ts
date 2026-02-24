import {
  createRepository,
  type HorizonLookupConfig,
  type RecoveryHorizonRepository,
  type HorizonStoreRecord,
  type HorizonMutationEvent,
  type HorizonReadResult,
} from '@data/recovery-horizon-store';
import {
  type HorizonInput,
  type HorizonSignal,
  type HorizonPlan,
  type PluginConfig,
  type PluginStage,
  type JsonLike,
  type PlanId,
  type RunId,
  type HorizonTenant,
  type StageLabel,
  type ValidationResult,
  type ValidationIssue,
  horizonBrand,
} from '@domain/recovery-horizon-engine';
import { err, ok, type Result } from '@shared/result';
import { type HorizonTrace, type HorizonTraceContext, createTrace, toRuntimeTrace, withAsyncHorizonScope } from '@shared/horizon-lab-runtime';
import { runHorizonPlan } from './orchestrator.js';
import type { HorizonOrchestratorConfig, HorizonOrchestratorResult, HorizonServiceSnapshot, HorizonRunnerContract, HorizonQuery } from './types.js';

export interface SessionStageConfig {
  readonly tenant: string;
  readonly stages: readonly PluginStage[];
  readonly owner: string;
  readonly planName: string;
  readonly tags: readonly string[];
}

export interface SessionPlanInput {
  readonly tenantId: string;
  readonly runId: RunId;
  readonly stageWindow: readonly PluginStage[];
  readonly seedPayload?: JsonLike;
}

export interface SessionRunResult {
  readonly runResult: Result<HorizonOrchestratorResult>;
  readonly snapshot: HorizonServiceSnapshot;
  readonly trace: HorizonTrace;
}

export interface SessionHandle {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly config: HorizonOrchestratorConfig;
  readonly trace: HorizonTraceContext;
  readonly repository: RecoveryHorizonRepository;
}

const toTenantBrand = (tenantId: string): HorizonTenant => tenantId as HorizonTenant;
const toRunBrand = (runId: string): RunId => horizonBrand.fromRunId(runId);
const toPlanBrand = (planId: string): PlanId => horizonBrand.fromPlanId(planId);
const toTimestamp = (tenantId: string) => `run:${tenantId}:${Date.now()}`;
const toStageLabel = (stage: PluginStage): StageLabel<PluginStage> => `${stage.toUpperCase()}_STAGE` as StageLabel<PluginStage>;

const asSeedSignal = (
  tenantId: string,
  stage: PluginStage,
  runId: RunId,
  order = 0,
): HorizonSignal<PluginStage, JsonLike> => ({
  id: horizonBrand.fromPlanId(`seed:${tenantId}:${stage}:${order}`),
  kind: stage,
  payload: {
    source: 'seed',
    owner: 'session',
    stage,
    order,
  },
  input: {
    version: '1.0.0',
    runId,
    tenantId,
    stage,
    tags: ['seed', 'session'],
    metadata: {
      seed: true,
      tenantId,
      order,
    },
  },
  severity: 'low',
  startedAt: horizonBrand.fromDate(new Date(Date.now()).toISOString()),
});

const makePlan = (input: SessionPlanInput): HorizonPlan => ({
  id: toPlanBrand(`plan:${input.tenantId}:${input.runId}`),
  tenantId: input.tenantId,
  startedAt: horizonBrand.fromTime(Date.now()),
  pluginSpan: {
    stage: input.stageWindow[0] ?? 'ingest',
    label: toStageLabel(input.stageWindow[0] ?? 'ingest'),
    startedAt: horizonBrand.fromTime(Date.now()),
    durationMs: horizonBrand.fromTime(0),
  },
  payload: {
    tenantId: input.tenantId,
    planName: `session-${input.tenantId}`,
    stageWindow: input.stageWindow,
    runId: input.runId,
    ...(input.seedPayload ? { seedPayload: input.seedPayload } : {}),
  },
});

export const createSessionConfig = (input: SessionStageConfig): HorizonOrchestratorConfig => ({
  tenantId: input.tenant,
  planName: input.planName,
  stageWindow: input.stages,
  refreshIntervalMs: 125,
  tags: input.tags,
  owner: input.owner,
});

export const createSessionSeedPlan = (
  tenantId: string,
  stageWindow: readonly PluginStage[],
): readonly HorizonSignal<PluginStage, JsonLike>[] =>
  stageWindow.map((stage, index) => asSeedSignal(tenantId, stage, toRunBrand(`seed-${tenantId}-${Date.now()}`), index));

class HorizonRunManager {
  constructor(
    private readonly repository: RecoveryHorizonRepository,
    private readonly config: HorizonOrchestratorConfig,
  ) {}

  async run(plan: HorizonPlan): Promise<HorizonOrchestratorResult> {
    const result = await runHorizonPlan(this.repository, this.config, plan);
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }
}

export class HorizonRunSession implements HorizonRunnerContract {
  readonly #repository: RecoveryHorizonRepository;
  readonly #traceContext: HorizonTraceContext;
  readonly #trace: HorizonTrace;
  readonly #tenantId: string;
  readonly #stages: readonly PluginStage[];
  readonly #owner: string;
  readonly #labels: readonly string[];

  constructor(tenantId: string, stages: readonly PluginStage[], owner: string, labels: readonly string[] = []) {
    this.#tenantId = tenantId;
    this.#stages = stages;
    this.#owner = owner;
    this.#labels = labels;
    this.#repository = createRepository(this.#tenantId);
    this.#traceContext = createTrace({
      tenantId: toTenantBrand(this.#tenantId),
      sessionId: `session:${this.#tenantId}:${this.#stages.join('-')}`,
      runId: toTimestamp(this.#tenantId),
    });
    this.#trace = toRuntimeTrace(this.#traceContext, [], this.#labels as readonly never[]);
  }

  get sessionId() {
    return this.#traceContext.sessionId;
  }

  get config(): HorizonOrchestratorConfig {
    return createSessionConfig({
      tenant: this.#tenantId,
      stages: this.#stages,
      owner: this.#owner,
      planName: `run-${this.sessionId}`,
      tags: this.#labels,
    });
  }

  async run(plan: HorizonPlan): Promise<HorizonOrchestratorResult> {
    const runManager = new HorizonRunManager(this.#repository, this.config);
    const result = await runManager.run(plan);
    await this.#repository.writeMany(createSessionSeedPlan(this.#tenantId, this.#stages));
    return result;
  }

  async query(input: HorizonQuery): Promise<HorizonReadResult> {
    const result = await this.#repository.read({
      tenantId: input.tenantId,
      stages: this.#stages,
      includeArchived: input.includeArchived,
      maxRows: input.maxRows,
    });
    if (!result.ok) {
      return {
        items: [],
        total: 0,
      };
    }
    return result.value;
  }

  async snapshot(input: HorizonLookupConfig): Promise<HorizonServiceSnapshot> {
    const result = await this.#repository.read(input);
    if (!result.ok) {
      throw result.error;
    }
    return {
      tenantId: input.tenantId,
      state: {
        runId: toRunBrand(`snapshot-${this.#tenantId}`),
        startedAt: horizonBrand.fromTime(Date.now()),
        stageWindow: this.#stages,
        state: result.value.items.length ? 'running' : 'warming',
      },
      latest: {
        plans: result.value.items.map((entry) => entry.plan).filter((plan): plan is HorizonPlan => plan !== undefined),
        signals: result.value.items.map((entry) => entry.signal),
      },
    };
  }

  async drain(planId: PlanId): Promise<ValidationResult<true>> {
    const signal: HorizonSignal<PluginStage, JsonLike> = {
      id: toPlanBrand(`drain:${planId}`),
      kind: this.#stages[0] ?? 'ingest',
      payload: {
        stageWindow: [...this.#stages],
        planId,
      },
      input: {
        version: '1.0.0',
        runId: toRunBrand(`drain-${String(planId)}`),
        tenantId: this.#tenantId,
        stage: this.#stages[0] ?? 'ingest',
        tags: ['drain'],
        metadata: { source: 'drain', sessionId: this.sessionId },
      },
      severity: 'low',
      startedAt: horizonBrand.fromDate(new Date().toISOString()),
    };

    const result = await this.#repository.write(signal);
    return result.ok ? { ok: true, value: true } : {
      ok: false,
      errors: [{
        path: ['drain'],
        message: result.error.message,
        severity: 'error',
      }],
    };
  }

  async replayEvents(input: HorizonLookupConfig): Promise<readonly HorizonMutationEvent[]> {
    const history = await this.#repository.history(input);
    if (!history.ok) {
      throw history.error;
    }
    return history.value.events;
  }

  async archive(input: HorizonLookupConfig): Promise<readonly HorizonStoreRecord[]> {
    const result = await this.#repository.read(input);
    return result.ok ? result.value.items : [];
  }

  get trace(): HorizonTrace {
    return this.#trace;
  }

  get repository(): RecoveryHorizonRepository {
    return this.#repository;
  }
}

export const launchHorizonSession = async (config: SessionStageConfig): Promise<Result<SessionRunResult>> => {
  const runId = toRunBrand(`run-${config.tenant}-${Date.now()}`);
  const plan = makePlan({
    tenantId: config.tenant,
    runId,
    stageWindow: config.stages,
    seedPayload: { launchedBy: config.owner, planName: config.planName },
  });

  const session = new HorizonRunSession(config.tenant, config.stages, config.owner, config.tags);
  return withAsyncHorizonScope(
    'launch',
    toTenantBrand(config.tenant),
    session.sessionId,
    async (scope) => {
      scope.emit('launch:start', { tenant: config.tenant, runId });
      const result = await runHorizonPlan(session.repository, session.config, plan);
      const snapshot = await session.snapshot({
        tenantId: config.tenant,
        stages: config.stages,
        includeArchived: true,
        maxRows: 256,
      });
      scope.emit('launch:end', { tenant: config.tenant, success: result.ok });
      return ok({
        runResult: result.ok ? ok(result.value) : err(result.error),
        snapshot,
        trace: toRuntimeTrace(session.trace.context, scope.snapshot()),
      });
    },
  );
};
