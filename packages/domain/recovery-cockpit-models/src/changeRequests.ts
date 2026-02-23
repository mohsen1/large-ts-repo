import { toTimestamp, EntityRef, PlanId, EntityId, nextEntityId } from './identifiers';
import { RecoveryPlan, RecoveryAction } from './runtime';

export type ChangeRequestState = 'draft' | 'review' | 'approved' | 'deployed' | 'rejected' | 'archived';
export type ChangeType = 'add-action' | 'remove-action' | 'replace-action' | 'update-plan';

export type ChangeRequestId = `${string}:cr:${string}`;
export type ChangeSetId = `cs:${number}`;

export type ChangeDiff<T> = {
  readonly path: string;
  readonly before: T;
  readonly after: T;
};

export type ActionDelta = {
  readonly actionId: EntityId;
  readonly type: ChangeType;
  readonly message: string;
  readonly createdAt: string;
  readonly changes: ChangeDiff<RecoveryAction>;
};

export type RunbookChangeRequest = {
  readonly requestId: ChangeRequestId;
  readonly changeSetId: ChangeSetId;
  readonly planId: PlanId;
  readonly title: string;
  readonly owner: EntityRef<'engineer'>;
  readonly createdAt: string;
  readonly state: ChangeRequestState;
  readonly diffs: readonly ActionDelta[];
  readonly approvals: readonly ReviewDecision[];
  readonly reason: string;
  readonly tags: readonly string[];
};

export type ReviewDecision = {
  readonly by: EntityRef<'operator'>;
  readonly decision: 'approve' | 'reject';
  readonly comment: string;
  readonly decidedAt: string;
};

export type ChangeRequestAuditEntry = {
  readonly requestId: ChangeRequestId;
  readonly at: string;
  readonly state: ChangeRequestState;
  readonly actor: EntityRef<'operator'>;
  readonly note: string;
};

export type ChangeRequestTimeline = {
  readonly requestId: ChangeRequestId;
  readonly events: readonly ChangeRequestAuditEntry[];
  readonly currentState: ChangeRequestState;
};

const isTerminalState = (state: ChangeRequestState): boolean =>
  state === 'deployed' || state === 'rejected' || state === 'archived';

const normalizeState = (state: ChangeRequestState): ChangeRequestState => {
  if (state === 'draft' || state === 'review' || state === 'approved' || state === 'deployed' || state === 'rejected' || state === 'archived') {
    return state;
  }
  return 'draft';
};

export const createChangeRequestId = (planId: PlanId): ChangeRequestId => `${planId}:cr:${Math.random().toString(36).slice(2)}` as ChangeRequestId;
export const createChangeSetId = (): ChangeSetId => `cs:${Date.now()}` as ChangeSetId;

export const computeApprovalRatio = (approvals: readonly ReviewDecision[]): number => {
  if (approvals.length === 0) {
    return 0;
  }
  const approved = approvals.filter((approval) => approval.decision === 'approve').length;
  return Number(((approved / approvals.length) * 100).toFixed(2));
};

export const summarizeChangeRequest = (request: RunbookChangeRequest): {
  readonly requestId: ChangeRequestId;
  readonly planId: PlanId;
  readonly state: ChangeRequestState;
  readonly risk: 'low' | 'medium' | 'high';
  readonly approvalRate: number;
  readonly summary: string;
} => {
  const approvalRate = computeApprovalRatio(request.approvals);
  const risk: 'low' | 'medium' | 'high' =
    approvalRate > 75 && request.state !== 'draft' ? 'low' : approvalRate > 40 ? 'medium' : 'high';

  return {
    requestId: request.requestId,
    planId: request.planId,
    state: request.state,
    risk,
    approvalRate,
    summary: `${request.title} (${request.diffs.length} diffs)`,
  };
};

export const proposePlanChangeRequest = (
  plan: RecoveryPlan,
  owner: EntityRef<'engineer'>,
  title: string,
  reason: string,
  diffs: readonly ActionDelta[],
): RunbookChangeRequest => ({
  requestId: createChangeRequestId(plan.planId),
  changeSetId: createChangeSetId(),
  planId: plan.planId,
  title,
  owner,
  createdAt: toTimestamp(new Date()),
  state: 'draft',
  diffs,
  approvals: [],
  reason,
  tags: [...new Set([`owner:${owner.id}`, 'recovery'])],
});

export const transitionChangeRequestState = (
  request: RunbookChangeRequest,
  state: ChangeRequestState,
  actor: EntityRef<'operator'>,
): ChangeRequestTimeline => {
  const current = normalizeState(request.state);
  const normalizedNext = normalizeState(state);
  if (isTerminalState(current) && current !== normalizedNext) {
    return {
      requestId: request.requestId,
      currentState: current,
      events: [
        {
          requestId: request.requestId,
          at: toTimestamp(new Date()),
          state: current,
          actor,
          note: `blocked-transition:${current}->${normalizedNext}`,
        },
      ],
    };
  }

  const event: ChangeRequestAuditEntry = {
    requestId: request.requestId,
    at: toTimestamp(new Date()),
    state: normalizedNext,
    actor,
    note: `state-transition:${current}->${normalizedNext}`,
  };

  return {
    requestId: request.requestId,
    currentState: normalizedNext,
    events: [event],
  };
};

export const buildDiffFromActions = (
  before: readonly RecoveryAction[],
  after: readonly RecoveryAction[],
): readonly ActionDelta[] => {
  const beforeById = new Map(before.map((action) => [action.id, action] as const));
  const afterById = new Map(after.map((action) => [action.id, action] as const));
  const deltas: ActionDelta[] = [];

  for (const [actionId] of beforeById.entries()) {
    if (!afterById.has(actionId)) {
      deltas.push({
        actionId,
        type: 'remove-action',
        message: `remove action ${actionId}`,
        createdAt: toTimestamp(new Date()),
        changes: {
          path: `actions.${actionId}`,
          before: beforeById.get(actionId)!,
          after: beforeById.get(actionId)!,
        },
      });
    }
  }

  for (const [actionId, action] of afterById.entries()) {
    const existing = beforeById.get(actionId);
    if (!existing) {
      deltas.push({
        actionId,
        type: 'add-action',
        message: `add action ${actionId}`,
        createdAt: toTimestamp(new Date()),
        changes: {
          path: `actions.${actionId}`,
          before: action,
          after: action,
        },
      });
      continue;
    }

    if (JSON.stringify(existing) !== JSON.stringify(action)) {
      deltas.push({
        actionId,
        type: 'update-plan',
        message: `update action ${actionId}`,
        createdAt: toTimestamp(new Date()),
        changes: {
          path: `actions.${actionId}`,
          before: existing,
          after: action,
        },
      });
    }
  }

  return deltas;
};

export const nextRequestActionId = (): EntityId => nextEntityId(`change-${Date.now()}`);
