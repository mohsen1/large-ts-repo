import { fail, ok, type Result } from '@shared/result';
import {
  SyntheticPluginRegistry,
  buildExecutionPlan,
  normalizeTimeline,
  runPluginChain,
  type RuntimeStep,
  asSyntheticBlueprintId,
  asSyntheticTenantId,
  asSyntheticWorkspaceId,
  type PluginChainCompatibility,
  type PluginChainOutput,
  type SyntheticBlueprint,
  type SyntheticExecutionContext,
  type SyntheticPhase,
  type SyntheticRunInputModel,
  type SyntheticRunId,
  type SyntheticPluginDefinition,
  type SyntheticPluginId,
} from '@domain/recovery-synthetic-orchestration';
import {
  InMemorySyntheticRunStore,
  asStoreEventId,
  defaultStoreQuery,
  type SyntheticRunEvent,
  type SyntheticRunRecord,
  type SyntheticRunRecordStatus,
  type SyntheticStoreQuery,
} from '@data/recovery-synthetic-orchestration-store';
import type { EventBucket } from '@data/recovery-synthetic-orchestration-store';
import { buildDiagnostics, classify } from './diagnostics';
import { buildDefaultPlugins } from './adapters';
import type { OrchestratorDiagnostics } from './diagnostics';

type PluginCatalog = readonly SyntheticPluginDefinition[];
type RegistryChain = PluginChainCompatibility<PluginCatalog>;

const defaultPhases: readonly SyntheticPhase[] = ['ingest', 'synthesize', 'simulate', 'actuate'];

interface OrchestratorDiagnosticState {
  readonly runId: SyntheticRunId;
  readonly startedAt: string;
  readonly diagnostics: OrchestratorDiagnostics<PluginCatalog>;
}

export interface OrchestratorConfig {
  readonly pluginDefinitions?: readonly SyntheticPluginDefinition[];
  readonly maxRuns?: number;
}

interface RunRequest {
  readonly blueprint: {
    readonly id: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly requestedBy: string;
  };
  readonly input: SyntheticRunInputModel;
  readonly context: SyntheticExecutionContext;
}

export class RecoverySyntheticOrchestrator {
  private readonly store: InMemorySyntheticRunStore;
  private readonly plugins: RegistryChain;
  private readonly states: Map<string, OrchestratorDiagnosticState>;
  private readonly maxRuns?: number;

  constructor(store: InMemorySyntheticRunStore = new InMemorySyntheticRunStore(), config: OrchestratorConfig = {}) {
    this.store = store;
    this.plugins = (config.pluginDefinitions ?? buildDefaultPlugins()) as RegistryChain;
    this.maxRuns = config.maxRuns;
    this.states = new Map<string, OrchestratorDiagnosticState>();
  }

  async runBlueprint(
    runRequest: RunRequest,
  ): Promise<
    Result<
      {
        runId: SyntheticRunId;
        status: SyntheticRunRecordStatus;
        timeline: readonly RuntimeStep[];
        output: PluginChainOutput<RegistryChain>;
        classification: 'ok' | 'degraded' | 'failed';
      },
      Error
    >
  > {
    const blueprint = this.normalizeBlueprint(runRequest);
    const chain = this.orderedPlugins;
    const plan = buildExecutionPlan(blueprint, chain, {
      includePhases: defaultPhases,
      maxPlugins: this.maxRuns,
    });

    const baseRecord: SyntheticRunRecord = {
      runId: plan.request.runId,
      blueprintId: plan.request.blueprintId,
      tenantId: blueprint.tenantId,
      workspaceId: blueprint.workspaceId,
      status: 'queued',
      startedAt: plan.plan.createdAt,
      updatedAt: plan.plan.createdAt,
      correlationId: plan.context.correlationId,
      requestedBy: blueprint.requestedBy,
      priority: runRequest.input.priority,
      pluginCount: plan.plan.pluginChain.length,
      payload: runRequest.input,
      phases: blueprint.phases,
      warnings: [],
    };

    const saved = await this.store.saveRun(baseRecord);
    if (!saved.ok) {
      return fail(saved.error);
    }

    const bootstrap = this.plugins[0]?.id ?? ('synthetic.bootstrap' as SyntheticPluginId);
    await this.appendEvent(plan.request.runId, 'ingest', bootstrap, {
      phase: 'ingest',
      tenantId: blueprint.tenantId,
      workspaceId: blueprint.workspaceId,
      pluginId: bootstrap,
      at: new Date().toISOString(),
      runId: plan.request.runId,
      message: 'blueprint accepted',
      payload: { requestId: plan.request.runId },
    });

    const chainRun = await runPluginChain(plan.plan.pluginChain, plan.plan, runRequest.input as never, plan.context);
    if (chainRun.ok === false) {
      const failedChainRun = chainRun as { readonly error: Error };
      await this.store.saveRun({
        ...baseRecord,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        warnings: ['execution-failed'],
        payload: runRequest.input,
      });
      return fail(failedChainRun.error);
    }

    const diagnostics = buildDiagnostics(plan.request, runRequest.input, plan.plan, chainRun.value.output);
    const timeline = normalizeTimeline(chainRun.value.timeline);

    const successRecord: SyntheticRunRecord = {
      ...baseRecord,
      status: chainRun.value.status,
      updatedAt: new Date().toISOString(),
      payload: chainRun.value.output,
      warnings: chainRun.value.warnings,
      pluginCount: plan.plan.pluginChain.length,
    };

    await this.store.saveRun(successRecord);
    await this.store.appendSnapshot(successRecord);
    this.states.set(plan.request.runId, {
      runId: plan.request.runId,
      startedAt: plan.plan.createdAt,
      diagnostics,
    });

    return ok({
      runId: plan.request.runId,
      status: chainRun.value.status,
      timeline,
      output: chainRun.value.output as PluginChainOutput<RegistryChain>,
      classification: classify(successRecord.status),
    });
  }

  async runWorkspace(
    payload: SyntheticRunInputModel,
    context: SyntheticExecutionContext,
  ): Promise<Result<{ runId: SyntheticRunId; status: SyntheticRunRecordStatus }, Error>> {
    const run = await this.runBlueprint({
      blueprint: {
        id: `blueprint:${context.tenantId}:${context.workspaceId}`,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        requestedBy: context.actor,
      },
      input: payload,
      context,
    });

    if (!run.ok) {
      return fail(run.error);
    }

    return ok({
      runId: run.value.runId,
      status: run.value.status,
    });
  }

  get orderedPlugins(): RegistryChain {
    const registry = SyntheticPluginRegistry.create(this.plugins as RegistryChain);
    const ordered = registry.orderedByPhase(defaultPhases);
    return ordered as RegistryChain;
  }

  listRuns(query: SyntheticStoreQuery = {}): Promise<Result<readonly SyntheticRunRecord[], Error>> {
    return this.store.listRuns({ ...defaultStoreQuery, ...query });
  }

  async appendEvent(
    runId: SyntheticRunId,
    phase: SyntheticPhase,
    pluginId: SyntheticPluginId,
    event: Omit<SyntheticRunEvent, 'id' | 'domain'>,
  ): Promise<Result<SyntheticRunEvent, Error>> {
    return this.store.appendEvent({
      ...event,
      id: asStoreEventId(`${runId}:${pluginId}:${phase}`),
      domain: 'recovery-synthetic-orchestration',
      runId,
    });
  }

  summarize(runId: SyntheticRunId): Promise<Result<readonly EventBucket[], Error>> {
    return this.store.summarize(runId);
  }

  state(runId: SyntheticRunId): OrchestratorDiagnosticState | undefined {
    return this.states.get(runId);
  }

  clear(runId: SyntheticRunId): void {
    this.states.delete(runId);
  }

  private normalizeBlueprint(runRequest: RunRequest): SyntheticBlueprint {
    return {
      id: asSyntheticBlueprintId(runRequest.blueprint.id),
      tenantId: asSyntheticTenantId(runRequest.blueprint.tenantId),
      workspaceId: asSyntheticWorkspaceId(runRequest.blueprint.workspaceId),
      name: 'Synthetic Orchestration Blueprint',
      domain: 'recovery-synthetic-orchestration',
      owner: runRequest.blueprint.requestedBy,
      tags: ['synthetic', 'runtime'],
      phases: [...defaultPhases],
      requestedAt: new Date().toISOString(),
      requestedBy: runRequest.blueprint.requestedBy,
      goal: 'stability',
      metadata: {
        source: 'recovery-synthetic-orchestrator',
        actor: runRequest.context.actor,
      },
    };
  }
}

export const defaultOrchestrator = (): RecoverySyntheticOrchestrator => new RecoverySyntheticOrchestrator();
