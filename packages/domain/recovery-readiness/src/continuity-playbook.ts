import type {
  ReadinessDirective,
  RecoveryReadinessPlan,
  RecoveryReadinessPlanDraft,
  RecoveryTargetId,
  ReadinessDirectiveChain,
  ReadinessRunId,
  TimePoint,
} from './types';
import type { ReadinessPolicy } from './policy';

import {
  type DependencyContext,
  type ReadinessDependencyError,
  canExecuteInParallel,
  topologicalExecutionOrder,
} from './dependencies';

import { normalizeWindow, type TimeSpan, detectOverlaps } from './schedules';

export interface PlaybookDirectiveIntent {
  readonly directiveId: ReadinessDirective['directiveId'];
  readonly name: string;
  readonly targetIds: readonly RecoveryTargetId[];
  readonly expectedDurationMinutes: number;
  readonly retries: number;
}

export interface ContinuityPlaybookStep {
  readonly id: ReadinessDirective['directiveId'];
  readonly label: string;
  readonly order: number;
  readonly durationMinutes: number;
  readonly owners: readonly string[];
  readonly prerequisites: readonly string[];
  readonly canParallelize: boolean;
}

export interface ContinuityPlaybook {
  readonly runId: ReadinessRunId;
  readonly name: string;
  readonly policy: ReadinessPolicy['policyId'];
  readonly createdAt: string;
  readonly steps: readonly ContinuityPlaybookStep[];
  readonly constraints: {
    readonly maxRetries: number;
    readonly allowedSources: ReadonlySet<string>;
  };
}

export interface PlanValidationSummary {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface PlaybookWindowSnapshot {
  readonly windowId: string;
  readonly label: string;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly ownerCoverage: number;
}

function directiveIntentId(intent: PlaybookDirectiveIntent): ReadinessDirective['directiveId'] {
  return `intent:${intent.directiveId}` as ReadinessDirective['directiveId'];
}

export function buildPlaybookIntent(
  draft: RecoveryReadinessPlanDraft,
  policy: ReadinessPolicy,
): {
  readonly steps: readonly PlaybookDirectiveIntent[];
  readonly planName: string;
  readonly policyName: string;
} {
  const steps = draft.directiveIds.map((directiveId, index) => ({
    directiveId,
    name: `Directive ${directiveId}`,
    targetIds: draft.targetIds,
    expectedDurationMinutes: Math.max(3, (index + 2) * 4),
    retries: index + 1,
  }));

  return {
    steps,
    planName: `${draft.title}:${draft.owner}`,
    policyName: policy.name,
  };
}

export function expandPlaybook(
  draft: RecoveryReadinessPlanDraft,
  directives: readonly PlaybookDirectiveIntent[],
  policy: ReadinessPolicy,
  candidatePlan: RecoveryReadinessPlan,
): {
  readonly playbook: ContinuityPlaybook;
  readonly directiveChain: ReadinessDirectiveChain<ReadinessDirective>;
} {
  const chain = topologicalExecutionOrder(
    directives.map((directive): ReadinessDirective => ({
      directiveId: directiveIntentId(directive),
      name: directive.name,
      description: `${directive.name} in ${policy.name}`,
      timeoutMinutes: directive.expectedDurationMinutes,
      enabled: true,
      retries: directive.retries,
      dependsOn: directives
        .slice(0, 2)
        .filter((previous, index) => index < directives.indexOf(directive))
        .map((previous): ReadinessDirective => ({
          directiveId: directiveIntentId(previous),
          name: previous.name,
          description: previous.name,
          timeoutMinutes: directive.expectedDurationMinutes,
          enabled: true,
          retries: 1,
          dependsOn: [],
        })),
    })),
  );

  const steps = chain.order.map((directive, index) => ({
    id: directive.directiveId,
    label: directive.name,
    order: index,
    durationMinutes: directive.timeoutMinutes,
    owners: candidatePlan.targets.map((target) => target.ownerTeam),
    prerequisites: directive.dependsOn.map((dependency) => dependency.directiveId),
    canParallelize: candidatePlan.state !== 'suppressed',
  }));

  type AdjacencyMap = { readonly [key in ReadinessDirective['directiveId']]: ReadonlyArray<ReadinessDirective['directiveId']> };
  const adjacency = Object.fromEntries(
    chain.order.map((directive) => [
      directive.directiveId,
      directive.dependsOn.map((dependency) => dependency.directiveId),
    ]),
  ) as unknown as AdjacencyMap;

  return {
    playbook: {
      runId: draft.runId,
      name: `${candidatePlan.title} playbook`,
      policy: policy.policyId,
      createdAt: new Date().toISOString(),
      steps,
      constraints: {
        maxRetries: Math.max(...directives.map((item) => item.retries), 1),
        allowedSources: new Set(policy.blockedSignalSources),
      },
    },
    directiveChain: {
      nodes: chain.order,
      adjacency,
    },
  };
}

export function validatePlaybook(playbook: ContinuityPlaybook, dependencies: ReadonlyArray<ReadinessDirective['directiveId']>): PlanValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (playbook.steps.length === 0) {
    errors.push('playbook-empty');
  }

  const names = new Set(playbook.steps.map((step) => step.id));
  if (names.size !== playbook.steps.length) {
    errors.push('duplicate-step-id');
  }

  for (const step of playbook.steps) {
    if (step.durationMinutes <= 0) {
      errors.push(`non-positive-duration:${step.id}`);
    }
    if (!dependencies.includes(step.id)) {
      warnings.push(`orphan-step:${step.id}`);
    }
    if (step.prerequisites.length > 0 && !step.canParallelize) {
      warnings.push(`linearize-${step.id}`);
    }
  }

  const allowed = [...playbook.constraints.allowedSources];
  if (allowed.length > 8) {
    warnings.push('policy-blocklist-high-cardinality');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function estimatePlaybookWindow(
  plan: RecoveryReadinessPlan,
  spans: readonly TimeSpan[],
): ReadonlyArray<PlaybookWindowSnapshot> {
  const normalized = spans
    .map((span, index) => {
      const normalizedWindow = normalizeWindow({
        owner: `step-${index}`,
        start: new Date(span.from),
        end: new Date(span.to),
        capacity: (span.to - span.from) / (1000 * 60),
      });

      const snapshot: PlaybookWindowSnapshot = {
        windowId: `${plan.runId}:${normalizedWindow.owner}:${index}`,
        label: normalizedWindow.owner,
        startUtc: normalizedWindow.startUtc,
        endUtc: normalizedWindow.endUtc,
        ownerCoverage: normalizedWindow.capacity,
      };
      return snapshot;
    })
    .filter((entry): entry is PlaybookWindowSnapshot => Boolean(entry));

  const overlapping = detectOverlaps(
    normalized.map((entry) => ({
      startUtc: entry.startUtc,
      endUtc: entry.endUtc,
      owner: entry.label,
      capacity: entry.ownerCoverage,
    })),
  ).length;

  if (overlapping > 0) {
    return normalized.map((entry) => ({ ...entry, ownerCoverage: Math.max(0, entry.ownerCoverage - overlapping) }));
  }

  return normalized;
}

export function commandWindowToStepIndex(stepId: string, steps: readonly ContinuityPlaybookStep[]): number {
  const position = steps.findIndex((step) => step.id === stepId);
  return position >= 0 ? position : -1;
}

export function canPlaybookRunInParallel(
  directives: readonly ContinuityPlaybookStep[],
  context: Pick<DependencyContext, 'allowParallelism'>,
): boolean {
  const dependencySteps: ReadinessDirective[] = directives.map((step) => ({
    directiveId: step.id,
    name: step.label,
    description: step.label,
    timeoutMinutes: step.durationMinutes,
    enabled: true,
    retries: step.canParallelize ? 1 : 2,
    dependsOn: step.prerequisites.map((prerequisite): ReadinessDirective => ({
      directiveId: prerequisite as ReadinessDirective['directiveId'],
      name: prerequisite,
      description: prerequisite,
      timeoutMinutes: step.durationMinutes,
      enabled: true,
      retries: 1,
      dependsOn: [] as ReadinessDirective[],
    })),
  }));

  const dummyPlan = {
    planId: 'dummy-playbook',
    runId: 'run:dummy',
    title: 'dummy',
    objective: 'dummy',
    state: 'draft',
    createdAt: new Date().toISOString(),
    targets: [],
    windows: [],
    signals: [],
    riskBand: 'green',
    metadata: {
      owner: 'system',
      tags: ['parallelity'],
      tenant: 'global',
    },
  };

  const edges: DependencyContext['edges'] = dependencySteps.flatMap((step) =>
    step.dependsOn.map((dependency) => ({
      from: dependency.directiveId,
      to: step.directiveId,
    })),
  );

  return canExecuteInParallel(dependencySteps, {
    edges,
    allowParallelism: context.allowParallelism,
  });
}
