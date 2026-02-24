import { withBrand } from '@shared/core';
import { ok, fail } from '@shared/result';
import { NoInfer } from '@shared/type-level';
import {
  asRouteId,
  asRunId,
  createCollector,
  createPlanContext,
  collectBlueprintMetrics,
  makeMetricId,
  metricSummary,
  type LatticeContext,
  type LatticeRouteId,
  type LatticeTenantId,
} from '@domain/recovery-lattice';
import { LatticeServiceRegistry, isFrozen } from '@domain/recovery-lattice';
import {
  hydrate,
  withRepository,
  type LatticeSnapshotRecord,
  type LatticeStoreId,
  type LatticeStoreOptions,
} from '@data/recovery-lattice-orchestrator-store';
import { executePipeline } from './pipeline';
import {
  type LatticeOrchestratorEvent,
  type LatticeOrchestratorRequest,
  type LatticeOrchestratorResult,
  type LatticePlanResult,
  type LatticeSessionHandle,
  type LatticeOrchestratorStatus,
  type LatticeOperationStatus,
  type WithResult,
} from './types';

interface ActiveSession {
  readonly id: string;
  readonly startedAt: string;
  stopToken: { active: boolean };
  readonly request: LatticeOrchestratorRequest;
  readonly context: LatticeContext;
  readonly events: LatticeOrchestratorEvent[];
}

export interface OrchestratorConfig {
  readonly tenantId: LatticeTenantId;
  readonly namespace: string;
  readonly repositoryOptions?: Partial<LatticeStoreOptions>;
}

export class RecoveryLatticeOrchestrator {
  readonly #tenantId: LatticeTenantId;
  readonly #namespace: string;
  readonly #requests = new Map<string, ActiveSession>();

  public constructor(private readonly config: OrchestratorConfig) {
    this.#tenantId = config.tenantId;
    this.#namespace = config.namespace;
  }

  public async requestBlueprintAnalysis<TPayload>(
    request: NoInfer<LatticeOrchestratorRequest<TPayload>>,
  ): Promise<WithResult<LatticePlanResult>> {
    const diagnostics = request.blueprint.steps.map((step) => `${step.kind}:${step.target}`);
    const result: LatticePlanResult = {
      blueprint: request.blueprint,
      route: String(request.routeId),
      ok: request.blueprint.steps.length > 0,
      diagnostics,
      snapshot: null,
    };
    return result.ok ? ok(result) : fail(new Error('No steps in blueprint'));
  }

  public async run<TPayload>(
    request: NoInfer<LatticeOrchestratorRequest<TPayload>>,
  ): Promise<LatticeOrchestratorResult> {
    const routeId = request.routeId ?? asRouteId(`route:${request.tenantId}:${Date.now().toString(36)}`);
    const context = request.context ?? createPlanContext(request.tenantId);
    const startedAt = new Date().toISOString();
    const sessionId = withBrand(`session:${startedAt}`, 'lattice-trace-id');
    const trace = withBrand(`${sessionId}::run`, 'lattice-trace-id');
    const stopToken = { active: true };

    this.#requests.set(sessionId, {
      id: sessionId,
      startedAt,
      request: { ...request, routeId, context },
      stopToken,
      context,
      events: [],
    });

    try {
      const registry = await this.#buildRegistry(request);
      if (isFrozen(registry)) {
        throw new Error('registry-frozen');
      }

      await this.#emit(sessionId, 'stage.started', { routeId, stage: 'registry' });
      const analysis = await this.requestBlueprintAnalysis(request);
      if (!analysis.ok) {
        return this.#failure(routeId, trace, startedAt, analysis.error);
      }

      const metricCollector = createCollector<LatticeContext>(
        request.tenantId,
        String(routeId),
        makeMetricId(request.tenantId, String(routeId)),
        {
          maxSamples: 64,
          windowMs: 120_000,
          thresholds: [25, 100, 250],
        },
      );

      metricCollector.record({
        tenantId: request.tenantId,
        timestamp: withBrand(new Date().toISOString(), 'lattice-timestamp'),
        name: makeMetricId(request.tenantId, String(routeId)),
        unit: 'count',
        value: request.blueprint.steps.length,
        severity: 'stable',
        context,
        tags: [request.mode],
      });

      const outcome = await executePipeline(request);
      const metricWindow = metricCollector.snapshot();
      await collectBlueprintMetrics(context, request.blueprint, metricWindow.samples);
      await metricCollector[Symbol.asyncDispose]();

      await this.#emit(sessionId, 'stage.finished', { snapshotWindow: metricSummary(context, metricWindow) });
      await this.#persistRunArtifact(request, context, outcome.output, registry);

      return {
        status: 'completed' as LatticeOperationStatus,
        routeId,
        trace,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.#emit(sessionId, 'stage.failed', {
        routeId,
        cause: error instanceof Error ? error.message : String(error),
      });
      return this.#failure(routeId, trace, startedAt, error);
    } finally {
      this.#requests.delete(sessionId);
    }
  }

  public async stop(routeId: LatticeRouteId): Promise<boolean> {
    const session = Array.from(this.#requests.values()).find((entry) => entry.request.routeId === routeId);
    if (!session) return false;
    session.stopToken.active = false;
    return true;
  }

  public listActive(): readonly LatticeSessionHandle[] {
    return [...this.#requests.values()].map((entry) => ({
      id: entry.id,
      stop: async () => {
        entry.stopToken.active = false;
        return true;
      },
      state: {
        tenantId: entry.request.tenantId,
        requestId: entry.id,
        context: entry.context,
        status: 'executing',
        logs: [...entry.events],
        mode: entry.request.mode,
      },
    }));
  }

  async #buildRegistry(request: LatticeOrchestratorRequest): Promise<LatticeServiceRegistry> {
    const registry = new LatticeServiceRegistry(request.tenantId, this.#namespace, []);
    registry.openBlueprint(request.blueprint);
    return registry;
  }

  async #persistRunArtifact<TPayload>(
    request: LatticeOrchestratorRequest<TPayload>,
    context: LatticeContext,
    output: TPayload,
    _registry: LatticeServiceRegistry,
  ): Promise<LatticeSnapshotRecord> {
    return withRepository({ namespace: this.#namespace, ...this.config.repositoryOptions }, async (repository) => {
      const runId = asRunId(`run:${request.routeId}`);
      const record = await repository.upsert({
        id: withBrand(`${request.routeId}:snapshot`, 'lattice-store-id') as LatticeStoreId,
        routeId: request.routeId,
        tenantId: request.tenantId,
        context,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [request.mode],
        payload: {
          output,
          mode: request.mode,
          trace: context.requestId,
        },
        events: [
          {
            id: withBrand(`${request.routeId}:start`, 'lattice-store-event'),
            runId,
            tenantId: request.tenantId,
            at: new Date().toISOString(),
            kind: 'plan',
            payload: { mode: request.mode },
          },
        ],
      });

      await repository.appendEvent(request.tenantId, runId, record.id, {
        kind: 'artifact',
        payload: { status: 'running', route: String(request.routeId), steps: request.blueprint.steps.length },
      });

      return hydrate(record);
    });
  }

  async #emit(sessionId: string, type: LatticeOrchestratorEvent['type'], details: Record<string, unknown>): Promise<void> {
    const entry = this.#requests.get(sessionId);
    if (!entry) return;
    entry.events.push({
      id: `${sessionId}:${type}:${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      type,
      details,
    });
  }

  #failure(routeId: LatticeRouteId, trace: string, startedAt: string, error: unknown): LatticeOrchestratorResult {
    return {
      status: 'failed',
      routeId,
      trace,
      startedAt,
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const createLatticeOrchestrator = async (config: OrchestratorConfig): Promise<RecoveryLatticeOrchestrator> =>
  new RecoveryLatticeOrchestrator(config);

export const withOrchestrator = async <
  TOutput,
>(
  config: OrchestratorConfig,
  handler: (orchestrator: RecoveryLatticeOrchestrator) => Promise<TOutput>,
): Promise<TOutput> => {
  const orchestrator = await createLatticeOrchestrator(config);
  return handler(orchestrator);
};
