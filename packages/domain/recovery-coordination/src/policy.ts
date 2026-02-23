import { clamp } from './constraints';
import { asCorrelation, asTenant, asRun, asProgramId } from './schema';
import type {
  CoordinationConstraint,
  CoordinationPlanCandidate,
  CoordinationSelectionResult,
  CoordinationWindow,
} from './types';

export interface ConstraintPolicy {
  readonly id: string;
  readonly maxWindowMinutes: number;
  readonly minResilience: number;
  readonly blockedScopes: readonly CoordinationConstraint['scope'][];
}

export interface SelectionPolicy {
  readonly id: string;
  readonly minimumConfidence: number;
  readonly allowDeferred: boolean;
}

export interface WindowPolicy extends ConstraintPolicy {
  readonly windows: readonly CoordinationWindow[];
}

export const createPolicy = (
  tenant: string,
  runId: string,
  constraints: readonly CoordinationConstraint[],
): CoordinationSelectionResult => {
  const windowPolicy = windowPolicyFromConstraints(constraints);
  const selectionPolicy = selectionPolicyFromConstraints(constraints);

  const safeRun = asRun(runId);
  const safeTenant = asTenant(tenant);
  const safeProgramId = asProgramId(`${tenant}:${runId}`);

  if (!windowPolicy.windows.length || !safeRun || !safeTenant) {
    return {
      runId: safeRun,
      selectedCandidate: normalizeCandidate({
        id: 'policy-fallback',
        runId: safeRun,
        tenant: safeTenant,
        programId: safeProgramId,
        steps: [],
        sequence: [],
        metadata: {
          parallelism: 1,
          expectedCompletionMinutes: 30,
          riskIndex: 0,
          resilienceScore: 0,
        },
        createdBy: tenant,
        createdAt: new Date().toISOString(),
        correlationId: asCorrelation(`${safeTenant}:${runId}`),
      }),
      alternatives: [],
      decision: 'deferred',
      blockedConstraints: [],
      reasons: ['policy-window-empty'],
      selectedAt: new Date().toISOString(),
    };
  }

  const selectedCandidate: CoordinationPlanCandidate = {
    id: `${tenant}:candidate`,
    correlationId: asCorrelation(`${tenant}:${runId}`),
    programId: safeProgramId,
    runId: safeRun,
    tenant: safeTenant,
    steps: [],
    sequence: [],
    metadata: {
      parallelism: Math.min(4, constraints.length + 1),
      expectedCompletionMinutes: windowPolicy.maxWindowMinutes,
      riskIndex: clamp(constraints.length / 10, 0, 1),
      resilienceScore: Math.max(0, 1 - clamp(constraints.length / 25, 0, 1)),
    },
    createdBy: tenant,
    createdAt: new Date().toISOString(),
  };

  return {
    runId: safeRun,
    selectedCandidate,
    alternatives: [],
    decision: constraints.length === 0 || selectionPolicy.allowDeferred ? 'deferred' : 'approved',
    blockedConstraints: constraints
      .filter((constraint) => windowPolicy.blockedScopes.includes(constraint.scope))
      .map((constraint) => constraint.id),
    reasons: [
      `selectionPolicy:${selectionPolicy.id}`,
      `minimumConfidence:${selectionPolicy.minimumConfidence}`,
      `minResilience:${windowPolicy.minResilience}`,
    ],
    selectedAt: new Date().toISOString(),
  };
};

export const windowPolicyFromConstraints = (constraints: readonly CoordinationConstraint[]): WindowPolicy => {
  const windows = constraints
    .filter((constraint) => constraint.affectedStepIds.length > 0)
    .map((constraint) => ({
      from: new Date().toISOString(),
      to: new Date(Date.now() + Math.max(1, constraint.weight) * 3600_000).toISOString(),
      timezone: 'UTC',
    }));

  return {
    id: 'coord-window-policy',
    maxWindowMinutes: Math.max(15, windows.length * 10),
    minResilience: Math.max(0.2, 1 - constraints.length / 12),
    blockedScopes: constraints
      .filter((constraint) => constraint.weight > 0.75)
      .map((constraint) => constraint.scope),
    windows,
  };
};

export const selectionPolicyFromConstraints = (constraints: readonly CoordinationConstraint[]): SelectionPolicy => {
  const minConfidence = Math.min(1, 0.6 + constraints.length * 0.03);
  return {
    id: `selection:${constraints.length}`,
    minimumConfidence: minConfidence,
    allowDeferred: constraints.every((constraint) => constraint.weight < 0.95),
  };
};

export const defaultWindowPolicy = (runWindow: CoordinationWindow): CoordinationWindow => ({
  from: runWindow.from,
  to: new Date(Date.parse(runWindow.to) + 15 * 60_000).toISOString(),
  timezone: runWindow.timezone || 'UTC',
});

export const enforceWindowPolicy = (window: CoordinationWindow, policy: WindowPolicy): boolean => {
  const policySpan = (Date.parse(policy.windows[0]?.to ?? window.to) - Date.parse(policy.windows[0]?.from ?? window.from));
  const proposedSpan = Date.parse(window.to) - Date.parse(window.from);
  return policySpan >= proposedSpan && policy.maxWindowMinutes > 0;
};

export const resolvePolicyConstraintWindow = (
  constraints: readonly CoordinationConstraint[],
  window: CoordinationWindow,
): readonly CoordinationConstraint[] => constraints.filter((constraint) => {
  const windowMs = Date.parse(window.to) - Date.parse(window.from);
  return constraint.weight <= 1 && Number.isFinite(windowMs) && windowMs >= 0;
});

const normalizeCandidate = (candidate: CoordinationPlanCandidate): CoordinationPlanCandidate => ({
  ...candidate,
  correlationId: asCorrelation(`${candidate.runId}:normal`),
});
