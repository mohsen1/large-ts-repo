import { useMemo } from 'react';
import {
  asCommandPolicyId,
  CommandNamespace,
  CommandPlan,
  CommandPolicy,
  CommandPolicyConstraint,
} from '@domain/streaming-command-intelligence';

interface PolicyFlowNode {
  readonly id: string;
  readonly label: string;
  readonly namespace: CommandNamespace;
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly constraints: readonly CommandPolicyConstraint[];
}

interface CommandIntelligencePolicyFlowProps {
  readonly plan: CommandPlan;
  readonly policy: CommandPolicy;
  readonly onAction: (nodeId: string, action: 'toggle' | 'reseed') => void;
}

const toConstraintSeed = (plan: CommandPlan, pluginIndex: number, index: number): CommandPolicyConstraint => {
  const policyId =
    plan.config && typeof plan.config === 'object' && 'policyId' in plan.config
      ? asCommandPolicyId(String(plan.config.policyId))
      : asCommandPolicyId(`${plan.planId}-${pluginIndex}`);

  return {
    policyId,
    namespace: plan.plugins[index].namespace,
    required: index % 2 === 0,
    payload: {
      order: index,
      policy: plan.name,
      namespacePolicy: plan.config?.['policy'],
    },
    weight: index + 1,
    severity: index >= 3 ? 'aggressive' : index >= 1 ? 'normal' : 'minimal',
  };
};

const buildFlow = (plan: CommandPlan): readonly PolicyFlowNode[] =>
  plan.plugins.map((plugin, index) => ({
    id: plugin.stepId,
    label: plugin.name,
    namespace: plugin.namespace,
    severity: (((index % 5) + 1) as 1 | 2 | 3 | 4 | 5),
    constraints: [toConstraintSeed(plan, index, index)],
  }));

const classifyTag = (severity: PolicyFlowNode['severity']): string =>
  severity >= 4 ? 'critical' : severity >= 3 ? 'major' : 'minor';

const groupByNamespace = (steps: readonly PolicyFlowNode[]): Readonly<Record<string, readonly PolicyFlowNode[]>> => {
  return steps.reduce<Record<string, PolicyFlowNode[]>>((acc, step) => {
    const bucket = acc[step.namespace] ?? [];
    acc[step.namespace] = [...bucket, step];
    return acc;
  }, {});
};

const buildConstraintSummary = (constraints: readonly CommandPolicyConstraint[]): string =>
  constraints
    .map((constraint) => `${constraint.namespace}/${constraint.required ? 'required' : 'optional'}:${constraint.severity}`)
    .join(', ');

export const CommandIntelligencePolicyFlow = ({
  plan,
  policy,
  onAction,
}: CommandIntelligencePolicyFlowProps) => {
  const steps = useMemo(() => buildFlow(plan), [plan]);
  const namespaceSummary = useMemo(() => groupByNamespace(steps), [steps]);

  return (
    <section>
      <h2>Policy Flow</h2>
      <p>Policy: {policy.name}</p>
      <p>Priority: {policy.priority}</p>
      <p>Allowed namespaces: {policy.allowedNamespaces.join(', ')}</p>
      <div>
        <strong>Allowed tags</strong>
        <ul>
          {policy.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </div>
      <div>
        <strong>Namespace map</strong>
        <ul>
          {Object.entries(namespaceSummary).map(([namespace, values]) => (
            <li key={namespace}>
              {namespace}: {values.length}
            </li>
          ))}
        </ul>
      </div>
      <div>
        {steps.map((step) => (
          <div key={step.id} style={{ marginBottom: 8 }}>
            <button type="button" onClick={() => onAction(step.id, 'toggle')}>
              toggle
            </button>
            <button type="button" onClick={() => onAction(step.id, 'reseed')}>
              reseed
            </button>
            <span>{step.label}</span>
            <span> [{step.namespace}]</span>
            <span> {classifyTag(step.severity)}</span>
            <span> constraints: {buildConstraintSummary(step.constraints)}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
