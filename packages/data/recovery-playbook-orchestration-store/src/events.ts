import type {
  DriftSignal,
  OrchestrationPlan,
  OrchestrationOutcome,
  PolicyViolation,
} from '@domain/recovery-playbook-orchestration';

export type PlaybookEvent =
  | {
      type: 'plan:created';
      tenantId: string;
      workspaceId: string;
      plan: OrchestrationPlan;
      createdBy: string;
    }
  | {
      type: 'plan:run.completed';
      tenantId: string;
      workspaceId: string;
      outcome: OrchestrationOutcome;
      signals: readonly DriftSignal[];
    }
  | {
      type: 'plan:policy.violation';
      tenantId: string;
      workspaceId: string;
      violations: readonly PolicyViolation[];
    }
  | {
      type: 'plan:archived';
      tenantId: string;
      workspaceId: string;
      reason: string;
    };

export const classifyEvent = (event: PlaybookEvent): string => {
  switch (event.type) {
    case 'plan:created':
      return `created ${event.plan.id} by ${event.createdBy}`;
    case 'plan:run.completed':
      return `completed ${event.outcome.planId} with score ${event.outcome.telemetrySnapshot.scores.green}`;
    case 'plan:policy.violation':
      return `violation count ${event.violations.length}`;
    case 'plan:archived':
      return `archived: ${event.reason}`;
    default:
      return 'unknown';
  }
};
