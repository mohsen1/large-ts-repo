import type { JsonValue } from '@shared/type-level';
import type { OrchestrationLab, LabExecution, LabSignal, LabPlan } from './types';
import type { LabGraphSnapshot, LabGraphNode, GraphPath, LabGraphEdge } from './lab-graph';
import { buildLabGraph } from './lab-graph';

export interface AuditRecord {
  readonly id: string;
  readonly at: string;
  readonly category: 'signal' | 'plan' | 'execution' | 'trace';
  readonly detail: string;
  readonly payload: JsonValue;
}

export interface ExecutionDigest {
  readonly runId: string;
  readonly planId: LabPlan['id'];
  readonly signals: number;
  readonly nodes: number;
  readonly durationSeconds: number;
  readonly status: LabExecution['status'];
}

export interface TelemetryReport {
  readonly labId: string;
  readonly snapshots: readonly string[];
  readonly graph: {
    readonly nodes: number;
    readonly edges: number;
    readonly paths: readonly Readonly<Record<string, number>>[];
  };
  readonly auditTrail: readonly AuditRecord[];
}

export type ReadonlyPathTuple<T extends readonly string[]> = T[number] extends infer Segment
  ? ReadonlyArray<Segment>
  : never;

export type ReadonlyTuple = readonly [string, string, ...string[]];

const now = (): string => new Date().toISOString();

export const buildExecutionDigest = (execution: LabExecution, graph: LabGraphSnapshot, plans: readonly LabPlan[]): ExecutionDigest => {
  const matchingPlan = plans.find((plan) => plan.id === execution.planId);
  const status = execution.status;

  return {
    runId: String(execution.id),
    planId: execution.planId,
    signals: execution.logs.length,
    nodes: graph.nodes.length,
    durationSeconds: execution.completedAt
      ? Math.max(1, (new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)
      : 0,
    status,
  };
};

const compact = (value: string): string => value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

export const describeSignals = (signals: readonly LabSignal[]): readonly string[] => {
  const ordered = [...signals].toSorted((left, right) => right.score - left.score);
  return ordered.map((signal) => `${compact(signal.title)}:${signal.tier}:${signal.score.toFixed(1)}`);
};

export const graphPathAsTuple = <TPath extends ReadonlyTuple>(path: GraphPath<string>): ReadonlyPathTuple<TPath> => {
  const entries = path.steps.map((entry) => compact(String(entry)));
  return entries as unknown as ReadonlyPathTuple<TPath>;
};

export const buildReport = (lab: OrchestrationLab, execution?: LabExecution): TelemetryReport => {
  const graph = buildLabGraph(lab);
  const auditTrail = buildAuditTrail(lab);

  return {
    labId: String(lab.id),
    snapshots: [
      `tenant:${lab.tenantId}`,
      `signals:${lab.signals.length}`,
      `plans:${lab.plans.length}`,
      execution ? `run:${execution.id}` : 'run:none',
    ],
    graph: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      paths: buildPathProfiles(graph.nodes, graph.edges),
    },
    auditTrail,
  };
};

const buildAuditTrail = (lab: OrchestrationLab): readonly AuditRecord[] => {
  const created = {
    id: `${lab.id}:created`,
    at: lab.createdAt,
    category: 'trace',
    detail: 'lab-created',
    payload: { title: lab.title },
  } as const;

  const bySignal = lab.signals.map((signal): AuditRecord => ({
    id: `${lab.id}:${signal.id}`,
    at: signal.createdAt ?? now(),
    category: 'signal',
    detail: signal.title,
    payload: {
      tier: signal.tier,
      score: signal.score,
      id: signal.id,
    },
  }));

  const byPlan = lab.plans.map((plan): AuditRecord => ({
    id: `${lab.id}:${plan.id}`,
    at: plan.createdAt,
    category: 'plan',
    detail: plan.title,
    payload: {
      id: plan.id,
      score: plan.score,
      risk: plan.confidence,
    },
  }));

  return [created, ...bySignal, ...byPlan].toSorted((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
};

const buildPathProfiles = (nodes: readonly LabGraphNode[], edges: readonly LabGraphEdge[]) => {
  const bySource = new Map<string, number>();
  for (const edge of edges) {
    const current = bySource.get(String(edge.from)) ?? 0;
    bySource.set(String(edge.from), current + 1);
  }

  const summaries = nodes.map((node) => {
    const degree = bySource.get(String(node.id)) ?? 0;
    return {
      [String(node.id)]: degree,
    };
  });

  return summaries;
};

export const emitTelemetrySnapshot = (lab: OrchestrationLab): string => {
  const lines = [
    `lab=${lab.id}`,
    `plans=${lab.plans.length}`,
    `signals=${lab.signals.length}`,
    `tenant=${lab.tenantId}`,
    ...describeSignals(lab.signals),
  ];
  return lines.join('\n');
};

export const splitSignals = (signals: readonly LabSignal[]): readonly [readonly LabSignal[], readonly LabSignal[]] => {
  const critical = signals.filter((signal) => signal.tier === 'critical');
  const nonCritical = signals.filter((signal) => signal.tier !== 'critical');
  return [critical, nonCritical];
};

export const reduceSignalScore = (...signalGroups: readonly (readonly LabSignal[])[]): number => {
  const all = signalGroups.flat();
  if (all.length === 0) {
    return 0;
  }

  const base = all.reduce((acc, signal) => acc + signal.score, 0);
  return Number((base / all.length).toFixed(3));
};

const flattenMap = <T>(input: Iterable<T>): readonly T[] => [...input];

export const mapSignals = (signals: readonly LabSignal[], fn: (signal: LabSignal) => string): readonly string[] => {
  const iterator = flattenMap(signals);
  const nextValues = [] as string[];
  for (const signal of iterator) {
    nextValues.push(fn(signal));
  }
  return nextValues.toSorted();
};

export const zipSignalsAndPlans = (
  signals: readonly LabSignal[],
  plans: readonly LabPlan[],
): readonly [LabSignal, LabPlan | undefined][] => {
  const max = Math.max(signals.length, plans.length);
  return Array.from({ length: max }, (_, index) => {
    const signal = signals[index] ?? signals[index % signals.length];
    return [signal, plans[index]];
  });
};
