import {
  type PluginCatalog,
  type PluginExecutionInput,
  type PluginExecutionOutput,
  type PluginStage,
  type PluginTrace,
  type PluginContract,
  createCatalogSummary,
} from '@shared/lab-simulation-kernel';
import type { NoInfer } from '@shared/type-level';
import {
  defaultStudioStages,
  type CatalogByStageBuckets,
  type PluginInputByName,
  type PluginOutputByName,
  type StudioContext,
  type StudioPolicyDefinition,
  type StudioPolicySpec,
  type StudioRunToken,
  type StudioScenarioId,
  type StudioTenantId,
  type StudioWorkspaceId,
} from './advanced-types';
import { FlowSequence, flow } from './iterator-tools';

interface BootstrapState {
  readonly catalog: PluginCatalog;
  readonly fingerprint: string;
  readonly stageBuckets: ReturnType<typeof createCatalogSummary>['buckets'];
  readonly stageTotals: ReturnType<typeof createCatalogSummary>['totals'];
}

const bootstrapCache = new Map<string, Promise<BootstrapState>>();

const buildBootstrapState = async (): Promise<BootstrapState> => {
  const catalog = await buildBootstrapCatalog();
  const summary = createCatalogSummary(catalog);
  return {
    catalog,
    fingerprint: catalog
      .map((entry) => `${entry.name}@${entry.spec.version}`)
      .toSorted((left, right) => `${left}`.localeCompare(`${right}`))
      .join('|'),
    stageBuckets: summary.buckets,
    stageTotals: summary.totals,
  };
};

const getBootstrapState = (): Promise<BootstrapState> => {
  if (!bootstrapCache.has('default')) {
    bootstrapCache.set('default', buildBootstrapState());
  }
  return bootstrapCache.get('default') as Promise<BootstrapState>;
};

const baselinePolicy: StudioPolicySpec = {
  id: 'baseline.detect',
  weight: 1,
  lane: 'simulate',
  tags: ['bootstrap'],
};

const fallbackStackAsyncDispose = async (stack: AsyncDisposableStack): Promise<void> => {
  const candidate = stack as {
    [Symbol.asyncDispose]?: () => Promise<void>;
    disposeAsync?: () => Promise<void>;
    dispose?: () => void;
  };

  if (typeof candidate[Symbol.asyncDispose] === 'function') {
    await candidate[Symbol.asyncDispose]!();
    return;
  }
  if (typeof candidate.disposeAsync === 'function') {
    await candidate.disposeAsync();
    return;
  }
  candidate.dispose?.();
};

export interface CatalogRegistryResult<TCatalog extends PluginCatalog> {
  readonly catalog: TCatalog;
  readonly stageBuckets: CatalogByStageBuckets<TCatalog>;
  readonly fingerprints: string;
}

export interface SessionScope {
  readonly id: string;
  readonly pluginCount: number;
  readonly openedAt: number;
}

export class StudioSessionRegistry<TCatalog extends PluginCatalog> {
  readonly #catalog: Map<string, TCatalog[number]> = new Map();
  readonly #stageTotals = new Map<PluginStage, number>();
  readonly #stack = new AsyncDisposableStack();
  readonly #policies = new Map<string, StudioPolicySpec>();

  readonly #scope: SessionScope;

  public constructor(
    readonly tenant: StudioTenantId,
    readonly workspace: StudioWorkspaceId,
    readonly scenario: StudioScenarioId,
    catalog: NoInfer<TCatalog>,
    readonly policies: readonly StudioPolicySpec[] = [baselinePolicy],
  ) {
    this.#scope = {
      id: `${tenant}-${workspace}-${scenario}`,
      pluginCount: catalog.length,
      openedAt: Date.now(),
    };

    for (const plugin of catalog) {
      this.#catalog.set(plugin.name as string, plugin);
      this.#stageTotals.set(plugin.stage, (this.#stageTotals.get(plugin.stage) ?? 0) + 1);
    }

    for (const policy of policies) {
      this.#policies.set(policy.id, policy);
    }

    this.#stack.defer(() => {
      this.#catalog.clear();
      this.#stageTotals.clear();
      this.#policies.clear();
    });
  }

  public register<TInput, TOutput, TStage extends PluginStage>(
    definition: StudioPolicyDefinition<TInput> & {
      readonly name: PluginCatalog[number]['name'];
      readonly stage: TStage;
      readonly spec: {
        readonly name: string;
        readonly stage: TStage;
        readonly version: string;
        readonly weight: number;
      };
      readonly run: (input: { readonly request: TInput }) => Promise<PluginExecutionOutput<TOutput>>;
    },
  ): void {
    this.#catalog.set(definition.name as string, definition as unknown as TCatalog[number]);
    this.#stageTotals.set(definition.stage, (this.#stageTotals.get(definition.stage) ?? 0) + 1);
  }

  public resolve(plugin: string): TCatalog[number] | undefined {
    return this.#catalog.get(plugin);
  }

  public has(plugin: string): boolean {
    return this.#catalog.has(plugin);
  }

  public byStage<TStage extends PluginStage>(
    stage: NoInfer<TStage>,
  ): readonly Extract<TCatalog[number], { stage: TStage }>[] {
    return FlowSequence.from(this.#catalog.values())
      .filter((entry: TCatalog[number]) => entry.stage === stage)
      .toArray() as readonly Extract<TCatalog[number], { stage: TStage }>[];
  }

  public sortedByName(): readonly TCatalog[number][] {
    return [...this.#catalog.values()].toSorted((left, right) => `${left.name}`.localeCompare(`${right.name}`));
  }

  public values(): readonly TCatalog[number][] {
    return [...this.#catalog.values()];
  }

  public entries(): FlowSequence<[string, TCatalog[number]]> {
    return flow(this.#catalog.entries());
  }

  public catalogSnapshot(): CatalogRegistryResult<TCatalog> {
    return {
      catalog: [...this.#catalog.values()] as unknown as TCatalog,
      stageBuckets: createCatalogSummary([...this.#catalog.values()]).buckets as unknown as CatalogByStageBuckets<TCatalog>,
      fingerprints: this.fingerprint,
    };
  }

  public policySnapshot(): readonly StudioPolicySpec[] {
    return [...this.#policies.values()];
  }

  public setPolicy(policy: StudioPolicySpec): void {
    this.#policies.set(policy.id, policy);
  }

  public removePolicy(policyId: string): void {
    this.#policies.delete(policyId);
  }

  public get fingerprint(): string {
    return [...this.#catalog.keys()].toSorted().join(',');
  }

  public get scope(): SessionScope {
    return this.#scope;
  }

  public async run<TInput, TOutput>(
    stage: PluginStage,
    input: NoInfer<PluginExecutionInput<TInput>>,
  ): Promise<readonly PluginExecutionOutput<TOutput>[]> {
    const outputs: PluginExecutionOutput<TOutput>[] = [];
    const plugins = this.byStage(stage) as readonly PluginContract<any, TInput, TOutput, PluginStage>[];
    for (const plugin of plugins) {
      const startedAt = Date.now();
      const result = await plugin.run(input) as PluginExecutionOutput<TOutput>;
      outputs.push({
        ...result,
        durationMs: Math.max(1, Date.now() - startedAt),
      });
    }
    return outputs;
  }

  public collectTraces(): readonly PluginTrace[] {
    const traces: PluginTrace[] = [];
    for (const [index, [pluginName, plugin]] of this.entries().entries()) {
      traces.push({
        plugin: pluginName,
        stage: plugin.stage,
        startedAt: new Date(this.#scope.openedAt + index * 7),
        ms: 0,
        ok: true,
      });
    }
    return traces;
  }

  public pluginOutputSignature<TOutput extends PluginOutputByName<TCatalog>>(): TOutput {
    return {} as TOutput;
  }

  public pluginInputSignature<TInput extends PluginInputByName<TCatalog>>(): TInput {
    return {} as TInput;
  }

  public [Symbol.dispose](): void {
    (this.#stack as { dispose?: () => void }).dispose?.();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await fallbackStackAsyncDispose(this.#stack);
  }
}

export const buildBootstrapCatalog = async (): Promise<PluginCatalog> => {
  await using loader = new AsyncDisposableStack();
  const now = Date.now();

  const createdPlugins = defaultStudioStages.map((stage, index) => {
    const pluginName = `${stage}.bootstrap@1.${index}`;
    return {
      spec: {
        name: pluginName,
        stage,
        version: `1.${index}`,
        weight: index + 1,
      },
      name: pluginName,
      stage,
      async run(input: PluginExecutionInput<Record<string, unknown>>): Promise<PluginExecutionOutput<unknown>> {
        return {
          plugin: pluginName,
          stage,
          durationMs: 1 + index,
          payload: {
            pluginName,
            tenant: input.tenant,
            createdAt: now,
          },
          warnings: [],
        };
      },
    };
  }) as PluginCatalog;

  loader.defer(() => {
    void loader;
  });

  return [...createdPlugins];
};

export const createSessionRegistry = async (
  tenant: StudioTenantId,
  workspace: StudioWorkspaceId,
  scenario: StudioScenarioId,
  policies?: readonly StudioPolicySpec[],
): Promise<CatalogRegistryResult<PluginCatalog>> => {
  const state = await getBootstrapState();
  const registry = new StudioSessionRegistry(tenant, workspace, scenario, state.catalog, policies);
  const snapshot = registry.catalogSnapshot();
  await registry[Symbol.asyncDispose]();
  return snapshot;
};

export const createSessionRegistryWithRun = async (
  tenant: StudioTenantId,
  workspace: StudioWorkspaceId,
  scenario: StudioScenarioId,
  policies: readonly StudioPolicySpec[] = [baselinePolicy],
): Promise<StudioSessionRegistry<PluginCatalog>> => {
  const state = await getBootstrapState();
  return new StudioSessionRegistry(tenant, workspace, scenario, state.catalog, policies);
};

export const buildSessionScope = (tenant: string, run: StudioRunToken): SessionScope => ({
  id: `${tenant}-${run}`,
  pluginCount: getBootstrapFingerprint().split('|').length,
  openedAt: Date.now(),
});

const getBootstrapFingerprint = (): string => {
  const fallback = 'bootstrap-digest:not-loaded';
  const knownState = bootstrapCache.get('default');
  return knownState ? 'bootstrap-digest:loading' : fallback;
};

export const bootstrapSummary = async (): Promise<{
  readonly fingerprint: string;
  readonly totals: Readonly<{
    readonly detect: number;
    readonly disrupt: number;
    readonly verify: number;
    readonly restore: number;
  }>;
}> => {
  const state = await getBootstrapState();
  return {
    fingerprint: state.fingerprint,
    totals: state.stageTotals,
  } as const;
};
