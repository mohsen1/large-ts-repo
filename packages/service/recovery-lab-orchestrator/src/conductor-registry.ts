import type { NoInfer } from '@shared/type-level';
import type { LabExecutionResult, LabLane, LabPlanTemplate, LabScenario, ScenarioSignal } from '@domain/recovery-simulation-lab-core';
import { collect } from '@shared/recovery-lab-kernel';
import { createDisposableScope } from '@shared/recovery-lab-kernel';
import {
  asLabTenantId,
  asLabScenarioId,
  asLabPluginId,
  type LabTenantId,
  type LabPluginId,
} from '@shared/recovery-lab-kernel';
import {
  buildWorkflowChain,
  type PluginChain,
  type PluginDefinition,
  type WorkflowResult,
  type WorkflowTag,
  type AnyPlugin,
  toWorkflowTag,
  routeTrace,
  summarizeExecution,
  type WorkflowAudit,
  buildWorkflowTag,
} from '@domain/recovery-simulation-lab-core';

export type RegistryTag = `registry:${string}`;
export type RegistryKey<T extends string> = `reg:${T}`;
export type RegistryScope = `${string}:scope:${string}`;

export interface ConductorPluginConfig {
  readonly tenant: string;
  readonly lane: LabLane;
  readonly mode: 'safe' | 'aggressive' | 'adaptive';
  readonly concurrency?: number;
}

export interface ConductorPluginSnapshot {
  readonly id: string;
  readonly state: 'idle' | 'running' | 'complete';
  readonly lane: LabLane;
  readonly route: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConductorPluginContext {
  readonly tenant: string;
  readonly workspace: string;
  readonly stage: string;
  readonly tags: readonly RegistryTag[];
  readonly tenantId: LabTenantId;
}

export interface ConductorPluginError {
  readonly pluginId: string;
  readonly at: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface ConductorRegistryResult {
  readonly chain: PluginChain<readonly AnyPlugin[]>;
  readonly output: WorkflowResult<readonly AnyPlugin[]>;
  readonly errors: readonly ConductorPluginError[];
  readonly scope: RegistryScope;
}

export interface RegistryPlan {
  readonly chain: readonly AnyPlugin[];
  readonly manifest: {
    readonly signature: string;
    readonly pluginCount: number;
    readonly route: readonly string[];
  };
  readonly metrics?: ReturnType<typeof registrySummary>;
}

export type RegistryKeyMap<T extends string> = Map<RegistryKey<T>, readonly LabPluginId[]>;

export type ConductorRegistry = {
  readonly register: <TInput, TOutput, TLabel extends string, TLane extends LabLane>(
    plugin: PluginDefinition<TInput, TOutput, TLabel, TLane>,
  ) => void;
  readonly byLane: (lane: LabLane) => readonly PluginDefinition<unknown, unknown, string, LabLane>[];
  readonly asMap: () => ReadonlyMap<string, ConductorPluginSnapshot>;
  readonly run: <TInput>(
    pluginIds: readonly string[],
    input: NoInfer<TInput>,
    context: ConductorPluginContext,
  ) => Promise<ConductorRegistryResult>;
};

const defaultLaneOrder = ['ingest', 'simulate', 'restore', 'verify', 'report'] as const satisfies readonly LabLane[];

const createRegistryScope = (tenant: string): RegistryScope => `${tenant}:scope:${Date.now()}`;

const toWorkflowRoute = (lane: LabLane, mode: ConductorPluginConfig['mode']): WorkflowTag => {
  return buildWorkflowTag(lane, lane === 'ingest' ? 1 : mode === 'safe' ? 2 : 3);
};

export class LabConductorRegistry implements ConductorRegistry {
  readonly #plugins = new Map<string, AnyPlugin>();
  readonly #snapshots = new Map<string, ConductorPluginSnapshot>();
  readonly #scope: RegistryScope;

  public constructor(readonly config: NoInfer<ConductorPluginConfig>) {
    this.#scope = createRegistryScope(config.tenant);
  }

  public register<TInput, TOutput, TLabel extends string, TLane extends LabLane>(
    plugin: PluginDefinition<TInput, TOutput, TLabel, TLane>,
  ): void {
    const pluginId = asLabPluginId(`${plugin.id}:${plugin.label}`);
    this.#plugins.set(pluginId, plugin as AnyPlugin);
    const now = Date.now();

    this.#snapshots.set(pluginId, {
      id: pluginId,
      state: 'idle',
      lane: plugin.lane,
      route: [toWorkflowRoute(plugin.lane, this.config.mode)],
      createdAt: now,
      updatedAt: now,
    });
  }

  public byLane(lane: LabLane): readonly PluginDefinition<unknown, unknown, string, LabLane>[] {
    return [...this.#plugins.values()]
      .filter((entry): entry is PluginDefinition<unknown, unknown, string, LabLane> => entry.lane === lane)
      .toSorted((left, right) => left.id.localeCompare(right.id));
  }

  public asMap(): ReadonlyMap<string, ConductorPluginSnapshot> {
    return new Map(this.#snapshots);
  }

  public async run<TInput, TOutput>(
    pluginIds: readonly string[],
    input: NoInfer<TInput>,
    context: ConductorPluginContext,
  ): Promise<ConductorRegistryResult> {
    const selected: AnyPlugin[] = [];
    const errors: ConductorPluginError[] = [];

    await using scope = createDisposableScope();

    for (const pluginId of pluginIds) {
      const plugin = this.#plugins.get(pluginId);
      if (!plugin) {
        errors.push({
          pluginId,
          at: new Date().toISOString(),
          message: `plugin-missing:${pluginId}`,
          details: { tenant: context.tenant, workspace: context.workspace },
        });
        continue;
      }

      this.#snapshots.set(pluginId, {
        ...this.#snapshots.get(pluginId)!,
        state: 'running',
        updatedAt: Date.now(),
      });

      selected.push(plugin);
      scope.defer(() => {
        const snapshot = this.#snapshots.get(pluginId);
        if (snapshot) {
          this.#snapshots.set(pluginId, {
            ...snapshot,
            state: 'complete',
            updatedAt: Date.now(),
          });
        }
      });
    }

    const chain = buildWorkflowChain(selected as [], input);
    const chainResult = await chain.run(input).then((result) => result);

    await runContextAudit({
      context,
      chain: routeTrace(chain),
      pluginCount: selected.length,
      errorCount: errors.length,
    });

    const output: WorkflowResult<readonly AnyPlugin[]> = {
      ...chainResult,
      chain: chainResult.chain,
      output: chainResult.output,
      score: chainResult.score,
    } as unknown as WorkflowResult<readonly AnyPlugin[]>;

    return {
      chain: chain as PluginChain<readonly AnyPlugin[]>,
      output,
      errors,
      scope: this.#scope,
    };
  }

  public manifest(): readonly string[] {
    return [...this.#snapshots.entries()]
      .filter(([, snapshot]) => snapshot.state !== 'idle')
      .map(([pluginId, snapshot]) => `${pluginId}:${snapshot.state}:${snapshot.lane}`);
  }

  public get scope(): RegistryScope {
    return this.#scope;
  }

  public [Symbol.dispose](): void {
    this.#plugins.clear();
    this.#snapshots.clear();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await using _scope = createDisposableScope();
    this.#plugins.clear();
    this.#snapshots.clear();
  }
}

const runContextAudit = async (info: {
  readonly context: ConductorPluginContext;
  readonly chain: readonly string[];
  readonly pluginCount: number;
  readonly errorCount: number;
}): Promise<void> => {
  await Promise.resolve([info.context, ...info.chain, `${info.pluginCount}`, `${info.errorCount}`].toSorted());
};

export const buildConductorRegistry = (
  tenant: string,
  mode: ConductorPluginConfig['mode'] = 'adaptive',
): LabConductorRegistry => {
  return new LabConductorRegistry({
    tenant,
    lane: 'simulate',
    mode,
    concurrency: 1,
  });
};

export const buildPluginTrace = (result: WorkflowResult<readonly AnyPlugin[]>): readonly string[] => {
  const chain = result.chain as unknown as ReturnType<typeof summarizeExecution>;
  return chain.trace.map((entry) => `${entry}`);
};

export const buildRegistryPlan = <TPlans extends readonly LabPlanTemplate[]>(
  tenant: string,
  plans: NoInfer<TPlans>,
): RegistryPlan => {
  const manifest = {
    signature: `${tenant}:${plans.length}:${asLabTenantId(tenant)}`,
    pluginCount: plans.length,
    route: plans.map((plan) => `${plan.scenarioId}->${plan.expectedMs}`),
  };

  const chain = plans
    .map((plan) => {
      const lane = plan.canary ? 'verify' : 'simulate';
      return {
        id: `${tenant}:${plan.scenarioId}`,
        label: `${plan.scenarioId}:route`,
        lane,
        tags: [toWorkflowTag(lane, 'adaptive')],
        requires: [asLabScenarioId(plan.scenarioId)],
        config: {},
        run: async (_input: unknown, _state) => ({
          ...plan,
          signed: true,
        }),
      } satisfies PluginDefinition<LabScenario, Record<string, unknown>, string, LabLane>;
    })
    .map((plugin) => plugin as AnyPlugin);

  return {
    chain,
    manifest,
    metrics: {
      laneCount: registrySummary(new LabConductorRegistry({ tenant, lane: 'simulate', mode: 'adaptive' })).laneCount,
      active: 0,
      idle: 0,
      total: chain.length,
    },
  };
};

export const mapScenarioSignals = (scenario: LabScenario): ReadonlyMap<LabLane, readonly ScenarioSignal[]> => {
  const map = new Map<LabLane, ScenarioSignal[]>();
  for (const signal of scenario.signals) {
    const lane = defaultLaneOrder.includes(signal.lane) ? signal.lane : 'simulate';
    const current = map.get(lane) ?? [];
    map.set(lane, [...current, signal]);
  }

  return new Map(
    [...map.entries()].map(([lane, signals]) => [
      lane,
      signals.toSorted((left, right) => right.value - left.value),
    ] as const),
  );
};

export const registrySummary = (registry: LabConductorRegistry): {
  readonly laneCount: number;
  readonly active: number;
  readonly idle: number;
  readonly total: number;
} => {
  const snapshots = [...registry.asMap().values()];
  return {
    laneCount: [...new Set(snapshots.map((entry) => entry.lane))].length,
    active: snapshots.filter((entry) => entry.state === 'running').length,
    idle: snapshots.filter((entry) => entry.state === 'idle').length,
    total: snapshots.length,
  };
};

export const normalizeRegistryRun = <TResult extends WorkflowAudit<LabExecutionResult>>(run: TResult): TResult => ({
  ...run,
  trace: run.trace.toSorted((left, right) => left.label.localeCompare(right.label)),
});

export const buildRegistryErrors = (audit: WorkflowAudit<LabExecutionResult>): readonly ConductorPluginError[] => {
  return collect(audit.trace.map((entry, index) => ({
    pluginId: `${entry.label}`,
    at: new Date().toISOString(),
    message: `route:${entry.stage}:${index}`,
    details: entry.payload,
  })));
};

export const summarizeRegistryOutput = (registry: LabConductorRegistry): RegistryPlan => {
  const manifest = buildRegistryPlan('tenant-shared', []).manifest;
  const chain = collect(registry.asMap().keys()).flatMap((entry) => {
    if (entry.includes('scope')) {
      return [];
    }
    return [
      {
        id: entry,
        label: 'summary',
        lane: 'simulate',
        tags: [toWorkflowTag('simulate', 'safe')],
        requires: [],
        config: {},
        run: async () => ({
          source: `${entry}`,
        }),
      } as PluginDefinition<unknown, unknown, string, LabLane>,
    ];
  }) as unknown as readonly AnyPlugin[];

  return {
    chain,
    manifest,
    metrics: registrySummary(registry),
  };
};

export const planRouteFromScenario = (scenario: LabScenario): string => {
  const ordered = [...scenario.labels].toSorted();
  return [scenario.scenarioId, ...ordered].join('::');
};

export const asPluginId = (tenant: string, id: string): LabPluginId =>
  asLabPluginId(`${asLabTenantId(tenant)}::${id}`);

export const collectRegistryMap = (
  values: readonly {
    readonly id: string;
    readonly tags: readonly string[];
  }[],
): RegistryKeyMap<string> => {
  return values.reduce<RegistryKeyMap<string>>((acc, value) => {
    for (const tag of value.tags) {
      const key: RegistryKey<string> = `reg:${value.id}`;
      const existing = acc.get(key) ?? [];
      acc.set(key, [...existing, asLabPluginId(`${value.id}:${tag}`)]);
    }
    return acc;
  }, new Map());
};

export const inspectAudit = (audit: ReturnType<typeof summarizeExecution>): {
  readonly manifest: readonly string[];
  readonly route: string;
} => ({
  manifest: audit.trace.map((entry) => `${entry.stage}:${entry.label}`),
  route: `${audit.route}`,
});

export const buildTenantScope = (tenant: string): string => `${asLabTenantId(tenant)}:scope:${Date.now()}`;
