import { createRegistryClient, type RegistryClientOptions } from './registry-client';
import { DesignScheduler } from './scheduler';
import { DesignPluginHub, type DesignPlugin } from './plugin-hub';
import { DesignPlanStore, createPlanEvent, type StoredPlanRow } from './plan-history';
import { collectWindows, normalizeSignals, splitSignals } from './signal-events';
import {
  builtinTemplates,
  buildPlanWindow,
  makeDesignExecutionId,
  makeDesignPlanId,
  makeDesignScenarioId,
  makeDesignTenantId,
  makeDesignWorkspaceId,
  parsePlan,
  parseTemplate,
  type DesignDiagnostic,
  type DesignExecutionId,
  type DesignPlan,
  type DesignPlanId,
  type DesignRunState,
  type DesignScenarioId,
  type DesignStage,
  type DesignTenantId,
  type DesignWorkspaceId,
  type PlanSignal,
  type DesignSignalKind,
  type WorkspaceTag,
} from './contracts';

type OrchestratorRuntime = {
  readonly client: ReturnType<typeof createRegistryClient>;
  readonly store: DesignPlanStore;
  readonly hub: DesignPluginHub;
  readonly scheduler: DesignScheduler;
};

export interface OrchestratorConfig {
  readonly maxConcurrency: number;
  readonly clientMode?: RegistryClientOptions['mode'];
  readonly workspace?: {
    readonly tenant: DesignTenantId;
    readonly workspace: DesignWorkspaceId;
  };
  readonly queueWindowMs?: number;
}

export interface OrchestratorResult<TPlan extends DesignPlan = DesignPlan> {
  readonly plan: TPlan;
  readonly events: readonly string[];
  readonly diagnostics: readonly DesignDiagnostic[];
  readonly signals: readonly PlanSignal[];
  readonly executionId: DesignExecutionId;
  readonly windows: readonly { readonly from: number; readonly to: number; readonly count: number; readonly average: number }[];
}

export interface OrchestrationContext {
  readonly tenant: DesignTenantId;
  readonly workspace: DesignWorkspaceId;
  readonly registryMode: RegistryClientOptions['mode'];
  readonly startedAt: string;
}

export interface OrchestratorStats {
  readonly queueDepth: number;
  readonly runningCount: number;
  readonly totalStoredPlans: number;
}

export type OrchestrationEvent =
  | { readonly kind: 'boot' }
  | { readonly kind: 'plan-created'; readonly planId: DesignPlanId }
  | { readonly kind: 'plan-run'; readonly planId: DesignPlanId; readonly execution: DesignExecutionId }
  | { readonly kind: 'plan-complete'; readonly planId: DesignPlanId };

const eventLog = (kind: OrchestrationEvent['kind']): string => kind;

export class DesignOrchestrator {
  #runtime: OrchestratorRuntime;
  #events: OrchestrationEvent[] = [];
  #config: OrchestratorConfig;

  constructor({ plugins, config }: { plugins: readonly DesignPlugin[]; config?: OrchestratorConfig }) {
    this.#config = {
      maxConcurrency: config?.maxConcurrency ?? 3,
      clientMode: config?.clientMode ?? 'read-write',
      queueWindowMs: config?.queueWindowMs ?? 80,
      ...(config ?? {}),
    };
    const client = createRegistryClient({ mode: this.#config.clientMode ?? 'read-write' });
    const store = new DesignPlanStore();
    const hub = DesignPluginHub.from(plugins);
    const scheduler = new DesignScheduler(hub, store, {
      maxConcurrency: this.#config.maxConcurrency,
      queueWindowMs: this.#config.queueWindowMs ?? 80,
    });
    this.#runtime = { client, store, hub, scheduler };
    this.#events.push({ kind: 'boot' });
  }

  get context(): OrchestrationContext {
    return {
      tenant: this.#config.workspace?.tenant ?? makeDesignTenantId('tenant-default'),
      workspace: this.#config.workspace?.workspace ?? makeDesignWorkspaceId('workspace-default'),
      registryMode: this.#config.clientMode ?? 'read-write',
      startedAt: new Date().toISOString(),
    };
  }

  async bootstrap(tenantInput: string, workspaceInput: string): Promise<readonly string[]> {
    const tenant = makeDesignTenantId(tenantInput);
    const workspace = makeDesignWorkspaceId(workspaceInput);
    const events: string[] = [];
    const templates = builtinTemplates.filter((template) => template.tags.includes('tag:baseline'));
    for (const template of templates) {
      const plan = parsePlan({
        planId: makeDesignPlanId(tenant, workspace, template.scenarioId),
        tenantId: tenant,
        workspaceId: workspace,
        scenarioId: template.scenarioId,
        stage: template.phases[0] ?? 'intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        state: 'queued',
        steps: template.phases,
        tags: template.tags,
        confidence: 0.62,
        metadata: { source: 'bootstrap', template: template.templateId },
      });
      await this.savePlanFromTemplate(plan);
      events.push(`seed:${plan.planId}`);
    }
    return events;
  }

  async createPlan(
    tenantInput: string,
    workspaceInput: string,
    scenarioInput: string,
    stage: DesignStage = 'design',
  ): Promise<DesignPlanId> {
    const tenant = makeDesignTenantId(tenantInput);
    const workspace = makeDesignWorkspaceId(workspaceInput);
    const scenario = makeDesignScenarioId(tenantInput, scenarioInput);
    const planId = makeDesignPlanId(tenant, workspace, scenario);
    const template = parseTemplate({
      templateId: `manual:${scenarioInput}`,
      tenantId: tenant,
      workspaceId: workspace,
      scenarioId: scenario,
      phases: [stage, 'validate', 'execute', 'review'],
      tags: ['tag:manual'],
      tagsCsv: 'manual',
      nodes: [],
      metadata: { source: 'manual' },
    } as never);
    const plan = parsePlan({
      planId,
      tenantId: tenant,
      workspaceId: workspace,
      scenarioId: scenario,
      stage: template.phases[0] ?? 'design',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      state: 'queued',
      steps: template.phases,
      tags: template.tags,
      confidence: 0.77,
      metadata: { source: 'manual', scenarioInput },
    });
    await this.savePlanFromTemplate(plan);
    this.#events.push({ kind: 'plan-created', planId });
    return plan.planId;
  }

  async execute(planId: DesignPlanId): Promise<OrchestratorResult> {
    const row = this.#runtime.store.get(planId);
    if (!row) {
      throw new Error(`missing-plan:${planId}`);
    }
    const executionId = makeDesignExecutionId(planId, row.priority + 1);
    this.#events.push({ kind: 'plan-run', planId, execution: executionId });

    await this.#runtime.store.appendEvent(planId, 'started', { executionId: String(executionId), workspace: row.workspace });
    await this.#runtime.scheduler.enqueuePlan({
      planId,
      tenantId: makeDesignTenantId(row.tenant),
      workspaceId: makeDesignWorkspaceId(row.workspace),
      scenarioId: makeDesignScenarioId(row.tenant, row.scenario),
      stage: row.stage,
    });
    await this.#runtime.scheduler.pulse();

    const finalRow = this.#runtime.store.get(planId) ?? row;
    const diagnostics = this.collectDiagnostics(finalRow);
    const rawSignals = finalRow.signals as readonly PlanSignal[];
    const windows = this.collectSignalWindows(rawSignals);

    this.#events.push({ kind: 'plan-complete', planId });
    return {
      plan: this.denormalizePlanRow(finalRow),
      events: this.#events.map((event) => eventLog(event.kind)),
      diagnostics,
      signals: rawSignals,
      executionId,
      windows,
    };
  }

  async planSnapshot(planId: DesignPlanId): Promise<StoredPlanRow | undefined> {
    return this.#runtime.store.get(planId);
  }

  async listPlans(tenant?: string, workspace?: string): Promise<readonly StoredPlanRow[]> {
    return this.#runtime.store.query({ tenant, workspace });
  }

  async stats(): Promise<OrchestratorStats> {
    const rows = await this.#runtime.store.query();
    return {
      queueDepth: this.#runtime.scheduler.state.queueDepth,
      runningCount: this.#runtime.scheduler.state.running,
      totalStoredPlans: rows.length,
    };
  }

  async subscribe(planId: DesignPlanId): Promise<readonly string[]> {
    const events: string[] = [];
    const streamKind = this.selectMetric(planId);
    for await (const envelope of this.#runtime.client.streamSignals(planId, streamKind)) {
      const normalized = {
        ...envelope.signal,
        runId: planId,
      } as PlanSignal;
      await this.#runtime.store.appendSignal(planId, normalized);
      events.push(`${envelope.topic}:${normalized.id}`);
    }
    return events;
  }

  private async savePlanFromTemplate(plan: {
    readonly planId: DesignPlanId;
    readonly tenantId: DesignTenantId;
    readonly workspaceId: DesignWorkspaceId;
    readonly scenarioId: DesignScenarioId;
    readonly stage: DesignStage;
    readonly state: DesignRunState;
    readonly steps: readonly string[];
    readonly tags: readonly string[];
    readonly confidence: number;
    readonly metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.#runtime.store.upsert({
      planId: plan.planId,
      tenant: plan.tenantId,
      workspace: plan.workspaceId,
      scenario: plan.scenarioId,
      state: plan.state,
      stage: plan.stage,
      priority: this.#events.length + 1,
      tags: plan.tags,
      signals: [],
      events: [createPlanEvent('created', { source: 'orchestrator', confidence: plan.confidence })],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: plan.metadata,
    } as never);
  }

  private collectDiagnostics(row: StoredPlanRow<unknown>): readonly DesignDiagnostic[] {
    if (!row.events.length) {
      return [
        {
          scope: 'design/diagnostics',
          kind: 'design/diagnostics',
          message: 'plan has no lifecycle events',
          details: { planId: row.planId },
        },
      ];
    }
    const template = buildPlanWindow([
      parseTemplate({
        templateId: `snapshot-${row.scenario}`,
        tenantId: makeDesignTenantId(row.tenant),
        workspaceId: makeDesignWorkspaceId(row.workspace),
        scenarioId: makeDesignScenarioId(row.tenant, row.scenario),
        phases: [row.stage, 'review'],
        tags: row.tags.map((tag) => (tag.startsWith('tag:') ? (tag as WorkspaceTag) : (`tag:${tag}` as WorkspaceTag))),
        tagsCsv: row.tags.join(','),
        nodes: [],
        metadata: { source: 'snapshot' },
      } as never),
    ]);
    return [
      {
        scope: 'design/diagnostics',
        kind: 'design/runtime',
        message: `template:${template[0] ?? 'missing'} rows=${row.events.length}`,
        details: { stage: row.stage, events: row.events.length },
      },
    ];
  }

  private collectSignalWindows(signals: readonly PlanSignal[]): readonly { readonly from: number; readonly to: number; readonly count: number; readonly average: number }[] {
    const raw = signals.map((signal) => ({
      runId: signal.runId,
      metric: signal.metric,
      stage: signal.stage,
      sequence: Number(signal.id.split(':').at(-1) ?? 0),
      timestamp: new Date().toISOString(),
      payload: { value: signal.value },
    }));
    const normalized = normalizeSignals(raw);
    const byMetric = splitSignals(normalized);
    void byMetric;
    return collectWindows(normalized, 4);
  }

  private denormalizePlanRow(row: StoredPlanRow<unknown>): DesignPlan {
    return {
      planId: row.planId,
      tenantId: makeDesignTenantId(row.tenant),
      workspaceId: makeDesignWorkspaceId(row.workspace),
      scenarioId: makeDesignScenarioId(row.tenant, row.scenario),
      stage: row.stage,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      state: row.state,
      steps: row.planId.split(':'),
      tags: row.tags.map((tag) =>
        tag.startsWith('tag:') ? (`${tag}` as `tag:${string}`) : (`tag:${tag}` as `tag:${string}`),
      ),
      confidence: 0.86,
      metadata: row.metadata,
    };
  }

  private _selector = new Map<DesignSignalKind, string>([
    ['health', 'health'],
    ['capacity', 'capacity'],
    ['compliance', 'compliance'],
    ['cost', 'cost'],
    ['risk', 'risk'],
  ]);

  private _selectMetric(planId: DesignPlanId): DesignSignalKind {
    const index = Number(planId.split(':')[0].length % this._selector.size);
    return [...this._selector.values()][index] as DesignSignalKind;
  }

  private selectMetric(planId: DesignPlanId): DesignSignalKind {
    return this._selectMetric(planId);
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#runtime.scheduler[Symbol.asyncDispose]();
    return this.#runtime.client[Symbol.asyncDispose]?.() ?? Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.#runtime.scheduler[Symbol.dispose]();
    this.#runtime.client[Symbol.dispose]?.();
  }
}

export const createDesignOrchestrator = <TPlugins extends readonly DesignPlugin[]>(
  options: { readonly plugins: TPlugins; readonly config?: OrchestratorConfig },
): DesignOrchestrator => new DesignOrchestrator(options);
