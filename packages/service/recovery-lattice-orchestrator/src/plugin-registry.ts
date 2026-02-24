import { NoInfer } from '@shared/type-level';
import { withBrand } from '@shared/core';
import {
  asRouteId,
  asRunId,
  asTenantId,
  asRegionId,
  asZoneId,
  makeTimestamp,
  type BrandedTimestamp,
  type LatticeRouteId,
  type LatticeTenantId,
} from '@domain/recovery-lattice';
import {
  LatticePluginFleet,
  createDefaultFleet,
  normalizeFleetStatus,
  type FleetMode,
  type FleetRegistration,
} from '@domain/recovery-lattice';
import {
  type PluginEnvelope,
  type PluginKind,
  type PluginResult,
  type PluginContext,
  type PluginStatus,
} from '@domain/recovery-lattice';
import {
  seedProfiles,
  LatticePolicyEngine,
  type PolicyManifest,
  PolicyEvaluationInput,
  type PolicyEvaluatorResult,
  type PolicyMode,
} from '@domain/recovery-lattice';
import {
  type LatticeSnapshotRecord,
  type LatticeStoreEvent,
  type LatticeStoreId,
} from '@data/recovery-lattice-orchestrator-store';

export type FleetEventKind = 'enabled' | 'disabled' | 'refresh';

export interface FleetRecord {
  readonly id: string;
  readonly tenantId: LatticeTenantId;
  readonly mode: FleetEventKind;
  readonly policyMode: PolicyMode;
  readonly requestId: BrandedTimestamp;
  readonly createdAt: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface PluginCoordinationState<TPlugins extends readonly PluginEnvelope[]> {
  readonly tenantId: LatticeTenantId;
  readonly namespace: string;
  readonly mode: FleetMode;
  readonly registration: FleetRegistration<TPlugins>;
  readonly pluginCount: number;
}

export interface FleetExecutionResult<TInput, TOutput> {
  readonly requestId: BrandedTimestamp;
  readonly status: PluginStatus;
  readonly output: TOutput;
  readonly warnings: readonly string[];
  readonly events: readonly FleetRecord[];
}

export interface LatticePluginContext {
  readonly tenantId: LatticeTenantId;
  readonly routeId: LatticeRouteId;
  readonly requestId: string;
  readonly policyMode: PolicyMode;
}

type AsyncStack = {
  use<T>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void;
  [Symbol.asyncDispose](): Promise<void>;
};

const asyncStackFactory = (): { new (): AsyncStack } => {
  const fallback = class {
    readonly #resources = new Set<() => PromiseLike<void>>();
    use<T>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void {
      const dispose = resource?.[Symbol.asyncDispose];
      if (typeof dispose === 'function') {
        this.#resources.add(() => dispose.call(resource));
      }
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (const dispose of [...this.#resources]) {
        await dispose();
      }
      this.#resources.clear();
    }
  };
  return (
    (globalThis as { AsyncDisposableStack?: { new (): AsyncStack } }).AsyncDisposableStack ?? fallback
  );
};

export interface PluginRegistryOptions {
  readonly namespace: string;
  readonly maxConcurrency: number;
  readonly allowOverride: boolean;
}

const defaultPolicyState = (tenantId: LatticeTenantId) => {
  const engine = new LatticePolicyEngine(tenantId, []);
  const profiles: PolicyManifest[] = seedProfiles(tenantId).map((profile) => ({
    tenantId,
    route: asRouteId(`policy:${profile.name}`),
    direction: 'internal',
    policies: [],
  }));
  engine.bulkAdd(profiles);
  return engine;
};

export class LatticePluginCoordinator<const TPlugins extends readonly PluginEnvelope[]> {
  readonly #tenantId: LatticeTenantId;
  readonly #namespace: string;
  readonly #fleet: LatticePluginFleet<TPlugins>;
  readonly #policies = defaultPolicyState(asTenantId('tenant:recovery-lattice-orchestrator'));
  readonly #events: FleetRecord[] = [];
  #status: FleetMode = 'idle';

  public constructor(
    tenantId: LatticeTenantId,
    namespace: string,
    plugins: TPlugins,
    private readonly options: PluginRegistryOptions,
  ) {
    this.#tenantId = tenantId;
    this.#namespace = namespace;
    this.#fleet = createDefaultFleet(namespace, plugins, {
      namespace,
      allowOverride: options.allowOverride,
      maxConcurrent: options.maxConcurrency,
    });
    this.#status = 'ready';
  }

  public get status(): FleetMode {
    return this.#status;
  }

  public get tenantId(): LatticeTenantId {
    return this.#tenantId;
  }

  public get namespace(): string {
    return this.#namespace;
  }

  public get summary(): PluginCoordinationState<TPlugins> {
    return {
      tenantId: this.#tenantId,
      namespace: this.#namespace,
      mode: this.#status,
      registration: normalizeFleetStatus(this.#fleet),
      pluginCount: this.#fleet.count,
    };
  }

  public listByKind<TKind extends PluginKind>(
    kind: TKind,
  ): readonly TPlugins[number][] {
    return this.#fleet.listByKind(kind) as readonly TPlugins[number][];
  }

  public async evaluatePolicies<TContext extends Record<string, unknown>>(input: {
    readonly routeId: LatticeRouteId;
    readonly mode: PolicyMode;
    readonly constraints: PolicyEvaluationInput<TContext>['constraints'];
    readonly context: NoInfer<TContext>;
  }): Promise<PolicyEvaluatorResult<TContext>> {
    const baseInput: PolicyEvaluationInput<Record<string, unknown>> = {
      tenantId: this.#tenantId,
      route: input.routeId,
      mode: input.mode,
      constraints: input.constraints as PolicyEvaluationInput<Record<string, unknown>>['constraints'],
    };
    const outcome = this.#policies.evaluate(baseInput);
    return outcome as PolicyEvaluatorResult<TContext>;
  }

  public async executePlugin<TInput, TOutput>(
    routeId: LatticeRouteId,
    kind: PluginKind,
    pluginName: string,
    payload: NoInfer<TInput>,
    context: Omit<LatticePluginContext, 'routeId'>,
    fallback: TOutput,
  ): Promise<FleetExecutionResult<TInput, TOutput>> {
    const pluginContext: PluginContext = {
      requestId: makeTimestamp(),
      namespace: this.#namespace,
      tags: [kind, context.policyMode],
    };

    const result = await this.#fleet.execute(kind, pluginName, payload, pluginContext, fallback);
    const event = {
      id: withBrand(`${routeId}:${pluginName}`, 'lattice-store-event'),
      tenantId: this.#tenantId,
      at: new Date().toISOString(),
      kind: 'plan' as const,
      payload: {
        kind,
        pluginName,
        status: result.status,
      },
    };

    this.#events.push({
      id: `${routeId}::${pluginName}::${Date.now()}`,
      tenantId: this.#tenantId,
      requestId: pluginContext.requestId,
      policyMode: context.policyMode,
      mode: 'enabled',
      createdAt: new Date().toISOString(),
      details: event.payload,
    });

    return {
      requestId: pluginContext.requestId,
      status: result.status,
      output: result.payload,
      warnings: result.warnings,
      events: [
        ...this.#events,
      ],
    };
  }

  public takeEvents(limit = 20): readonly FleetRecord[] {
    return this.#events.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, limit);
  }

  public async close(reason: string): Promise<readonly LatticeStoreEvent[]> {
    const closure: LatticeStoreEvent[] = [];
    const runId = asRunId(`run:${this.#tenantId}:${Date.now().toString(36)}`);
    const snapshot: LatticeSnapshotRecord = {
      id: withBrand(`snapshot:${reason}`, 'lattice-store-id') as LatticeStoreId,
      routeId: asRouteId(`route:${this.#namespace}:close`),
      tenantId: this.#tenantId,
      context: {
        tenantId: this.#tenantId,
        regionId: asRegionId('region:close'),
        zoneId: asZoneId('zone:close'),
        requestId: withBrand(`trace:${reason}`, 'lattice-trace-id'),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['close'],
      payload: { reason },
      events: [],
    };

    if (this.#status !== 'closed') {
      this.#status = 'closed';
      closure.push({
        id: withBrand(`close:${snapshot.id}`, 'lattice-store-event'),
        runId,
        tenantId: this.#tenantId,
        at: new Date().toISOString(),
        kind: 'artifact',
        payload: { status: 'closed', route: snapshot.routeId },
      });
    }

    return closure;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    const Stack = asyncStackFactory();
    await using stack = new Stack();
    await this.#policies[Symbol.asyncDispose]();
    await this.#fleet[Symbol.asyncDispose]();
    stack.use({
      [Symbol.asyncDispose]: async () => {
        this.#status = 'closed';
      },
    });
  }
}

export const buildOrchestratorFleet = async <TPlugins extends readonly PluginEnvelope[]>(
  tenantId: LatticeTenantId,
  namespace: string,
  plugins: TPlugins,
  options?: Partial<PluginRegistryOptions>,
): Promise<LatticePluginCoordinator<TPlugins>> => {
  const coordinator = new LatticePluginCoordinator(
    tenantId,
    namespace,
    plugins,
    {
      namespace,
      allowOverride: true,
      maxConcurrency: 24,
      ...options,
    },
  );

  void coordinator;
  return coordinator;
};
