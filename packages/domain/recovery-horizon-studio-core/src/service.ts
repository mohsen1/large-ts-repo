import { randomBytes } from 'node:crypto';
import { err, ok, type Result } from '@shared/result';
import type {
  JsonLike,
  PluginStage,
  PluginPayload,
  HorizonSignal,
  HorizonPlan,
  TimeMs,
} from '@domain/recovery-horizon-engine';
import type { JsonValue } from '@shared/type-level';
import { PluginRegistry } from './registry.js';
import { AdapterRegistry, buildFallbackAdapters } from './adapters.js';
import { StudioScheduler } from './scheduler.js';
import {
  type WorkspaceId,
  type RunSessionId,
  type ProfileId,
  type StudioWorkspace,
  type WorkspaceIntent,
  type WorkspaceServiceResult,
  type WorkspaceServiceFailure,
  asWorkspaceId,
  asRunSessionId,
  asProfileId,
  normalizeWeights,
  stageWeights,
  asTime,
  asStageSpan,
} from './types.js';
import { createTelemetrySession } from './telemetry.js';

interface StudioPlanCatalog {
  readonly id: string;
  readonly tenantId: string;
  readonly stageOrder: readonly PluginStage[];
}

const FALLBACK_PLAN: StudioPlanCatalog = {
  id: 'default-plan',
  tenantId: 'tenant-001',
  stageOrder: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
};

const bootstrapCatalog = async (): Promise<readonly StudioPlanCatalog[]> =>
  Promise.resolve([
    FALLBACK_PLAN,
    {
      id: `seed-${Date.now()}`,
      tenantId: 'tenant-002',
      stageOrder: ['ingest', 'analyze', 'resolve'] as const,
    },
  ]).then((records) =>
    records
      .toSorted((left, right) => left.tenantId.localeCompare(right.tenantId))
      .map((entry, index) => ({
        ...entry,
        id: `${entry.id}-${index}`,
      })),
  );

const normalizeCatalog = (catalog: StudioPlanCatalog): StudioPlanCatalog => ({
  ...catalog,
  stageOrder: catalog.stageOrder.toSorted((left, right) => left.localeCompare(right)),
});

const makeWorkspaceSeed = (intent: WorkspaceIntent): StudioWorkspace => {
  const workspaceId = asWorkspaceId(`ws-${intent.tenantId}-${Date.now()}`);
  const sessionId = asRunSessionId(`run-${intent.tenantId}-${Date.now()}`);
  const profileId = asProfileId(`profile-${intent.owner}`);
  return {
    workspaceId,
    profileId,
    sessionId,
    intent,
    plans: [],
    signals: [],
    createdAt: asTime(Date.now()),
  };
};

const buildPlan = (
  sessionId: RunSessionId,
  tenantId: string,
  stages: readonly PluginStage[],
  signals: readonly HorizonSignal<PluginStage, JsonLike>[],
): HorizonPlan => ({
  id: sessionId as unknown as HorizonPlan['id'],
  tenantId,
  startedAt: asTime(Date.now()),
  pluginSpan: asStageSpan(stages[0] ?? 'ingest'),
  payload: {
    taskCount: signals.length,
    catalogSeed: randomBytes(6).toString('hex'),
    stages,
  },
});

class StudioScope {
  readonly #workspaceId: WorkspaceId;
  readonly #sessionId: RunSessionId;
  readonly #profileId: ProfileId;
  readonly #registry: PluginRegistry<readonly PluginStage[]>;
  readonly #adapters: AdapterRegistry<readonly PluginStage[]>;
  readonly #scheduler: StudioScheduler;
  readonly #intent: WorkspaceIntent;

  constructor(intent: WorkspaceIntent) {
    const seed = makeWorkspaceSeed(intent);
    this.#workspaceId = seed.workspaceId;
    this.#sessionId = seed.sessionId;
    this.#profileId = seed.profileId;
    this.#intent = intent;
    this.#registry = new PluginRegistry(seed.intent.stages, this.#profileId);
    this.#adapters = new AdapterRegistry(['ingest', 'analyze', 'resolve', 'optimize', 'execute']);
    this.#scheduler = new StudioScheduler(this.#workspaceId, this.#sessionId, this.#profileId, this.#adapters);

    for (const fallback of buildFallbackAdapters(this.#scheduler.stages)) {
      this.#adapters.register(fallback);
    }
  }

  get workspaceId() {
    return this.#workspaceId;
  }

  async run(): Promise<WorkspaceServiceResult> {
    const { emit } = createTelemetrySession(this.#workspaceId, this.#profileId);
    const catalog = (await bootstrapCatalog())
      .map(normalizeCatalog)
      .find((entry) => entry.tenantId === this.#intent.tenantId) ?? FALLBACK_PLAN;
    const stageOrder = catalog.stageOrder;
    emit('info', `resolved stages ${stageOrder.join(',')}`, stageOrder[0] ?? 'ingest');

    const normalized = stageWeights(stageOrder);
    const signalPayload: JsonValue = {
      workspaceId: String(this.#workspaceId),
      tenantId: this.#intent.tenantId,
      stages: [...stageOrder],
    };
    const signalPayloads: JsonLike[] = stageOrder.length > 0 ? [signalPayload as JsonLike] : [];
    const signals = await this.#scheduler.runWorkspace(signalPayloads as readonly PluginPayload[], undefined);

    const plan = buildPlan(this.#sessionId, this.#intent.tenantId, stageOrder, signals);
    const workspace: StudioWorkspace = {
      workspaceId: this.#workspaceId,
      profileId: this.#profileId,
      sessionId: this.#sessionId,
      intent: {
        ...this.#intent,
        stages: normalizeWeights(stageOrder).map((entry) => entry.stage),
      },
      plans: [plan],
      signals,
      createdAt: asTime(Date.now()),
    };

    return {
      ok: true,
      state: {
        workspaceId: this.#workspaceId,
        selectedPlan: plan.id,
        active: signals.length > 0,
        stageWindow: normalized,
        sessionAgeMs: asTime(Date.now()),
      },
      workspace,
    };
  }

  close() {
    this.#registry.close();
    this.#adapters.clear();
  }
}

export interface CreateWorkspaceInput {
  readonly tenantId: string;
  readonly owner: string;
  readonly tags?: readonly string[];
  readonly plans?: readonly string[];
}

export const createWorkspaceIntent = (input: CreateWorkspaceInput): WorkspaceIntent => ({
  tenantId: input.tenantId,
  stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const,
  owner: input.owner,
  tags: input.tags ?? ['api', 'generated'],
  runLabel: `${input.owner}/${input.tenantId}`,
});

export const createStudioService = () => {
  const active = new Map<WorkspaceId, StudioScope>();

  return {
    async start(input: CreateWorkspaceInput): Promise<Result<WorkspaceServiceResult, WorkspaceServiceFailure>> {
      const scope = new StudioScope(createWorkspaceIntent(input));
      const workspaceId = scope.workspaceId;
      active.set(workspaceId, scope);

      const result = await scope.run();
      return ok(result);
    },

    async run(
      workspaceId: WorkspaceId,
      intent: WorkspaceIntent,
    ): Promise<Result<WorkspaceServiceResult, WorkspaceServiceFailure>> {
      const scope = active.get(workspaceId);
      if (!scope) {
        return err<WorkspaceServiceFailure>({ ok: false, reason: 'workspace missing' });
      }

      const result = await scope.run();
      return ok({
        ...result,
        workspace: {
          ...result.workspace,
          intent: {
            ...intent,
            runLabel: result.workspace.intent.runLabel ?? `${intent.owner}:${intent.tenantId}`,
          },
        },
      });
    },

    stop(workspaceId: WorkspaceId): boolean {
      const scope = active.get(workspaceId);
      if (!scope) {
        return false;
      }

      scope.close();
      active.delete(workspaceId);
      return true;
    },

    async health(): Promise<readonly string[]> {
      return [...active.keys()].map((workspace) => workspace).toSorted();
    },
  };
};
