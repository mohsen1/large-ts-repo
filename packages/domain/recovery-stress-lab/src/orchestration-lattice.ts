import { type NoInfer, type Brand } from '@shared/type-level';
import { withBrand } from '@shared/core';
import {
  createTenantId,
  type CommandRunbook,
  type OrchestrationPlan,
  type RecoverySignal,
  type RecoverySimulationResult,
  type RecoverySignalId,
  type StageAttemptId,
  type TenantId,
  type WorkloadTarget,
  type WorkloadTopology,
  type StageAttempt,
  createStageAttemptId,
} from './models';

type ScoreLike = number & { readonly __brand: 'ScoreLike' };
type AttemptTemplate = {
  readonly phaseClass: 'raw' | 'derived' | 'prediction' | 'decision';
  readonly severityBand: RecoverySignal['severity'];
  readonly normalizedScore: ScoreLike;
};

export type LatticeRunId = Brand<string, 'LatticeRun'>;
export type LatticeIntentId = Brand<string, 'LatticeIntentId'>;
export type LatticeDigest = Brand<string, 'LatticeDigest'>;
export type LatticeRouteDigest = Brand<string, 'LatticeRouteDigest'>;

export type RouteSegments<T extends string> = readonly [T, ...readonly string[]];

export type RecursivePhaseTuple<TSignals extends readonly unknown[]> = TSignals extends readonly [infer Head, ...infer Tail]
  ? Head extends RecoverySignal
    ? readonly [Head, ...RecursivePhaseTuple<Tail>]
    : never
  : readonly [];

export type SignalIdTuple<TSignals extends readonly RecoverySignal[]> = {
  readonly [K in keyof TSignals]: RecoverySignalId & TSignals[K]['id'];
};

export interface LatticeAttempt {
  readonly id: StageAttemptId;
  readonly source: RecoverySignalId;
  readonly phaseClass: AttemptTemplate['phaseClass'];
  readonly severityBand: AttemptTemplate['severityBand'];
  readonly normalizedScore: AttemptTemplate['normalizedScore'];
}

export interface LatticeTopologyProfile {
  readonly tenantId: TenantId;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly activeNodeCount: number;
  readonly targetCount: number;
}

export interface LatticePlanContext {
  readonly phase: `phase:${string}`;
  readonly runbookCount: number;
  readonly targetCount: number;
  readonly runbooks: readonly CommandRunbook['id'][];
}

export interface LatticeRun<TSignals extends readonly RecoverySignal[] = readonly RecoverySignal[]> {
  readonly runId: LatticeRunId;
  readonly tenantId: TenantId;
  readonly createdAt: string;
  readonly digest: LatticeDigest;
  readonly plan: OrchestrationPlan;
  readonly simulation: RecoverySimulationResult;
  readonly signals: Readonly<TSignals>;
  readonly topology: LatticeTopologyProfile;
  readonly attempts: readonly LatticeAttempt[];
}

export interface LatticeSummary<TSignals extends readonly RecoverySignal[] = readonly RecoverySignal[]> {
  readonly runId: LatticeRun['runId'];
  readonly tenantId: TenantId;
  readonly signalCount: number;
  readonly topSignals: RecursivePhaseTuple<TSignals>;
  readonly topSignalIds: SignalIdTuple<TSignals>;
  readonly severityBuckets: {
    readonly [K in RecoverySignal['severity']]: number;
  };
  readonly route: RouteSegments<string>;
  readonly routeDigest: LatticeRouteDigest;
  readonly topology: LatticeTopologyProfile;
}

export interface LatticeIntent<TSignals extends readonly RecoverySignal[] = readonly RecoverySignal[]> {
  readonly intentId: LatticeIntentId;
  readonly run: LatticeRun<TSignals>;
  readonly tenantId: TenantId;
  readonly targets: readonly WorkloadTarget[];
  readonly context: LatticePlanContext;
  readonly summary: LatticeSummary<TSignals>;
  readonly routeKey: string;
}

export interface LatticeBuildInput<TSignals extends readonly RecoverySignal[]> {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan;
  readonly simulation: RecoverySimulationResult;
  readonly signals: NoInfer<TSignals>;
  readonly targets: readonly WorkloadTarget[];
}

export interface RouteContext {
  readonly tenantId: TenantId;
  readonly sequence: readonly string[];
  readonly routeLabel: string;
}

type SeverityBuckets = {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
};

const toSignalId = (signal: RecoverySignal): RecoverySignalId => signal.id;
const scoreOf = (signal: RecoverySignal): ScoreLike => {
  const normalized = signal.severity === 'critical'
    ? 1
    : signal.severity === 'high'
      ? 0.74
      : signal.severity === 'medium'
        ? 0.46
        : 0.12;
  return Math.max(0, Math.min(1, normalized)) as ScoreLike;
};

const toSeverityBuckets = (signals: readonly RecoverySignal[]): SeverityBuckets => {
  return signals.reduce<SeverityBuckets>(
    (acc, signal) => ({
      ...acc,
      [signal.severity]: acc[signal.severity] + 1,
    }),
    { low: 0, medium: 0, high: 0, critical: 0 },
  );
};

const toTopologyProfile = (tenantId: TenantId, topology: WorkloadTopology, targets: readonly WorkloadTarget[]): LatticeTopologyProfile => {
  const nodes = topology.nodes;
  const active = nodes.filter((node) => node.active);
  return {
    tenantId,
    nodeCount: nodes.length,
    edgeCount: topology.edges.length,
    activeNodeCount: active.length,
    targetCount: targets.length,
  };
};

const iteratorFrom = (globalThis as { readonly Iterator?: { from?: <T>(value: Iterable<T>) => { map<U>(transform: (value: T) => U): { toArray(): U[] }; toSorted(compare?: (left: unknown, right: unknown) => number): unknown[] } } }).Iterator?.from;

const toArray = <T>(value: Iterable<T>): readonly T[] =>
  iteratorFrom?.(value)?.map((entry: T) => entry)?.toArray() ?? Array.from(value);

const buildRoute = (tenantId: TenantId): RouteContext => {
  const sequence = toArray([`tenant:${tenantId}`, `plan:${Date.now()}`, `attempt:${Math.floor(Math.random() * 1000)}`]);
  const routeLabel = sequence.join('/');
  return { tenantId, sequence, routeLabel };
};

const buildAttempts = (tenantId: TenantId, signals: readonly RecoverySignal[]): readonly LatticeAttempt[] =>
  signals.map((signal, index) => ({
    id: createStageAttemptId(`${tenantId}::${signal.id}::${index}`),
    source: toSignalId(signal),
    phaseClass: index % 2 === 0 ? 'raw' : index % 3 === 0 ? 'derived' : 'decision',
    severityBand: signal.severity,
    normalizedScore: scoreOf(signal),
  }));

const toRunDigest = (tenantId: TenantId, plan: OrchestrationPlan, signals: readonly RecoverySignal[]): LatticeDigest => {
  const digest = `${tenantId}:${plan.scenarioName}:${plan.estimatedCompletionMinutes}:${signals.length}:${plan.runbooks.length}`;
  return withBrand(digest, 'LatticeDigest');
};

const runIdFrom = (tenantId: TenantId): LatticeRunId => withBrand(`${tenantId}::run::${Date.now()}::${Math.random()}`, 'LatticeRun');
const intentIdFrom = (tenantId: TenantId): LatticeIntentId => withBrand(`${tenantId}::intent::${Date.now()}`, 'LatticeIntentId');

export const routeDigest = (tenantId: TenantId, ...segments: readonly string[]): LatticeRouteDigest => {
  const base = `${tenantId}::${segments.join('::')}`;
  return withBrand(base, 'LatticeRouteDigest');
};

export const buildLatticeRun = <TSignals extends readonly RecoverySignal[]>(
  tenantId: TenantId | string,
  plan: OrchestrationPlan,
  simulation: RecoverySimulationResult,
  signals: NoInfer<TSignals>,
): LatticeRun<TSignals> => {
  const inputTenant = createTenantId(String(tenantId));
  const runTopology = toTopologyProfile(inputTenant, {
    tenantId: inputTenant,
    nodes: [],
    edges: [],
  }, []);

  const run: LatticeRun<TSignals> = {
    runId: runIdFrom(inputTenant),
    tenantId: inputTenant,
    createdAt: new Date().toISOString(),
    digest: toRunDigest(inputTenant, plan, signals),
    plan,
    simulation,
    signals: [...signals],
    topology: runTopology,
    attempts: buildAttempts(inputTenant, signals),
  };

  return run;
};

const summarizeTopology = (
  tenantId: TenantId,
  topology: WorkloadTopology,
  targets: readonly WorkloadTarget[],
): LatticeTopologyProfile => ({
  tenantId,
  nodeCount: topology.nodes.length,
  edgeCount: topology.edges.length,
  activeNodeCount: topology.nodes.filter((node) => node.active).length,
  targetCount: targets.length,
});

const summarizeContext = (run: LatticeRun, targets: readonly WorkloadTarget[]): LatticePlanContext => {
  const bySeverity = toSeverityBuckets(run.signals);
  return {
    phase: `phase:${run.plan.scenarioName}`,
    runbookCount: run.plan.runbooks.length,
    targetCount: targets.length,
    runbooks: run.plan.runbooks.map((runbook) => runbook.id),
  };
};

export const buildLatticeIntent = <TSignals extends readonly RecoverySignal[]>(
  input: LatticeBuildInput<TSignals>,
  topology: WorkloadTopology,
): LatticeIntent<TSignals> => {
  const run = buildLatticeRun(input.tenantId, input.plan, input.simulation, input.signals);
  const runTopology = summarizeTopology(input.tenantId, topology, input.targets);
  const routeContext = buildRoute(input.tenantId);
  const severities = toSeverityBuckets(input.signals);
  const orderedSignals = [...input.signals].toSorted((left, right) => right.severity.localeCompare(left.severity));
  const topSignals = (orderedSignals.slice(0, Math.min(6, orderedSignals.length)) as unknown) as RecursivePhaseTuple<TSignals>;
  const summary: LatticeSummary<TSignals> = {
    runId: run.runId,
    tenantId: input.tenantId,
    signalCount: input.signals.length,
    topSignals,
    topSignalIds: orderedSignals.map((signal) => signal.id) as SignalIdTuple<TSignals>,
    severityBuckets: severities,
    route: ['run', 'intent', ...routeContext.sequence] as RouteSegments<string>,
    routeDigest: routeDigest(input.tenantId, ...routeContext.sequence),
    topology: runTopology,
  };

  return {
    intentId: intentIdFrom(input.tenantId),
    run: { ...run, topology: runTopology },
    tenantId: input.tenantId,
    targets: input.targets,
    context: summarizeContext(run, input.targets),
    summary,
    routeKey: routeContext.routeLabel,
  };
};

export const toRunAttemptSeries = (run: LatticeRun): readonly StageAttempt[] =>
  run.attempts.map((attempt) => ({
    id: attempt.id as StageAttempt['id'],
    source: attempt.source,
    phaseClass: attempt.phaseClass,
    severityBand: attempt.severityBand,
    normalizedScore: attempt.normalizedScore,
  }));

export const buildBundleDigest = (intent: LatticeIntent): string =>
  `${intent.run.runId}:${intent.tenantId}:${intent.summary.signalCount}:${intent.summary.topSignalIds.length}`;

export const isLatticeRun = <TSignals extends readonly RecoverySignal[]>(value: unknown): value is LatticeRun<TSignals> =>
  Boolean(value && typeof value === 'object' && 'runId' in value && 'tenantId' in value && 'signals' in value);
