import { type StageSignal, type StressPhase, type RecoverySignalId, type TenantId, createSignalId } from './models';
import { type NoInfer } from '@shared/type-level';

export type EdgeDirection = 'inbound' | 'outbound';
export type TransitMode = 'sync' | 'async';

export type RouteKey<TSource extends string, TTarget extends string> = `${TSource}=>${TTarget}`;

type PhaseNode = {
  readonly phase: StressPhase;
  readonly index: number;
};

export const phaseOrder: readonly StressPhase[] = ['observe', 'isolate', 'migrate', 'restore', 'verify', 'standdown'];

export type TransitionGraph<TPhases extends readonly StressPhase[]> = {
  readonly [K in TPhases[number] as RouteKey<K, K>]: {
    readonly index: number;
    readonly next: readonly Exclude<TPhases[number], K>[];
  };
};

export interface StageTransition {
  readonly from: StressPhase;
  readonly to: StressPhase;
  readonly mode: TransitMode;
  readonly direction: EdgeDirection;
}

export interface LatticeDescriptor {
  readonly seed: string;
  readonly transitions: readonly StageTransition[];
}

const defaultLatticeSeed = {
  seed: 'stress-route-lattice-v2',
  transitions: [
    { from: 'observe', to: 'isolate', mode: 'sync', direction: 'outbound' },
    { from: 'isolate', to: 'migrate', mode: 'async', direction: 'outbound' },
    { from: 'migrate', to: 'restore', mode: 'async', direction: 'outbound' },
    { from: 'restore', to: 'verify', mode: 'sync', direction: 'outbound' },
    { from: 'verify', to: 'standdown', mode: 'sync', direction: 'outbound' },
  ] as const satisfies readonly StageTransition[],
} as const;

export const createDefaultLattice = (): LatticeDescriptor => {
  const transitions = defaultLatticeSeed.transitions.slice();
  return {
    seed: defaultLatticeSeed.seed,
    transitions: transitions,
  };
};

export const toRouteKey = (transition: StageTransition): RouteKey<StageTransition['from'], StageTransition['to']> => {
  return `${transition.from}=>${transition.to}` as RouteKey<StageTransition['from'], StageTransition['to']>;
};

export const toNodeIndex = (phase: StressPhase): PhaseNode => {
  const index = phaseOrder.indexOf(phase);
  return {
    phase,
    index: index >= 0 ? index : phaseOrder.length,
  };
};

export const normalizeLattice = <TTransitions extends readonly StageTransition[]>(transitions: TTransitions): readonly StageTransition[] => {
  const visited = new Set<RouteKey<StressPhase, StressPhase>>();
  const out = [] as StageTransition[];

  for (const transition of transitions) {
    const key = toRouteKey(transition);
    if (!visited.has(key)) {
      visited.add(key);
      out.push(transition);
    }
  }

  return out.toSorted((left, right) => {
    const leftNode = toNodeIndex(left.to);
    const rightNode = toNodeIndex(right.to);
    if (leftNode.index === rightNode.index) {
      return left.from.localeCompare(right.from);
    }
    return leftNode.index - rightNode.index;
  });
};

export interface LatticePath {
  readonly tenantId: TenantId;
  readonly phases: readonly StressPhase[];
  readonly edges: readonly RouteKey<string, string>[];
}

export const latticePathFromSignals = <TSignals extends readonly StageSignal[]>(
  tenantId: TenantId,
  signals: NoInfer<TSignals>,
): LatticePath => {
  const sorted = [...signals].toSorted((left, right) => right.score - left.score);
  const edges = [] as RouteKey<StressPhase, StressPhase>[];
  const phases = [] as StressPhase[];

  for (const [index, signal] of sorted.entries()) {
    const phase = index % phaseOrder.length;
    const nextPhase = phaseOrder[phase] as StressPhase;
    phases.push(nextPhase);
    if (index > 0) {
      const previous = phaseOrder[(index - 1) % phaseOrder.length] as StressPhase;
      edges.push(`${previous}=>${nextPhase}` as RouteKey<StressPhase, StressPhase>);
    }
  }

  return {
    tenantId,
    phases: phases.toSorted().toSorted(),
    edges,
  };
};

export const compileLattice = (input: LatticeDescriptor): LatticePath => {
  const normalized = normalizeLattice(input.transitions);
  const edges = normalized.map((transition) => toRouteKey(transition));
  const phases = normalized.flatMap((transition) => [transition.from, transition.to]).filter(Boolean);
  return {
    tenantId: createSignalId(`${input.seed}:${edges.length}`).substr(0, 30) as unknown as TenantId,
    phases: phases.toSorted(),
    edges,
  };
};

export class LatticeRunner {
  #disposed = false;
  readonly #descriptor: LatticeDescriptor;

  public constructor(descriptor: LatticeDescriptor) {
    this.#descriptor = descriptor;
  }

  public async run<TSignals extends readonly StageSignal[]>(signals: NoInfer<TSignals>): Promise<LatticePath> {
    await Promise.resolve();
    return latticePathFromSignals(createSignalId(`${this.#descriptor.seed}:${Date.now()}`) as unknown as TenantId, signals);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    await Promise.resolve();
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
  }
}
