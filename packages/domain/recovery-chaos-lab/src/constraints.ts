import type { ActionKind, ChaosMetricWindowUnit, ChaosStatus, ChaosTag, PluginName, ScenarioStep } from './types';

export interface ConstraintContext {
  readonly namespace: string;
  readonly scenarioId: string;
  readonly requestedBy: string;
}

export interface ConstraintResult {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

export type ConstraintRule<TContext extends ConstraintContext> = {
  readonly name: string;
  readonly match: (context: TContext) => boolean;
  readonly apply: (context: TContext) => ConstraintResult;
};

export type ActionConstraint = {
  readonly action: ActionKind;
  readonly allowedStatuses: readonly ChaosStatus[];
  readonly maxRetries?: number;
  readonly window?: {
    amount: number;
    unit: ChaosMetricWindowUnit;
  };
};

export type StepConstraint = {
  readonly plugin: PluginName;
  readonly dependencies: readonly ActionKind[];
  readonly tags: readonly ChaosTag[];
};

export interface ConstraintSpec {
  readonly stepRules: readonly StepConstraint[];
  readonly actionRules: readonly ActionConstraint[];
}

export const defaultActionRules: readonly ActionConstraint[] = [
  {
    action: 'latency',
    allowedStatuses: ['arming', 'active', 'verified', 'healing'],
    maxRetries: 4,
    window: { amount: 5, unit: 'm' }
  },
  {
    action: 'packet-loss',
    allowedStatuses: ['active', 'verified', 'healing'],
    maxRetries: 2,
    window: { amount: 2, unit: 'm' }
  },
  {
    action: 'throttle',
    allowedStatuses: ['arming', 'active', 'verified'],
    maxRetries: 3,
    window: { amount: 8, unit: 'm' }
  },
  {
    action: 'node-drain',
    allowedStatuses: ['active', 'verified'],
    maxRetries: 1,
    window: { amount: 1, unit: 'h' }
  },
  {
    action: 'chaos-stop',
    allowedStatuses: ['complete', 'failed', 'healing'],
    maxRetries: 6
  }
];

export const defaultConstraints: ConstraintSpec = {
  stepRules: [
    {
      plugin: 'net-guard' as PluginName,
      dependencies: ['latency', 'packet-loss'],
      tags: ['control:active', 'control:verified']
    },
    {
      plugin: 'mesh-guard' as PluginName,
      dependencies: ['throttle', 'node-drain'],
      tags: ['targeted:active', 'targeted:verified']
    }
  ],
  actionRules: defaultActionRules
};

export function validateStepRules(
  step: ScenarioStep<string, unknown>,
  spec: ConstraintSpec
): ConstraintResult {
  const issues: string[] = [];
  for (const rule of spec.stepRules) {
    if (step.key.includes(rule.plugin as string)) {
      for (const dep of rule.dependencies) {
        if (!step.key.includes(dep)) {
          issues.push(`Step ${step.key} missing dependency hint for ${dep}`);
        }
      }
    }
  }
  return { allowed: issues.length === 0, reasons: issues };
}

export function resolveActionRule(
  action: ActionKind,
  spec: ConstraintSpec
): ActionConstraint | undefined {
  return spec.actionRules.find((rule) => rule.action === action);
}

export function validateStepAction(
  action: ActionKind,
  status: ChaosStatus,
  spec: ConstraintSpec
): ConstraintResult {
  const rule = resolveActionRule(action, spec);
  const reasons: string[] = [];
  if (!rule) {
    reasons.push(`Action ${action} has no matching policy`);
    return { allowed: false, reasons };
  }
  if (!rule.allowedStatuses.includes(status)) {
    reasons.push(`Status ${status} is not allowed for action ${action}`);
  }
  return { allowed: reasons.length === 0, reasons };
}
