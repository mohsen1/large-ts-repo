import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import type {
  MeshPayloadFor,
  MeshPlanId,
  MeshRunId,
  MeshSignalKind,
  MeshTopology,
} from '../types';
import type { MeshObservabilityAlert, TopologyHealthProfile } from './metrics';

export type PolicyBlueprintId = Brand<string, 'mesh-policy-blueprint'>;
export type PolicyNodeId<T extends string = string> = Brand<string, `mesh-policy-node:${T}`>;
export type PolicyBlueprintPhase = 'ingest' | 'normalize' | 'evaluate' | 'react' | 'emit';

export type RoutedSignalKind<TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]> = TSignals[number];
export type PolicyRouteKey<TKind extends MeshSignalKind = MeshSignalKind> = `policy.${TKind}`;

export type SignalProfileByKind<
  TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[],
> = {
  [Kind in TSignals[number] as Kind & string]: {
    readonly kind: Kind;
    readonly route: `policy.${Kind}`;
  };
};

export interface PolicyEvaluationContext {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly topology: MeshTopology;
  readonly startedAt: number;
  readonly profile: TopologyHealthProfile;
  readonly trace: readonly string[];
}

export interface PolicyRuleInput<TKind extends MeshSignalKind = MeshSignalKind> {
  readonly kind: TKind;
  readonly signal: MeshPayloadFor<TKind>;
  readonly trace: `signal.${TKind}.${string}`;
}

export interface PolicyRuleOutput<TKind extends MeshSignalKind = MeshSignalKind> {
  readonly accepted: boolean;
  readonly kind: TKind;
  readonly score: number;
  readonly alerts: readonly MeshObservabilityAlert[];
  readonly path: readonly string[];
}

export type PolicyRule<TKind extends MeshSignalKind = MeshSignalKind> = (
  input: PolicyRuleInput<TKind>,
  context: PolicyEvaluationContext,
) => Promise<PolicyRuleOutput<TKind>> | PolicyRuleOutput<TKind>;

export interface PolicyBlueprintNode<TKind extends MeshSignalKind = MeshSignalKind> {
  readonly id: PolicyNodeId<TKind>;
  readonly phase: PolicyBlueprintPhase;
  readonly supports: readonly TKind[];
  readonly score: number;
  readonly version: `${number}.${number}.${number}`;
  readonly rule: PolicyRule<TKind>;
}

export interface PolicyBlueprintEdge<TFrom extends string = string, TTo extends string = string> {
  readonly from: PolicyNodeId<TFrom>;
  readonly to: PolicyNodeId<TTo>;
  readonly latencyMs: number;
  readonly label: `edge.${string}`;
}

export type PolicyBlueprintTuple<
  TNodes extends readonly PolicyBlueprintNode[],
> = TNodes extends readonly [infer Head, ...infer Rest]
  ? Head extends PolicyBlueprintNode
    ? Rest extends readonly PolicyBlueprintNode[]
      ? readonly [Head, ...PolicyBlueprintTuple<Rest>]
      : readonly [Head]
    : readonly []
  : readonly [];

export type PolicyNodeByPhase<TNodes extends readonly PolicyBlueprintNode[]> = {
  [Node in TNodes[number] as Node['phase']]: Extract<TNodes[number], { phase: Node['phase'] }>;
};

export type PolicyNodeBySignal<TNodes extends readonly PolicyBlueprintNode[]> = {
  [Node in TNodes[number] as Node['id']]: Node['supports'][number] extends MeshSignalKind ? Node : never;
};

export interface PolicyBlueprint<TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]> {
  readonly id: PolicyBlueprintId;
  readonly namespace: `mesh-policy:${string}`;
  readonly plan: MeshTopology;
  readonly version: `${number}.${number}.${number}`;
  readonly signals: NoInfer<TSignals>;
  readonly supportMap: SignalProfileByKind<TSignals>;
  readonly nodes: PolicyBlueprintTuple<readonly PolicyBlueprintNode[]>;
  readonly nodesByPhase: PolicyNodeByPhase<readonly PolicyBlueprintNode[]>;
  readonly edges: readonly PolicyBlueprintEdge[];
}

const signalWeight = {
  pulse: 1,
  snapshot: 2,
  alert: 4,
  telemetry: 1,
} as const satisfies Record<MeshSignalKind, number>;

const blueprintVersion = '1.0.0' as const;

export const emptySupportMap = <TSignals extends readonly MeshSignalKind[]>(
  signals: TSignals,
): SignalProfileByKind<TSignals> => {
  const out: Record<string, { kind: MeshSignalKind; route: string }> = {};
  for (const signal of signals) {
    out[signal as string] = {
      kind: signal,
      route: `policy.${signal}`,
    };
  }

  return out as SignalProfileByKind<TSignals>;
};

export const createPolicyNode = <TKind extends MeshSignalKind>(
  phase: PolicyBlueprintPhase,
  supports: readonly TKind[],
  score: number,
  rule: PolicyRule<TKind>,
): PolicyBlueprintNode<TKind> => ({
  id: withBrand(
    `${phase}-${randomUUID()}-${[...supports].sort().join('.')}`,
    `mesh-policy-node:${phase}`,
  ) as unknown as PolicyNodeId<TKind>,
  phase,
  supports,
  score,
  version: blueprintVersion,
  rule,
});

const supportsKind = <TNode extends PolicyBlueprintNode>(
  node: TNode,
  signal: MeshSignalKind,
): signal is TNode['supports'][number] => node.supports.includes(signal);

export const runPolicyNode = async <TSignal extends MeshSignalKind>(
  node: PolicyBlueprintNode<TSignal>,
  signal: MeshPayloadFor<TSignal>,
  context: PolicyEvaluationContext,
): Promise<PolicyRuleOutput<TSignal>> => {
  if (!node.supports.includes(signal.kind)) {
    return {
      accepted: false,
      kind: signal.kind,
      score: 0,
      alerts: [],
      path: [...context.trace, `${context.runId}`, node.id, 'skipped'],
    };
  }

  const signalIndex = context.trace.length.toString().padStart(3, '0');
  const result = await node.rule(
    {
      kind: signal.kind,
      signal,
      trace: `signal.${signal.kind}.${signalIndex}`,
    },
    context,
  );

  return {
    ...result,
    path: [...result.path, node.id, `phase:${node.phase}`],
  };
};

export const createBlueprint = <const TSignals extends readonly MeshSignalKind[]>(
  plan: MeshTopology,
  signals: NoInfer<TSignals>,
  nodes: readonly PolicyBlueprintNode<TSignals[number]>[],
  edges: readonly PolicyBlueprintEdge[] = [],
): PolicyBlueprint<TSignals> => {
  const supportMap = emptySupportMap(signals);
  const nodesByPhase = nodes.reduce((acc, node) => {
    const key = node.phase;
    const existing = acc[key] as readonly PolicyBlueprintNode[] | undefined;
    return {
      ...acc,
      [key]: existing ? [...existing, node] : [node],
    };
  }, {} as Record<PolicyBlueprintPhase, readonly PolicyBlueprintNode[]>);

  const blueprint = {
    id: withBrand(`blueprint-${plan.id}-${randomUUID()}`, 'mesh-policy-blueprint'),
    namespace: `mesh-policy:${plan.id}` as const,
    plan,
    version: blueprintVersion,
    signals,
    supportMap,
    nodes: nodes as unknown as PolicyBlueprintTuple<readonly PolicyBlueprintNode<TSignals[number]>[]>,
    nodesByPhase: nodesByPhase as unknown as PolicyNodeByPhase<readonly PolicyBlueprintNode<TSignals[number]>[]>,
    edges,
  };

  return blueprint;
};

export const blueprintFingerprint = <TNodes extends readonly PolicyBlueprintNode[]>(nodes: PolicyBlueprintTuple<TNodes>): string =>
  nodes.map((node) => `${node.phase}:${node.score}`).join('|');

export const routeNodesForKind = <TNodes extends readonly PolicyBlueprintNode[], TSignal extends MeshSignalKind>(
  nodes: TNodes,
  signal: TSignal,
): readonly TNodes[number][] =>
  nodes.filter((node): node is TNodes[number] => node.supports.includes(signal));

export const signalWeights = <TSignals extends readonly MeshSignalKind[]>(
  signals: TSignals,
): { [K in TSignals[number]]: number } =>
  signals.reduce((acc, signal) => {
    (acc as Record<MeshSignalKind, number>)[signal] = signalWeight[signal];
    return acc;
  }, {} as { [K in TSignals[number]]: number });
