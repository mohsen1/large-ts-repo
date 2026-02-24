import type { NoInfer } from '@shared/type-level';
import type { Brand } from '@shared/core';
import {
  asPlanId,
  asRunId,
  asScenarioId,
  asSessionId,
  asWorkspaceId,
  asPluginFingerprint,
  asPluginId,
  type StrategyContext,
  type StrategyLane,
  type StrategyMode,
  type StrategyTuple,
  type PluginFingerprint,
} from './types';
import { parseStrategyTuple, resolveLane, resolveMode } from './schema';
import type { PluginContract, PluginDescriptor, PluginExecutionRecord } from './contracts';
import { buildDescriptor } from './contracts';
import { buildTopology, type TopologyRecord } from './topology';
import type { TopologyNodeSpec } from './topology';

export const registryScopes = ['global', 'workspace', 'session', 'run'] as const;
export type RegistryScope = (typeof registryScopes)[number];
export type RegistryKey<TKind extends string> = `${TKind}::registry`;
export type RegistrySignature<TMode extends StrategyMode = StrategyMode> = `${TMode}::${RegistryScope}::${string}`;

type AnyContract = PluginContract<string, unknown, unknown, unknown>;
type AnyDescriptor = PluginDescriptor<AnyContract, Record<string, unknown>>;

const toRoute = (route: string): `${StrategyMode}/${string}` => route as `${StrategyMode}/${string}`;

export interface RegistryNode {
  readonly scope: RegistryScope;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly kind: string;
  readonly signature: RegistrySignature;
  readonly fingerprint: PluginFingerprint;
  readonly descriptor: AnyDescriptor;
}

export interface RegistrySnapshot {
  readonly scope: RegistryScope;
  readonly signature: Brand<string, 'RegistrySignature'>;
  readonly timestamp: string;
  readonly count: number;
  readonly nodes: RegistryNode[];
}

export interface RegistryResult<TValue> {
  readonly ok: boolean;
  readonly value?: TValue;
  readonly issue?: string;
}

const asRegistrySignature = (value: string): RegistrySignature => value as RegistrySignature;
const asFingerprint = (value: string): PluginFingerprint => asPluginFingerprint(value);

const describeNode = (scope: RegistryScope, index: number, contract: AnyContract): RegistryNode['signature'] =>
  asRegistrySignature(`${contract.mode}::${scope}::${index}`);

const makeDescriptor = (scope: RegistryScope, index: number, contract: AnyContract): AnyDescriptor => {
  return buildDescriptor(contract, `${scope}:${contract.kind}:${index}`, {
    route: contract.namespace,
    label: `${scope}:${contract.kind}`,
    timeoutMs: 1_000 + index,
    retries: 0,
    aliases: [contract.kind],
    severity: 'info',
    active: true,
  });
};

export class IntelligenceRegistry<TContracts extends readonly AnyContract[] = readonly AnyContract[]> {
  readonly #scope: RegistryScope;
  readonly #contracts: TContracts;
  readonly #nodes = new Map<string, RegistryNode>();
  readonly #descriptors = new Map<string, AnyDescriptor>();

  constructor(scope: RegistryScope, contracts: NoInfer<TContracts>) {
    this.#scope = scope;
    this.#contracts = contracts;

    for (const [index, contract] of contracts.entries()) {
      const descriptor = makeDescriptor(scope, index, contract);
      const node: RegistryNode = {
        scope,
        mode: contract.mode,
        lane: contract.lane,
        kind: contract.kind,
        signature: describeNode(scope, index, contract),
        fingerprint: contract.fingerprint(),
        descriptor,
      };
      this.#nodes.set(node.descriptor.key, node);
      this.#descriptors.set(contract.kind, descriptor);
    }
  }

  get scope(): RegistryScope {
    return this.#scope;
  }

  get contracts(): TContracts {
    return this.#contracts;
  }

  listByMode(mode: StrategyMode): RegistryNode[] {
    return [...this.#nodes.values()].filter((node) => node.mode === mode);
  }

  listByKind(kind: string): RegistryNode[] {
    return [...this.#nodes.values()].filter((node) => node.kind === kind);
  }

  entries(kind?: RegistryKey<string> | string): RegistryNode[] {
    const nodes = this.#nodes.values();
    if (kind === undefined) {
      return [...nodes];
    }
    return [...nodes].filter((node) => node.kind === kind);
  }

  find(kind: string): RegistryNode | undefined {
    return this.#nodes.get(`${this.#scope}:${kind}:0`) ?? this.listByKind(kind)[0];
  }

  snapshot(): RegistrySnapshot {
    const nodes = [...this.#nodes.values()];
    return {
      scope: this.#scope,
      signature: `registry:${this.#scope}:${nodes.length}` as Brand<string, 'RegistrySignature'>,
      timestamp: new Date().toISOString(),
      count: nodes.length,
      nodes,
    };
  }

  toTuple(): StrategyTuple[] {
    return this.#contracts.map((contract, index) =>
      parseStrategyTuple([contract.mode, contract.lane, contract.id as string, index + 1]),
    );
  }

  asTopology(): {
    readonly map: TopologyRecord;
    readonly route: readonly string[];
  } {
    const specs: readonly TopologyNodeSpec<string, { scope: RegistryScope }>[] = this.#contracts.map((contract, index) => ({
      name: `${contract.kind}-${index}`,
      kind: 'plugin' as const,
      level: 'analysis' as const,
      mode: resolveMode(contract.mode),
      lane: resolveLane(contract.lane),
      seed: (index + 1) / this.#contracts.length,
      payload: {
        scope: this.#scope,
      },
    }));
    const topology = buildTopology(`scope:${this.#scope}`, specs);
    return {
      map: topology.toSchema(),
      route: topology.toRouteTrace(),
    };
  }

  async *walk(context: StrategyContext): AsyncGenerator<PluginExecutionRecord> {
    let index = 0;
    for (const contract of this.#contracts) {
      index += 1;
      yield {
        traceId: asPluginId(`trace:${context.runId}:${contract.id}`),
        phase: contract.mode,
        startedAt: context.phase.startedAt,
        completedAt: new Date().toISOString(),
        input: { contractId: contract.id, index },
        output: { contractId: contract.id, scope: this.#scope },
        diagnostics: [
          {
            source: 'orchestration',
            severity: 'info',
            at: new Date().toISOString(),
            detail: {
              scope: this.#scope,
              kind: contract.kind,
              id: contract.id,
            },
          },
        ],
        context,
      };
    }
  }

  getDescriptor(kind: string): RegistryResult<AnyDescriptor> {
    const entry = this.find(kind);
    if (!entry) {
      return { ok: false, issue: `missing:${kind}` };
    }
    const descriptor = this.#descriptors.get(kind);
    if (!descriptor) {
      return { ok: false, issue: `missing-descriptor:${kind}` };
    }
    return { ok: true, value: descriptor };
  }

  toRecord(): Record<string, AnyContract> {
    const seed: Record<string, AnyContract> = {};
    for (const contract of this.#contracts) {
      seed[contract.kind] = contract;
    }
    return seed;
  }

  configure<TMode extends StrategyMode>(
    mode: TMode,
    contracts: readonly AnyContract[],
  ): AnyDescriptor[] {
    return contracts.map((contract, index) => {
      const descriptor = buildDescriptor(contract, `${mode}::${contract.kind}::${index}`, {
        route: toRoute(`${mode}/${contract.kind}`),
        label: `${mode}::${contract.kind}`,
        active: true,
        aliases: [contract.kind],
        severity: 'info',
        timeoutMs: 1_000,
        retries: 0,
      });
      this.#descriptors.set(contract.kind, descriptor);
      return descriptor;
    });
  }

  summarize() {
    const modes = new Set<StrategyMode>();
    for (const node of this.snapshot().nodes) {
      modes.add(node.mode);
    }
    return {
      scope: this.#scope,
      tuples: this.toTuple(),
      contractCount: modes.size,
    };
  }
}

export const analyzeRegistry = (registry: IntelligenceRegistry, maxEntries: number): RegistryNode[] => {
  return [...registry.snapshot().nodes]
    .toSorted((left, right) => left.signature.localeCompare(right.signature))
    .slice(0, maxEntries);
};

export const buildRegistryNode = (
  kind: string,
  tuple: StrategyTuple,
  mode: StrategyMode,
  lane: StrategyLane,
): RegistryNode => {
  const safeMode = resolveMode(tuple[0] ?? mode, mode);
  const safeLane = resolveLane(tuple[1] ?? lane, lane);
  const contractId = tuple[2] ?? kind;
  const contract: AnyContract = {
    kind,
    id: asPluginId(`${kind}:${contractId}`) as unknown as AnyContract['id'],
    version: `1.${tuple[3] ?? 0}` as unknown as AnyContract['version'],
    lane: safeLane,
    mode: safeMode,
    source: 'orchestration',
    metadata: {
      tuple,
      kind,
      scope: 'global',
    },
    inputSchema: (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object',
    run: async (input: unknown) => ({
      kind,
      lane: safeLane,
      mode: safeMode,
      tuple,
      input,
    }),
    fingerprint: () => asFingerprint(`fp:${kind}:${contractId}`),
    namespace: toRoute(`${safeMode}/${kind}`),
  };

  const descriptor = buildDescriptor(contract, `${kind}:${mode}`, {
    route: contract.namespace,
    label: kind,
    active: true,
    aliases: [kind],
    severity: 'info',
    timeoutMs: 1_000,
    retries: 0,
  });

  return {
    scope: 'global',
    kind,
    mode: safeMode,
    lane: safeLane,
    signature: asRegistrySignature(`orchestrate:global:${kind}`),
    fingerprint: asFingerprint(`global:${kind}`),
    descriptor,
  };
};

export const runRegistryWalk = async (registry: IntelligenceRegistry, context: StrategyContext): Promise<PluginExecutionRecord[]> => {
  const records: PluginExecutionRecord[] = [];
  for await (const record of registry.walk(context)) {
    records.push(record);
  }
  return records;
};

export const collectDiagnostics = (snapshot: RegistrySnapshot): readonly string[] =>
  snapshot.nodes
    .map((entry) => `${entry.scope}:${entry.kind}:${entry.mode}:${entry.lane}`)
    .toSorted();

export const registryFingerprint = (scope: RegistryScope, nodes: RegistryNode[]): PluginFingerprint => {
  const value = `${scope}:${nodes.length}:${nodes.map((node) => node.signature).join(',')}`;
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 0x7fffffff;
  }
  return asFingerprint(`registry-${scope}-${hash}`);
};

export const registryScopeFromTuple = ([mode]: StrategyTuple): RegistryScope =>
  mode === 'simulate' ? 'global' : mode === 'analyze' ? 'workspace' : 'run';

export const registryAsContext = (tenant: string, scope: RegistryScope, mode: StrategyMode, lane: StrategyLane): StrategyContext => ({
  sessionId: asSessionId(`session:${tenant}:${scope}`),
  workspace: asWorkspaceId(`workspace:${tenant}`),
  runId: asRunId(`run:${tenant}:${scope}`),
  planId: asPlanId(`plan:${tenant}`),
  scenario: asScenarioId(`scenario:${tenant}`),
  phase: {
    phase: mode,
    lane,
    scenario: asScenarioId(`scenario:${tenant}`),
    runId: asRunId(`phase:${tenant}:${scope}`),
    workspace: asWorkspaceId(`workspace:${tenant}`),
    mode,
    startedAt: new Date().toISOString(),
    payload: {
      scope,
      mode,
      lane,
      tenant,
    },
  },
  baggage: {
    tenant,
    lane,
    scope,
  },
  plugin: asPluginId(`plugin:${tenant}:${scope}`),
});
