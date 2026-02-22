import { DecisionPolicyTemplate, PolicyNode } from '@data/decision-catalog';
import { DecisionIntent } from './models';

export interface PolicyCandidate {
  node: PolicyNode;
  weight: number;
}

export interface PolicyCandidateFactory {
  (template: DecisionPolicyTemplate, intent: DecisionIntent): PolicyCandidate[];
}

export const defaultPolicyCandidateFactory: PolicyCandidateFactory = (template) =>
  template.nodes.map((node) => ({
    node,
    weight: node.conditions.length + node.severity.length,
  }));

export const loadPolicyCandidates = (candidates: PolicyCandidate[]) =>
  candidates.map(({ node, weight }, index) => ({
    id: node.id,
    score: weight + index,
    output: {
      actionType: node.actions[0]?.kind ?? 'allow',
      details: node.actions,
      nodeId: node.id,
    },
  }));

export function evaluateConditions(context: Record<string, unknown>, node: PolicyNode): boolean {
  return node.conditions.length === 0 || node.conditions.every((condition) => {
    const value = context[condition.field];
    return typeof value === 'string' && typeof condition.value === 'string'
      ? value === condition.value
      : value !== undefined;
  });
}
