import { runScheduler, type SchedulerInput, type TimelinePhase } from './scheduler';
import { withBrand } from '@shared/core';
import type { RecoveryRunbook } from '@domain/recovery-orchestration-design';
import type { EngineConfig } from './types';

export type BlueprintId = `blueprint:${string}`;
export type BlueprintVersion = `v${number}.${number}`;
export type BlueprintTrace = `trace:${string}`;
export type BlueprintPriority = number & { readonly __brand: 'BlueprintPriority' };
export type BlueprintRoute = `run/${'books' | 'timeline'}/${'active' | 'archived'}`;

export type BlueprintSignal = {
  readonly code: `signal:${string}`;
  readonly value: number;
};

export type BlueprintSignalRegistry = Readonly<Record<BlueprintSignal['code'], number>>;

export type BlueprintInput = {
  readonly runbook: RecoveryRunbook;
  readonly planId: BlueprintId;
  readonly config: EngineConfig;
  readonly signalThreshold: number;
};

export type BlueprintEnvelope = {
  readonly version: BlueprintVersion;
  readonly name: string;
  readonly runbook: RecoveryRunbook;
  readonly score: number;
  readonly tags: readonly string[];
  readonly trace: BlueprintTrace;
};

export type BlueprintOutput = {
  readonly runbook: RecoveryRunbook;
  readonly score: number;
  readonly priority: number;
  readonly route: BlueprintRoute;
  readonly signals: BlueprintSignalRegistry;
  readonly timeline: readonly TimelinePhase[];
  readonly summary: {
    readonly phases: readonly string[];
    readonly nodeCount: number;
    readonly directiveCount: number;
    readonly edgeCount: number;
  };
};

export const toBlueprintId = (value: string): BlueprintId => `blueprint:${value}` as BlueprintId;
export const toBlueprintTrace = (value: string): BlueprintTrace => `trace:${value}` as BlueprintTrace;

const defaultRoute: BlueprintRoute = 'run/books/active';

const normalizeSignal = (entry: { readonly code: string; readonly value: number }): BlueprintSignal => ({
  code: `signal:${entry.code}`,
  value: Number.isFinite(entry.value) ? entry.value : 0,
});

const nodeSignals = (runbook: RecoveryRunbook): readonly BlueprintSignal[] =>
  runbook.nodes.map((node, index) =>
    normalizeSignal({
      code: `${node.id}-${node.phase}`,
      value: node.metrics.slo * 100 - index,
    }),
  );

const priorityFromScore = (score: number): number & { readonly __brand: 'BlueprintPriority' } => {
  const bounded = Math.max(0, Math.min(100, Math.floor(score)));
  return bounded as BlueprintPriority;
};

export const buildBlueprint = (input: BlueprintInput): BlueprintEnvelope => {
  const score = Math.max(0, 100 - input.signalThreshold + input.runbook.nodes.length * 2);
  return {
    version: `v1.${input.runbook.nodes.length}` as BlueprintVersion,
    name: input.runbook.title,
    runbook: input.runbook,
    score,
    tags: ['studio', 'runtime', 'blueprint'],
    trace: toBlueprintTrace(`runbook:${input.runbook.scenarioId}`),
  };
};

export const extractSignals = (runbook: RecoveryRunbook): readonly BlueprintSignal[] => nodeSignals(runbook);

export const buildSignalRegistry = (signals: readonly BlueprintSignal[]): BlueprintSignalRegistry =>
  Object.fromEntries(signals.map((signal) => [signal.code, signal.value])) as BlueprintSignalRegistry;

export const splitBlueprintRunbook = (runbook: RecoveryRunbook): { readonly title: string; readonly nodes: RecoveryRunbook['nodes'] } => {
  const [head, ...tail] = runbook.nodes;
  void head;
  return {
    title: runbook.title,
    nodes: tail,
  };
};

export const buildPriorityBuckets = (
  blueprints: readonly BlueprintEnvelope[],
): ReadonlyMap<number & { readonly __brand: 'BlueprintPriority' }, ReadonlyArray<BlueprintEnvelope>> => {
  const buckets = new Map<number & { readonly __brand: 'BlueprintPriority' }, BlueprintEnvelope[]>();
  for (const blueprint of blueprints) {
    const key = priorityFromScore(blueprint.score);
    const list = buckets.get(key) ?? [];
    list.push(blueprint);
    buckets.set(key, list);
  }
  return buckets;
};

export const normalizeBlueprintEnvelope = (value: unknown): BlueprintEnvelope => {
  const record = value as Partial<BlueprintEnvelope>;
  return {
    version: record.version ?? ('v1.0' as BlueprintVersion),
    name: record.name ?? 'unnamed blueprint',
    runbook: record.runbook as RecoveryRunbook,
    score: Number.isFinite(record.score as number) ? Number(record.score) : 0,
    tags: record.tags ?? [],
    trace: record.trace ?? toBlueprintTrace('studio'),
  };
};

export const buildRuntimeSignals = async (input: BlueprintInput): Promise<BlueprintOutput> => {
  const blueprint = buildBlueprint(input);
  const schedulerInput: SchedulerInput = {
    workload: {
      workspace: input.config.workspace,
      planId: withBrand(input.planId, 'WorkloadPlanId'),
      scenarioId: withBrand(input.runbook.scenarioId, 'WorkloadScenarioId'),
      requestedAt: new Date().toISOString(),
    },
    tags: ['runtime', String(input.planId)],
  };

  await runScheduler(schedulerInput, (values) => `${blueprint.name}:${values.length}`);

  return {
    runbook: input.runbook,
    score: blueprint.score,
    priority: Math.min(100, blueprint.score),
    route: defaultRoute,
    signals: buildSignalRegistry(extractSignals(input.runbook)),
    timeline: ['planning', 'execution', 'observation', 'complete'],
    summary: {
      phases: ['discover', 'stabilize', 'mitigate', 'validate'],
      nodeCount: input.runbook.nodes.length,
      directiveCount: input.runbook.directives.length,
      edgeCount: input.runbook.edges.length,
    },
  };
};

export const withBlueprint = async <TResult>(
  factory: () => Promise<BlueprintInput>,
  callback: (envelope: BlueprintOutput) => Promise<TResult>,
): Promise<TResult> => {
  const input = await factory();
  const snapshot = await buildRuntimeSignals(input);
  return callback(snapshot);
};
