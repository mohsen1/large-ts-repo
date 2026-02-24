import type { DomainPhase, RecoveryRun, RecoveryRunbook, ScenarioProjection, StageNode, StageEdge } from './models';
import { chain, type NoInfer } from '@shared/orchestration-kernel';

export type MetricDimension = keyof Pick<StageNode['metrics'], 'slo' | 'capacity' | 'compliance' | 'security'>;
export type MetricPath = `${'recovery' | 'incident'}/${string}`;
export type BrandedTag<T extends string> = `${T}:${string}`;
export type RuntimePhase = 'preflight' | 'planning' | 'execution' | 'verification' | 'closure';
export type TimelineEvent<TScope extends string = string> = `timeline/${TScope}/${RuntimePhase}`;
export type SplitPath<TPath extends string> = TPath extends `${infer Head}/${infer Rest}`
  ? readonly [Head, ...SplitPath<Rest>]
  : readonly [TPath];
export type RecursiveTuple<T, Depth extends number = 12, Prefix extends readonly T[] = []> = Prefix['length'] extends Depth
  ? Prefix
  : Prefix extends readonly [infer _, ...infer Tail]
    ? RecursiveTuple<T, Depth, readonly [...Prefix, T]>
    : never;

export type RemapNodeColumns<TRecord extends Record<string, unknown>> = {
  [K in keyof TRecord as `node:${Extract<K, string>}`]: TRecord[K];
};

export type NodeByStatus<T extends Readonly<Record<StageNode['status'], readonly StageNode[]>>> = {
  readonly [K in keyof T]: {
    readonly status: K;
    readonly nodes: T[K];
  };
};

export type RuntimeWindowBounds = { readonly from: number; readonly to: number };
export type BoundedWindow = RuntimeWindowBounds & { readonly width: number };

export interface RunbookMetrics<TNode extends StageNode = StageNode> {
  readonly averageSlo: number;
  readonly averageCapacity: number;
  readonly averageCompliance: number;
  readonly averageSecurity: number;
  readonly nodeCount: number;
  readonly hotNodes: readonly TNode[];
}

export interface HealthEnvelope {
  readonly id: BrandedTag<'runbook'>;
  readonly windows: readonly BoundedWindow[];
  readonly phase: DomainPhase;
  readonly score: number;
  readonly projections: readonly ScenarioProjection[];
}

export interface DiagnosticQuery<TContext extends string = string, TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly context: TContext;
  readonly payload: TPayload;
  readonly correlationId: string;
}

type EnsureDomainPhase<T extends string> = T extends DomainPhase ? T : DomainPhase;
export type PolicyTuple<TTags extends readonly string[]> = {
  [K in keyof TTags]: `policy:${TTags[K] & string}`;
};

const ensureWindowWidth = (window: RuntimeWindowBounds): BoundedWindow => ({
  ...window,
  width: Math.max(0, window.to - window.from),
});

const numeric = (value: number): number => (Number.isFinite(value) ? value : 0);

export const splitPath = <TPath extends string>(path: TPath): SplitPath<TPath> =>
  (path.split('/').filter(Boolean) as unknown) as SplitPath<TPath>;

export const mapNodeState = <TNode extends StageNode>(nodes: readonly TNode[]): ReadonlyMap<DomainPhase, readonly TNode[]> => {
  const grouped = new Map<DomainPhase, TNode[]>();
  for (const node of nodes) {
    const list = grouped.get(node.phase) ?? [];
    list.push(node);
    grouped.set(node.phase, list);
  }
  return grouped as ReadonlyMap<DomainPhase, readonly TNode[]>;
};

export const classifyByStatus = (nodes: readonly StageNode[]): NodeByStatus<Record<StageNode['status'], readonly StageNode[]>> => {
  const grouped = {
    pending: [] as StageNode[],
    active: [] as StageNode[],
    suppressed: [] as StageNode[],
    complete: [] as StageNode[],
  };
  for (const node of nodes) {
    grouped[node.status].push(node);
  }
  return {
    pending: { status: 'pending', nodes: grouped.pending },
    active: { status: 'active', nodes: grouped.active },
    suppressed: { status: 'suppressed', nodes: grouped.suppressed },
    complete: { status: 'complete', nodes: grouped.complete },
  } as NodeByStatus<Record<StageNode['status'], readonly StageNode[]>>;
};

const metricAverages = (nodes: readonly StageNode[]): RunbookMetrics => {
  const totals = {
    slo: 0,
    capacity: 0,
    compliance: 0,
    security: 0,
  };
  const hotNodes: StageNode[] = [];
  for (const node of nodes) {
    totals.slo += numeric(node.metrics.slo);
    totals.capacity += numeric(node.metrics.capacity);
    totals.compliance += numeric(node.metrics.compliance);
    totals.security += numeric(node.metrics.security);
    if (node.metrics.slo < 0.4 || node.metrics.capacity < 0.4) {
      hotNodes.push(node);
    }
  }
  const count = Math.max(1, nodes.length);
  return {
    averageSlo: totals.slo / count,
    averageCapacity: totals.capacity / count,
    averageCompliance: totals.compliance / count,
    averageSecurity: totals.security / count,
    nodeCount: nodes.length,
    hotNodes,
  };
};

export const collectRunbookProjections = (runbook: RecoveryRunbook): readonly ScenarioProjection[] =>
  chain(runbook.nodes)
    .map((node) => {
      const neighbors = runbook.edges.filter((edge: StageEdge) => edge.from === node.id).length;
      return {
        key: `tenant/${runbook.tenant}/${node.id}` as const,
        active: neighbors,
        failed: Math.round(10 * (node.metrics.slo + node.metrics.capacity + node.metrics.compliance + node.metrics.security)),
        complete: node.status === 'complete' ? 1 : 0,
      };
    })
    .toArray();

export const buildWindows = (points: readonly number[]): readonly BoundedWindow[] => {
  const sorted = [...points].toSorted((left, right) => left - right);
  if (sorted.length < 2) {
    return [];
  }
  return sorted
    .map((point: number, index: number): RuntimeWindowBounds => ({ from: point, to: sorted[index + 1] ?? point }))
    .filter((window): window is RuntimeWindowBounds => window.from !== window.to)
    .map(ensureWindowWidth);
};

export const composeHealthEnvelope = <
  TRunbook extends RecoveryRunbook,
  TRun extends RecoveryRun,
>(
  runbook: TRunbook,
  run: TRun,
  query: DiagnosticQuery,
): HealthEnvelope => {
  const projections = collectRunbookProjections(runbook);
  const phases = runbook.nodes.map((node) => node.phase);
  const orderedPhases = chain(new Set(phases)).toArray().sort() as readonly DomainPhase[];
  const phase = EnsureDomainPhase(orderedPhases[0] ?? 'discover');
  const metrics = metricAverages(runbook.nodes);
  return {
    id: `runbook:${query.context}:${run.runId}` as BrandedTag<'runbook'>,
    windows: buildWindows(run.observedNodes.map((nodeId, index) => index + Number(metrics.averageSlo * 100))),
    phase,
    score: (metrics.averageSlo + metrics.averageCapacity + metrics.averageCompliance + metrics.averageSecurity) / 4,
    projections,
  };
};

export const normalizeWindowBounds = <T extends RuntimeWindowBounds>(input: T): BoundedWindow => ({
  ...input,
  width: Math.max(0, input.to - input.from),
});

const EnsureDomainPhase = <T extends string>(value: T): DomainPhase => {
  if ((['discover', 'stabilize', 'mitigate', 'validate', 'document'] as const).includes(value as DomainPhase)) {
    return value as DomainPhase;
  }
  return 'discover';
};

export const toTimelineTag = <TPhase extends RuntimePhase>(phase: NoInfer<TPhase>): TimelineEvent<TPhase> =>
  `timeline/recovery/${phase}` as TimelineEvent<TPhase>;

export const policyTags = <TLabels extends readonly string[]>(labels: TLabels): PolicyTuple<TLabels> =>
  labels.reduce<PolicyTuple<TLabels>>(
    (acc, label) => [...acc, `policy:${label}`] as PolicyTuple<TLabels>,
    [] as PolicyTuple<TLabels>,
  );

export const summarizeDiagnostics = <TRunbook extends RecoveryRunbook>(
  runbook: TRunbook,
  runs: readonly RecoveryRun[],
): {
  readonly nodes: NodeByStatus<Record<StageNode['status'], readonly StageNode[]>>;
  readonly projectionMap: ReadonlyMap<DomainPhase, readonly TRunbook['nodes'][number][]>;
  readonly runAverages: readonly number[];
  readonly route: SplitPath<'tenant/recovery/route'>;
  readonly tags: Readonly<PolicyTuple<['recovery', 'studio', 'diagnostics']>>;
  readonly windows: readonly BoundedWindow[];
} => {
  const run = runs[0];
  const nodes = classifyByStatus(runbook.nodes);
  const projectionMap = mapNodeState(runbook.nodes);
  const runAverages = runs.map((entry) => entry.commandCount / Math.max(1, runbook.nodes.length));
  const route = splitPath('tenant/recovery/route');
  const tags = policyTags(['recovery', 'studio', 'diagnostics'] as const);
  return {
    nodes,
    projectionMap,
    runAverages,
    route,
    tags,
    windows: run ? buildWindows([run.startedAt, run.finishedAt ?? run.startedAt].map((entry) => new Date(entry).getTime())) : [],
  };
};
