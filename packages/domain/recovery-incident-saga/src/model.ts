import { Brand, withBrand, type Graph } from '@shared/core';
import type { NoInfer, RecursivePath, Merge } from '@shared/type-level';
import {
  type SagaEventEnvelope,
  type SagaContext,
  type SagaContextValue,
  type SagaErrorScope,
  asPhase,
  sagaPhases,
  mapByPhase,
  makeRunId,
  type SagaPhase,
  toNamespace,
} from '@shared/incident-saga-core';
import {
  type SagaRunId,
  type SagaRunStepId,
  type SagaRunPolicyId,
  type SagaPriority,
  type SagaGraphNodeId,
  defaultDomainMeta,
  phaseToColor,
  mapPriority,
  asPhase as toDomainPhase,
} from './constants';

export type { SagaRunId, SagaRunStepId, SagaRunPolicyId, SagaPriority, SagaGraphNodeId };
export { phaseToColor };

export interface SagaStepAction {
  readonly id: SagaRunStepId;
  readonly label: string;
  readonly command: string;
  readonly phase: SagaPhase;
  readonly owner: string;
  readonly risk: number;
  readonly prerequisites: readonly SagaRunStepId[];
}

export interface SagaPlanItem {
  readonly id: SagaRunStepId;
  readonly title: string;
  readonly weight: number;
  readonly command: string;
  readonly actionType: 'automated' | 'manual';
  readonly dependsOn: readonly SagaRunStepId[];
}

export interface SagaTimelineEvent {
  readonly at: string;
  readonly phase: SagaPhase;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SagaTelemetry {
  readonly latencyMs: number;
  readonly retries: number;
  readonly successRate: number;
  readonly lastStatus: 'queued' | 'running' | 'succeeded' | 'failed';
}

export interface SagaRun {
  readonly id: SagaRunId;
  readonly domain: string;
  readonly region: string;
  readonly policyId: SagaRunPolicyId;
  readonly createdAt: string;
  readonly priority: SagaPriority;
  readonly phase: SagaPhase;
  readonly timeline: readonly SagaTimelineEvent[];
  readonly steps: readonly SagaPlanItem[];
  readonly telemetry?: SagaTelemetry;
}

export interface SagaPlan {
  readonly runId: SagaRunId;
  readonly namespace: string;
  readonly policyId: SagaRunPolicyId;
  readonly steps: readonly SagaPlanItem[];
  readonly edges: readonly [SagaRunStepId, SagaRunStepId][];
  readonly createdAt: string;
}

export interface SagaPolicy {
  readonly id: SagaRunPolicyId;
  readonly name: string;
  readonly domain: string;
  readonly enabled: boolean;
  readonly confidence: number;
  readonly threshold: number;
  readonly steps: readonly SagaPlanItem[];
}

export interface SagaNode {
  readonly id: SagaGraphNodeId;
  readonly label: string;
  readonly command: string;
  readonly phase: SagaPhase;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface SagaGraph {
  readonly nodes: readonly SagaNode[];
  readonly edges: readonly [SagaGraphNodeId, SagaGraphNodeId][];
}

export interface SagaRunManifest {
  readonly run: SagaRun;
  readonly plan: SagaPlan;
  readonly topology: Graph<SagaGraphNodeId, number>;
  readonly policies: readonly SagaPolicy[];
}

export interface SagaRuntimeInput {
  readonly run: SagaRun;
  readonly plan: SagaPlan;
  readonly policy?: SagaPolicy;
}

export type EventMapToPayload = {
  action: SagaRun;
  plan: SagaPlan;
  note: SagaTimelineEvent;
};

export type DomainEventUnion = SagaEventEnvelope | SagaEventEnvelope<'saga:incident-saga', EventMapToPayload>;
export type WeightedStep<T> = T & { weight: number };
export type Ranked<T extends { readonly weight: number }> = T & { readonly weighted: boolean };

export type BucketedTimeline = ReturnType<typeof mapByPhase<SagaTimelineEvent>>;

export const groupByPhase = (steps: readonly SagaPlanItem[]): { [K in SagaPhase]: SagaPlanItem[] } => {
  const empty: { [K in SagaPhase]: SagaPlanItem[] } = {
    prepare: [],
    activate: [],
    execute: [],
    audit: [],
    retire: [],
  };

  for (const step of steps) {
    const marker = toDomainPhase(step.id.split(':')[0]);
    empty[marker].push(step);
  }
  return empty;
};

export const rankSteps = <T extends { readonly weight: number }>(steps: readonly T[]): readonly T[] =>
  [...steps].sort((left, right) => {
    const delta = right.weight - left.weight;
    if (delta !== 0) return delta;
    return JSON.stringify(left).localeCompare(JSON.stringify(right));
  });

export const applyPolicy = (policy: SagaPolicy, run: SagaRun): SagaRun => ({
  ...run,
  policyId: policy.id,
  phase: policy.threshold >= 0.8 ? 'activate' : 'prepare',
});

export const clonePlan = (plan: SagaPlan): SagaPlan => ({
  ...plan,
  runId: makeRunId(plan.runId),
  createdAt: new Date().toISOString(),
  steps: [...plan.steps],
  edges: [...plan.edges],
});

export const createTimelineEvent = (phase: SagaPhase, message: string, metadata: Readonly<Record<string, unknown>> = {}): SagaTimelineEvent => ({
  at: new Date().toISOString(),
  phase,
  message,
  metadata,
});

export const buildPolicyFingerprint = (policy: SagaPolicy): SagaRunPolicyId => {
  const source = JSON.stringify({
    id: policy.id,
    name: policy.name,
    confidence: policy.confidence,
    threshold: policy.threshold,
    enabled: policy.enabled,
    steps: policy.steps.length,
  });
  return `${policy.id}::${source.length}` as SagaRunPolicyId;
};

export const resolveStepWeight = <T extends Pick<SagaPlanItem, 'id' | 'weight'>>(step: T): number =>
  step.weight + String(step.id).length / 100;

export const toReadonlyPlan = (plan: SagaPlan): Readonly<SagaPlan> => ({
  ...plan,
  steps: [...plan.steps],
  edges: [...plan.edges],
});

export const asDomainGraph = (plan: SagaPlan): SagaGraph => {
  const toNodeId = (stepId: SagaRunStepId): SagaGraphNodeId => withBrand(`${stepId}`, 'NodeId');
  const nodes = plan.steps.map<SagaNode>((step) => ({
    id: withBrand(`${plan.runId}:${String(step.id)}`, 'NodeId'),
    label: step.title,
    command: step.command,
    phase: asPhase(step.id.split(':')[0]),
    metadata: {
      weight: step.weight,
      dependsOn: step.dependsOn,
      actionType: step.actionType,
    },
  }));
  const edges: SagaGraph['edges'] = plan.edges.map(([from, to]) => [toNodeId(from), toNodeId(to)]);
  return { nodes, edges };
};

export const asGraph = (plan: SagaPlan): Graph<SagaGraphNodeId, number> => {
  const graph = asDomainGraph(plan);
  return {
    nodes: graph.nodes.map((node) => node.id),
    edges: graph.edges.map(([from, to], index) => ({ from, to, weight: index + 1 })),
  };
};

export const collectWarnings = (run: SagaRun): readonly string[] => {
  const fromTimeline = run.timeline.filter((entry) => entry.message.includes('warn')).map((entry) => `${entry.phase}:${entry.message}`);
  const fromTelemetry = run.telemetry && run.telemetry.retries > 40 ? ['high-retry-count'] : [];
  const fromHealth = run.telemetry && run.telemetry.successRate < 0.4 ? ['low-success-rate'] : [];
  return [...fromTimeline, ...fromTelemetry, ...fromHealth];
};

export type EventMapKeys = keyof EventMapToPayload;
export type SagaSummaryInput = SagaRun | ({ readonly errors: SagaErrorScope[]; readonly phase?: SagaPhase; readonly domain?: string });

export interface SagaRunSummary {
  readonly run: SagaRun;
  readonly activeSteps: readonly string[];
  readonly warnings: readonly string[];
  readonly domain: string;
}

export const summarizeRun = (value: SagaSummaryInput): SagaRunSummary => {
  if ('steps' in value) {
    return {
      run: value,
      activeSteps: value.steps.filter((step) => step.weight > 0).map((step) => step.id),
      warnings: collectWarnings(value),
      domain: value.domain,
    };
  }

  const fallback: SagaRun = {
    id: makeRunId(value.domain ?? 'incident-saga') as SagaRunId,
    domain: value.domain ?? 'incident-saga',
    region: 'us-east-1',
    policyId: `${value.domain ?? 'incident-saga'}-fallback` as SagaRunPolicyId,
    createdAt: new Date().toISOString(),
    priority: 'normal',
    phase: value.phase ?? 'prepare',
    timeline: [],
    steps: [],
    telemetry: {
      latencyMs: 0,
      retries: 0,
      successRate: 1,
      lastStatus: 'queued',
    },
  };

  return {
    run: fallback,
    activeSteps: [],
    warnings: value.errors.map((error) => error.code as string),
    domain: fallback.domain,
  };
};

export type StepWeights<TSteps extends readonly SagaPlanItem[]> = {
  readonly [K in TSteps[number]['id']]: Extract<TSteps[number], { id: K }>['weight'];
};

export const mergeRunAndPolicy = <T extends SagaRun, K extends SagaPolicy>(
  run: T,
  policy: K,
): Merge<T, { policyId: K['id'] }> => ({
  ...run,
  policyId: policy.id,
  timeline: [...run.timeline, createTimelineEvent('activate', `policy=${policy.name}`)],
});

export const timelineToBuckets = (timeline: readonly SagaTimelineEvent[]): BucketedTimeline => ({
  prepare: timeline.filter((entry) => entry.phase === 'prepare'),
  activate: timeline.filter((entry) => entry.phase === 'activate'),
  execute: timeline.filter((entry) => entry.phase === 'execute'),
  audit: timeline.filter((entry) => entry.phase === 'audit'),
  retire: timeline.filter((entry) => entry.phase === 'retire'),
});

export const buildEventStream = (
  run: SagaRun,
  plan: SagaPlan,
): SagaEventEnvelope<`saga:${string}`, { readonly run: SagaRun; readonly plan: SagaPlan; readonly issuedBy: string }> => {
  const phase = asPhase(run.phase);
  const namespace = toNamespace(run.domain);
  const eventIdNamespace = `event:${namespace}` as const;
  const event: SagaEventEnvelope<`saga:${string}`, { readonly run: SagaRun; readonly plan: SagaPlan; readonly issuedBy: string }> = {
    eventId: withBrand(`${run.id}:stream:${run.domain}`, eventIdNamespace),
    namespace,
    kind: `${namespace}::${phase}`,
    payload: {
      run,
      plan,
      issuedBy: defaultDomainMeta.domain,
    },
    recordedAt: new Date().toISOString(),
    tags: ['tag:prepare'],
  };
  return event;
};

export const extractTimelineMetadata = (plan: SagaPlan): RecursivePath<SagaPlan> => {
  const raw: RecursivePath<SagaPlan> = 'runId' as RecursivePath<SagaPlan>;
  return raw;
};

export const makeNoopContext = (id: string): SagaContext => ({
  runId: makeRunId(id),
  runNamespace: `saga:${defaultDomainMeta.domain}` as const,
  phase: 'prepare',
  startedAt: new Date().toISOString(),
  traceId: `${id}-trace` as Brand<string, 'SagaTraceId'>,
});

export const asSagaContextValue = (run: SagaRun): SagaContextValue<{ label: string }> => ({
  meta: {
    label: run.id,
  },
  timestamp: new Date().toISOString(),
  phase: run.phase,
});

export const toPolicyStep = (phase: SagaPhase, base: string, confidence = 0.6): SagaPolicy => ({
  id: `${base}-${phase}` as SagaRunPolicyId,
  name: `policy:${base}:${phase}`,
  domain: base,
  enabled: true,
  confidence,
  threshold: 0.5,
  steps: [],
});

export const prioritizeBy = (value: number, fallback: SagaPolicy): SagaPriority => (value >= 0.75 ? 'critical' : value >= 0.5 ? 'high' : value >= 0.25 ? 'normal' : 'low');

export const normalizePriorityFromModel = (priority: SagaPriority): number => mapPriority(priority);

export const toNoopPlan = (namespace: string): SagaPlan => ({
  runId: makeRunId(namespace) as SagaRunId,
  namespace,
  policyId: `${namespace}-policy` as SagaRunPolicyId,
  steps: [],
  edges: [],
  createdAt: new Date().toISOString(),
});

export const withPolicyContext = <T extends SagaPolicy>(policy: T): NoInfer<T> => policy;
