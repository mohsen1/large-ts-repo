import {
  asChronicleChannel,
  asChronicleRunId,
  asChronicleStepId,
  asChronicleTag,
  asChronicleTenantId,
  asChroniclePhase,
  buildTrace,
  ChronicleContext,
  ChronicleExecutionTrace,
  ChroniclePluginDescriptor,
  ChroniclePlanId,
  ChroniclePriority,
  ChronicleRunId,
  ChronicleScenario,
  ChroniclePhase,
  ChroniclePhaseInput,
  ChronicleStatus,
  type ChronicleTenantId,
  type ChronicleRoute,
  type ChronicleObservation,
  ChroniclePluginRegistry,
} from '@domain/recovery-chronicle-core';
import {
  ChronicleInMemoryAdapter,
  ChronicleRepository,
  type ChronicleStorePolicy,
  defaultChronicleStorePolicy,
} from '@data/recovery-chronicle-store';
import { fail, ok, type Result } from '@shared/result';
import { composeBlueprintScenario } from './adapters.js';

export interface ChronoRunOptions {
  readonly tenantPrefix?: string;
  readonly route?: ChronicleRoute;
  readonly policy?: ChronicleStorePolicy;
  readonly plugins?: readonly ChroniclePluginDescriptor[];
}

export interface OrchestratorWorkspace {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleScenario['route'];
  readonly runId: ChronicleRunId;
  readonly status: ChronicleStatus;
  readonly metrics: {
    readonly score: number;
    readonly phases: number;
    readonly priorities: readonly ChroniclePriority[];
  };
}

const toTimelineLabel = (route: ChronicleScenario['route'], phase: ChroniclePhase<string>): string =>
  `${route}::${phase}` as const;

export class ChronicleService {
  readonly #registry: ChroniclePluginRegistry<readonly ChroniclePluginDescriptor[]>;
  readonly #store: ChronicleRepository;
  readonly #policy: ChronicleStorePolicy;

  public constructor(
    private readonly scenario: ChronicleScenario,
    private readonly options: ChronoRunOptions = {},
    plugins: readonly ChroniclePluginDescriptor[] = [],
  ) {
    this.#registry = new ChroniclePluginRegistry<readonly ChroniclePluginDescriptor[]>(plugins);
    this.#policy = options.policy ?? defaultChronicleStorePolicy;
    this.#store = new ChronicleRepository(this.#policy);
  }

  public async runWorkspace(input: {
    planId?: ChroniclePlanId;
    phases?: readonly ChroniclePhase<string>[];
  }): Promise<Result<OrchestratorWorkspace>> {
    const planId = input.planId ?? this.scenario.id;
    const runId = asChronicleRunId(planId);
    const timeline = [asChronicleTag('runtime'), asChronicleChannel(this.scenario.route), 'control'] as const;
    const trace = buildTrace(runId, this.#registry.list().length);
    const phases = input.phases ?? (['phase:bootstrap', 'phase:execution', 'phase:verification'] as const);
    const outputs: ChronicleStatus[] = [];

    for (const phase of phases) {
      const payload = {
        stepId: asChronicleStepId(`${phase}-${runId}`),
        runId,
        tenant: this.scenario.tenant,
        route: this.scenario.route,
        timeline,
        phase,
        payload: {
          manifest: toTimelineLabel(this.scenario.route, phase),
          tenant: this.scenario.tenant,
          priorities: ['p0', 'p1', 'p2', 'p3'] as const,
          state: {
            route: this.scenario.route,
            phase,
          },
        },
      };
      const result = await this.#runPhase(payload, trace);
      outputs.push(result.status);
    }

    const workspace: OrchestratorWorkspace = {
      tenant: this.scenario.tenant,
      route: this.scenario.route,
      runId,
      status: outputs.at(-1) ?? 'queued',
      metrics: {
        score: outputs.length * 100 + trace.phases.length,
        phases: outputs.length,
        priorities: ['p0', 'p1', 'p2', 'p3'],
      },
    };
    return ok(workspace);
  }

  async #runPhase<TInput>(
    payload: ChroniclePhaseInput<TInput>,
    trace: ChronicleExecutionTrace,
  ) {
    return this.#registry.runAll(payload, trace);
  }

  public async persistRun(
    workspace: OrchestratorWorkspace,
    events: readonly unknown[],
  ): Promise<Result<number>> {
    const adapter = new ChronicleInMemoryAdapter(this.#store);
    const observations = events.map((event, index) => ({
      id: `${workspace.runId}:obs:${index}` as ChronicleObservation['id'],
      kind: `event:run` as ChronicleObservation['kind'],
      route: workspace.route,
      tenant: workspace.tenant,
      runId: workspace.runId,
      timestamp: Date.now() + index,
      source: asChronicleTag('persist'),
      phase: asChroniclePhase('verification'),
      value: {
        event,
        at: Date.now(),
      },
    }));

    const result = await adapter.writeScenarioRun(this.scenario, observations);
    if (!result.ok) return fail(result.error, result.code);
    return ok(result.value);
  }

  public async recover(runId: ChronicleRunId): Promise<Result<ChronicleContext | undefined>> {
    const adapter = new ChronicleInMemoryAdapter(this.#store);
    const snapshot = await adapter.repository.snapshot(this.scenario.id);
    if (!snapshot) return ok(undefined);
    return ok({
      tenant: snapshot.blueprint.tenant,
      runId,
      plan: snapshot.id,
      route: snapshot.blueprint.route,
      state: { recovered: true, totalEvents: snapshot.totalEvents },
      priorities: ['p0', 'p2', 'p3'],
      timeline: [asChronicleTag('recovery'), asChronicleChannel(snapshot.blueprint.route), 'control'],
    });
  }

  public async report(planId: ChroniclePlanId): Promise<Result<readonly string[]>> {
    const rows = await this.#store.queryByPlan(planId);
    if (rows.length === 0) return fail(new Error(`no rows for ${planId}`), 'not-found');
    return ok(rows.map((row, index) => `${index + 1}. ${row.id} @ ${new Date(row.createdAt).toISOString()}`));
  }

  public async collectByTenant(tenant: ChronicleTenantId): Promise<readonly ChronicleContext[]> {
    const rows = await this.#store.listByTenant(tenant);
    return rows.map((row) => ({
      tenant,
      runId: row.runId,
      plan: this.scenario.id,
      route: row.route,
      state: { rowId: row.id },
      priorities: ['p1', 'p2'],
      timeline: [asChronicleTag('tenant'), asChronicleChannel(row.route), 'control'],
    }));
  }

  public async dispose(): Promise<void> {
    this.#store.clear();
  }
}

export const runOrchestrator = async <TPlugins extends readonly ChroniclePluginDescriptor[]>(
  scenario: ChronicleScenario,
  plugins: TPlugins,
): Promise<Result<OrchestratorWorkspace>> => {
  const service = new ChronicleService(scenario, {
    plugins,
  });
  return service.runWorkspace({
    phases: ['phase:bootstrap', 'phase:execution', 'phase:verification'],
  });
};

export const collectScenarioRun = async (scenarioName: string): Promise<Result<OrchestratorWorkspace>> => {
  const scenario = composeBlueprintScenario(
    asChronicleTenantId('tenant:auto'),
    scenarioName,
    'chronicle://auto' as ChronicleRoute,
  );
  const service = new ChronicleService(scenario);
  return service.runWorkspace({
    phases: ['phase:bootstrap', 'phase:execution'],
  });
};
