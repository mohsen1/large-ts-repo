import type {
  DomainPhase,
  RecoveryRunbook,
  RecoveryScenarioTemplate,
  ScenarioProjection,
  StageNode,
} from './models';
import { buildAdjacency, summarizeTopology } from './graph';
import { withBrand, normalizeLimit } from '@shared/core';

export type PhaseTemplate<T extends string> = `${T}:${string}`;

export type PolicyChain<
  TInput,
  TPolicies extends readonly ((input: TInput) => unknown)[],
> = TPolicies extends readonly []
  ? (input: TInput) => Promise<TInput>
  : TPolicies extends readonly [infer THead, ...infer TTail]
    ? THead extends (input: TInput) => infer TMiddle
      ? (...args: Parameters<THead>) => ReturnType<THead> extends Promise<infer TResult>
        ? (input: TInput) => Promise<Awaited<TResult> | TInput>
        : (input: TInput) => TMiddle
      : never
    : never;

export interface PlannerInput {
  readonly runbook: RecoveryRunbook;
  readonly targetPhases: readonly DomainPhase[];
  readonly tagBudget: number;
}

export interface PlannerOutput {
  readonly planId: ReturnType<typeof withBrand<string, 'PlanId'>>;
  readonly topologyDigest: string;
  readonly projectedHealth: readonly ScenarioProjection[];
  readonly orderedSteps: readonly string[];
  readonly priority: readonly string[];
}

export type PolicyInput<T> = T extends readonly [infer Head, ...infer Rest]
  ? Head & PolicyInput<Rest>
  : {};

export type TemplateToRunbook<TTemplate extends RecoveryScenarioTemplate> = {
  readonly id: string;
  readonly phases: TTemplate['phases'];
  readonly policyCode: TTemplate['policy']['code'];
};

const normalizeNode = (node: StageNode): StageNode => ({
  ...node,
  status: node.status === 'suppressed' ? 'suppressed' : node.status,
  metrics: node.metrics,
});

const rankNode = (node: StageNode): number =>
  Object.values(node.metrics).reduce((acc, metric) => acc + metric, 0) / Math.max(1, Object.keys(node.metrics).length || 1);

const phaseTemplate = <T extends readonly DomainPhase[]>(phases: T): readonly DomainPhase[] =>
  phases.filter((phase): phase is DomainPhase => ['discover', 'stabilize', 'mitigate', 'validate', 'document'].includes(phase));

const projectRunbook = (runbook: RecoveryRunbook): readonly ScenarioProjection[] => {
  const adjacency = buildAdjacency(runbook.edges);
  return runbook.nodes.map((node) => ({
    key: `tenant/${runbook.tenant}/${node.id}` as const,
    active: adjacency[node.id]?.length ?? 0,
    failed: Math.round(rankNode(node)),
    complete: node.status === 'complete' ? 1 : 0,
  }));
};

export const composePlan = (input: PlannerInput): PlannerOutput => {
  const nodes = input.runbook.nodes.map(normalizeNode).toSorted((left, right) => rankNode(right) - rankNode(left));
  const topology = summarizeTopology(input.runbook);
  const phases = phaseTemplate(input.targetPhases);
  const template = nodes.map((node) => `${node.phase}:${node.status}`);

  const budget = normalizeLimit(input.tagBudget);
  const policyWindow = template
    .toSpliced(0, budget)
    .map((entry, index) => ({ rank: index, phase: entry }));

  return {
    planId: withBrand(`${input.runbook.tenant}.${Date.now()}`, 'PlanId'),
    topologyDigest: `${topology.roots.length}-${topology.terminals.length}-${topology.edgeCount}`,
    projectedHealth: projectRunbook(input.runbook),
    orderedSteps: nodes.map((node) => node.id),
    priority: policyWindow.map((entry) => `${entry.rank}:${entry.phase}`),
  };
};

export const normalizeTemplate = <TTemplate extends RecoveryScenarioTemplate>(
  template: TTemplate,
): TemplateToRunbook<TTemplate> => ({
  id: `${template.policy.command}:${template.phases.length}`,
  phases: template.phases,
  policyCode: template.policy.code,
});

export const foldPolicies = <TInput, TPolicies extends readonly unknown[]>(
  input: TInput,
  policies: TPolicies,
): TInput => {
  let state = input;
  for (const entry of policies) {
    if (typeof entry === 'function') {
      state = (entry as (value: TInput) => TInput)(state);
    }
  }
  return state;
};
