import {
  PluginLattice,
  type PluginNode,
  type PluginName as LatticePluginName,
} from '@shared/typed-orchestration-core';
import type { PluginSlot as LatticePluginSlot } from '@shared/typed-orchestration-core/src/plugin-lattice';
import { AsyncRegistryStack } from './scheduler';
import { withBrand } from '@shared/core';
import type { EngineConfig, RuntimeStatus } from './types';

export type StudioRegistryConfig = {
  readonly tenant: string;
  readonly workspace: string;
  readonly config: EngineConfig;
};

export type StudioPlanSeed = {
  readonly config: EngineConfig;
  readonly runbookId: string;
  readonly route: `route:${string}`;
};

export type StudioRegistryStats = {
  readonly total: number;
  readonly ordered: ReadonlyArray<LatticePluginName>;
  readonly first: LatticePluginName;
  readonly last: LatticePluginName;
};

export type StudioRegistrySnapshot = {
  readonly trace: string;
  readonly route: string;
  readonly nodes: ReadonlyArray<LatticePluginName>;
  readonly statuses: ReadonlyMap<LatticePluginName, RuntimeStatus>;
};

export type PluginPlan<TPayload = unknown> = {
  readonly id: LatticePluginName;
  readonly stage: `stage:${string}`;
  readonly slot: LatticePluginSlot;
  readonly payload: TPayload;
  readonly runbookId: string;
};

type PlanMap<TPayload> = {
  [TKey in PluginPlan<TPayload>['id']]: Extract<PluginPlan<TPayload>, { id: TKey }>;
};

const planNode = <TPayload>(plan: PluginPlan<TPayload>): PluginNode<{ tenant: string; workspace: string }, {
  readonly runbookId: string;
  readonly stage: string;
  readonly payload: TPayload;
}> => ({
  name: plan.id,
  slot: plan.slot,
  stage: plan.stage,
  dependsOn: [],
  weight: 100,
  run: async (input, context) => ({
    status: 'ok',
    output: {
      runbookId: plan.runbookId,
      stage: context.stage,
      payload: plan.payload,
    },
    logs: [
      `plan:${plan.runbookId}`,
      `tenant:${input.seed?.tenant ?? 'unknown'}`,
      `workspace:${input.seed?.workspace ?? 'unknown'}`,
      `node:${String(plan.id)}`,
    ],
  }),
});

export class StudioRegistry<TPayload> {
  readonly #stack = new AsyncRegistryStack();
  readonly #nodes: PluginNode<{ tenant: string; workspace: string }, unknown, LatticePluginName>[];
  readonly #lattice: PluginLattice<{ tenant: string; workspace: string }, PluginNode<{ tenant: string; workspace: string }, unknown, LatticePluginName>[]>;

  public constructor(private readonly options: StudioRegistryConfig, private readonly plans: readonly PluginPlan<TPayload>[]) {
    this.#nodes = plans.map((plan) =>
      planNode(plan) as PluginNode<{ tenant: string; workspace: string }, unknown, LatticePluginName>,
    );
    this.#lattice = new PluginLattice(this.#nodes, 'stage:bootstrap');

    this.#stack.register({
      id: `${options.workspace}:registry`,
      metadata: { runbook: options.workspace },
      state: { runbookId: `seed:${options.workspace}` },
    });
  }

  public list(): ReadonlyArray<LatticePluginName> {
    return this.#lattice.names();
  }

  public stats(): StudioRegistryStats {
    const ordered = this.#lattice.order();
    return {
      total: ordered.length,
      ordered,
      first: ordered[0] ?? (`plugin:uninitialized` as LatticePluginName),
      last: ordered[ordered.length - 1] ?? (`plugin:uninitialized` as LatticePluginName),
    };
  }

  public async open(): Promise<StudioRegistrySnapshot> {
    const ordered = this.#lattice.order();
    const statuses = new Map<LatticePluginName, RuntimeStatus>();
    for (const entry of ordered) {
      statuses.set(entry, entry === ordered[0] ? 'running' : 'idle');
    }

    const trace = `${withBrand(this.options.workspace, 'TraceId')}`;
    const route = `route:studio:${this.options.tenant}:${this.options.workspace}`;

    return {
      trace,
      route,
      nodes: ordered,
      statuses,
    };
  }

  public async run(
    runbookId: string,
    seed: { readonly tenant: string; readonly workspace: string },
  ): Promise<
    {
      readonly runbookId: string;
      readonly plan: PluginPlan<TPayload>;
      readonly trace: string;
    }[]
  > {
    const ordered = this.#lattice.order();
    const snapshot: {
      readonly runbookId: string;
      readonly plan: PluginPlan<TPayload>;
      readonly trace: string;
    }[] = [];

    await using _scope = this.#stack;

    const foundPlan = this.plans.find((plan) => plan.runbookId === runbookId);
    if (!foundPlan) {
      throw new Error(`missing-plan:${runbookId}`);
    }

    for (const entry of ordered) {
      const selected = this.plans.find((plan) => plan.id === entry);
      if (!selected) {
        continue;
      }

      const output = await this.#lattice.execute(entry, { ...seed, tenant: seed.tenant, workspace: seed.workspace });
      snapshot.push({
        runbookId,
        plan: selected,
        trace: `${foundPlan.id}:${String(entry)}:${String(output)}`,
      });
    }

    return snapshot;
  }
}

export const createRegistry = <TPayload>(
  options: StudioRegistryConfig,
  plans: readonly PluginPlan<TPayload>[],
): StudioRegistry<TPayload> => new StudioRegistry(options, plans);

export const collectPlans = <TPayload>(
  runbook: { readonly scenarioId?: string; readonly nodes?: readonly TPayload[] },
  payload: (entry: TPayload, index: number) => TPayload,
): PluginPlan<TPayload>[] => {
  const planId = runbook.scenarioId ?? 'scenario-studio';
  const nodes = (runbook.nodes ?? []) as readonly TPayload[];
  return nodes.map((entry, index) => ({
    id: `plugin:${planId}:${index}` as LatticePluginName,
    stage: `stage:plan:${index}` as const,
    slot: `slot:${planId}` as LatticePluginSlot,
    payload: payload(entry, index),
    runbookId: planId,
  }));
};

export const collectPlanMap = <TPayload>(plans: readonly PluginPlan<TPayload>[]): PlanMap<TPayload> => {
  const mapped = {} as PlanMap<TPayload>;
  for (const plan of plans) {
    mapped[plan.id] = plan;
  }
  return mapped;
};

export const withRegistry = async <TPayload, TResult>(
  factory: () => Promise<StudioRegistryConfig>,
  callback: (registry: StudioRegistry<TPayload>) => Promise<TResult>,
): Promise<TResult> => {
  const config = await factory();
  const registry = new StudioRegistry<TPayload>(config, []);
  try {
    return await callback(registry);
  } finally {
    await registry.open().catch(() => undefined);
  }
};

export const summarizeRegistry = <TPayload>(registry: StudioRegistry<TPayload>): StudioRegistryStats => registry.stats();

export const createRegistryTrace = (workspace: string): string => `${workspace}::${Date.now()}`;

export const collectPlanSnapshots = async <TPayload, TResult>(
  input: TPayload,
  factory: (input: TPayload) => Promise<PluginPlan<TPayload>[]>,
  callback: (plans: PluginPlan<TPayload>[]) => Promise<TResult>,
): Promise<TResult> => {
  const plans = await factory(input);
  const output = plans;
  return callback(output);
};
