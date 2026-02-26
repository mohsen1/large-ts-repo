import type { NoInfer, Brand } from '@shared/type-level';

export type LatticeNode = Brand<string, 'LatticeNode'>;
export type LatticeTrace = Brand<string, 'LatticeTrace'>;
export type LatticePlanId = Brand<string, 'LatticePlanId'>;
export type LatticeTenant = Brand<string, 'LatticeTenant'>;

type PlanMode = 'discovery' | 'validation' | 'execution' | 'drain';
type PlanRoute<TTenant extends LatticeTenant> = `/${TTenant & string}/${PlanMode}/${string}`;

export interface LatticeInput<TTenant extends string = string> {
  readonly tenant: Brand<TTenant, 'LatticeTenantInput'>;
  readonly mode: PlanMode;
  readonly route: Brand<string, 'LatticeRoute'>;
  readonly limit: number;
}

export interface LatticeOutput<TMode extends PlanMode = PlanMode> {
  readonly planId: LatticePlanId;
  readonly tenant: LatticeTenant;
  readonly mode: TMode;
  readonly trace: ReadonlyArray<string>;
  readonly route: LatticeTrace;
  readonly score: number;
}

interface LatticeBase<TMode extends PlanMode, TScope extends string = 'base'> {
  readonly id: Brand<number, 'LatticeId'>;
  readonly mode: TMode;
  readonly scope: TScope;
}

export interface LatticeLeaf extends LatticeBase<'discovery', 'leaf'> {
  readonly leafIndex: number;
}

export interface LatticeBranch extends LatticeBase<'validation', 'branch'> {
  readonly branchIndex: number;
  readonly childCount: number;
}

export interface LatticeTrunk extends LatticeBase<'execution', 'trunk'> {
  readonly trunkIndex: number;
  readonly throughput: number;
}

export interface LatticeCanopy extends LatticeBase<'drain', 'canopy'> {
  readonly canopyIndex: number;
  readonly closed: boolean;
}

export interface LatticeNodeRecord<TMode extends PlanMode = PlanMode> {
  readonly key: LatticeNode;
  readonly mode: TMode;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export type LatticeUnion =
  | LatticeLeaf
  | LatticeBranch
  | LatticeTrunk
  | LatticeCanopy;

export type LatticeToMode<TUnion extends LatticeUnion> = TUnion extends LatticeLeaf
  ? 'discovery'
  : TUnion extends LatticeBranch
    ? 'validation'
    : TUnion extends LatticeTrunk
      ? 'execution'
      : 'drain';

export type DeepLatticeMap<T> = T extends object
  ? {
      [K in keyof T]: K extends `_${string}`
        ? never
        : T[K] extends object
          ? T[K] | DeepLatticeMap<T[K]>
          : T[K];
    }
  : T;

export class LatticeNodeModel<
  TMode extends PlanMode,
  TInput extends LatticeInput = LatticeInput,
  TOutput extends LatticeOutput<TMode> = LatticeOutput<TMode>,
> {
  constructor(
    public readonly input: TInput,
    private readonly seed: ReadonlyArray<number> = [0, 1, 2],
  ) {}

  static fromRaw<TTenant extends string>(tenant: TTenant, mode: PlanMode, route: string): LatticeInput<TTenant> {
    return {
      tenant: `${tenant}:${mode}` as Brand<TTenant, 'LatticeTenantInput'>,
      mode,
      route: route as Brand<string, 'LatticeRoute'>,
      limit: 128,
    };
  }

  map<T>(mapper: (value: ReadonlyArray<number>, seed: Brand<number, 'LatticeSeed'>) => ReadonlyArray<T>): ReadonlyArray<T> {
    return mapper(this.seed, 0 as Brand<number, 'LatticeSeed'>);
  }

  async execute<TOverrideInput extends LatticeInput>(input: NoInfer<TOverrideInput>): Promise<LatticeOutput<TMode>> {
    const route = (input.route ?? this.input.route) as PlanRoute<LatticeTenant>;
    const score = route.length % 100;
    const trace = route.split('/').filter(Boolean);
    return {
      planId: `plan-${trace.length}` as LatticePlanId,
      tenant: `${input.tenant}` as LatticeTenant,
      mode: (this.input.mode ?? input.mode) as TMode,
      trace,
      route: `trace-${route}` as LatticeTrace,
      score,
    };
  }
}

export class LatticePlanner<
  TInput extends LatticeInput,
  TOutput extends LatticeOutput,
  TMode extends PlanMode = 'discovery',
> {
  #nodes: LatticeUnion[] = [];

  constructor(
    private readonly mode: TMode,
    private readonly options: { readonly namespace: string; readonly allowAutoClose: boolean },
  ) {}

  createNode(index: number, mode: PlanMode): LatticeUnion {
    const base = {
      id: index as Brand<number, 'LatticeId'>,
      mode,
      scope: 'base',
      trace: `${this.options.namespace}:${index}`,
    } as unknown as LatticeUnion;

    switch (mode) {
      case 'discovery':
        return {
          ...base,
          leafIndex: index,
        } as LatticeLeaf;
      case 'validation':
        return {
          ...base,
          branchIndex: index,
          childCount: 3,
        } as LatticeBranch;
      case 'execution':
        return {
          ...base,
          trunkIndex: index,
          throughput: 10 + index,
        } as LatticeTrunk;
      case 'drain':
      default:
        return {
          ...base,
          canopyIndex: index,
          closed: false,
        } as LatticeCanopy;
    }
  }

  bootstrap(nodes = 20): this {
    for (let idx = 0; idx < nodes; idx += 1) {
      this.#nodes.push(this.createNode(idx, idx % 4 === 0 ? 'discovery' : idx % 4 === 1 ? 'validation' : idx % 4 === 2 ? 'execution' : 'drain'));
    }
    return this;
  }

  resolve<TNode extends LatticeUnion>(node: TNode): LatticeOutput<TNode['mode']> {
    const nodeMode = node.mode as TNode['mode'];
    const score = nodeMode === 'discovery' ? 10 : nodeMode === 'validation' ? 20 : nodeMode === 'execution' ? 30 : 40;
    return {
      planId: `resolve-${nodeMode}` as LatticePlanId,
      tenant: `${this.options.namespace}` as LatticeTenant,
      mode: nodeMode,
      trace: [nodeMode, this.options.namespace, String(node.id)],
      route: `${nodeMode}/${node.id}` as LatticeTrace,
      score,
    };
  }

  resolveAll(): ReadonlyArray<LatticeOutput<PlanMode>> {
    return this.#nodes.map((node) => this.resolve(node));
  }
}

export const evaluateLattice = <T extends readonly LatticeInput[]>(inputs: T): ReadonlyArray<LatticeOutput> => {
  const planner = new LatticePlanner<LatticeInput, LatticeOutput, 'validation'>('validation', {
    namespace: 'lattice-eval',
    allowAutoClose: true,
  });
  planner.bootstrap(Math.max(inputs.length, 4));
  const prepared = planner.resolveAll();
  return inputs.map((input, index) => ({
    ...prepared[index % prepared.length],
    tenant: `${input.tenant}` as LatticeTenant,
    trace: [input.tenant as string, input.mode, ...prepared[index % prepared.length]!.trace],
  }));
};
