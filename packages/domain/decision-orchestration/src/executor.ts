import type { PolicyExecutionGraph } from './graph';
import type { DecisionPolicyTemplate } from '@data/decision-catalog';
import type { DecisionAction, DecisionOutcome, DecisionPlan, TInputTemplate } from './models';

export interface DecisionExecution<TOutput> {
  actions: ReadonlyArray<DecisionAction<TOutput>>;
  graph: PolicyExecutionGraph;
}

export function executeDecision<TInput extends TInputTemplate, TOutput>(
  template: DecisionPolicyTemplate,
  plan: DecisionPlan<TInput, TOutput> | { candidates: readonly any[] },
): DecisionExecution<TOutput> {
  const graph = {
    templateId: template.id,
    executionOrder: template.nodes.map((node) => node.id),
    edges: template.edges,
  } as PolicyExecutionGraph;

  const actions = (plan.candidates as any[]).map((candidate: any, index) => ({
    id: `${template.id}-${index}-${candidate.id ?? 'candidate'}`,
    type: candidate.output?.actionType ?? 'allow',
    actor: template.nodes[index % template.nodes.length]?.actor ?? 'system',
    context: candidate.output as TOutput,
    weight: candidate.score ?? 0,
  })) as ReadonlyArray<DecisionAction<TOutput>>;

  return { actions, graph };
}
