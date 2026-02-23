import type { ReadinessRun, PlaybookSignal, ReadinessPriority, PlaybookDefinition, ReadinessStepExecution } from './playbook-models';

export type PlaybookLifecycle = 'created' | 'scheduled' | 'started' | 'blocked' | 'blocked-resolved' | 'completed' | 'canceled';

type PlaybookEventActor = 'automated' | 'operator' | 'system';

export interface BaseReadinessEvent {
  eventId: string;
  occurredAt: string;
  runId: string;
  playbookId: string;
}

export interface PlaybookLifecycleEvent extends BaseReadinessEvent {
  type: 'playbook.lifecycle';
  lifecycle: PlaybookLifecycle;
  actor: PlaybookEventActor;
  reason?: string;
}

export interface PlaybookSignalEvent extends BaseReadinessEvent {
  type: 'playbook.signal';
  signal: PlaybookSignal;
  severity: ReadinessPriority;
}

export interface PlaybookStepEvent extends BaseReadinessEvent {
  type: 'playbook.step';
  stepExecution: ReadinessStepExecution;
  durationMs: number;
}

export interface PlaybookDefinitionEvent extends BaseReadinessEvent {
  type: 'playbook.definition';
  playbook: Pick<PlaybookDefinition, 'id' | 'name' | 'revision' | 'category' | 'priority'>;
  notes?: string;
}

export type ReadinessDomainEvent = PlaybookLifecycleEvent | PlaybookSignalEvent | PlaybookStepEvent | PlaybookDefinitionEvent;

export interface ReadinessEventEnvelope {
  correlationId: string;
  stream: 'readiness-events';
  payload: ReadinessDomainEvent;
  metadata?: Record<string, string>;
}

export const createLifecycleEvent = (input: {
  eventId: string;
  run: ReadinessRun;
  lifecycle: PlaybookLifecycle;
  actor: PlaybookEventActor;
  reason?: string;
}): PlaybookLifecycleEvent => ({
  type: 'playbook.lifecycle',
  eventId: input.eventId,
  occurredAt: new Date().toISOString(),
  runId: input.run.id,
  playbookId: input.run.playbookId,
  lifecycle: input.lifecycle,
  actor: input.actor,
  reason: input.reason,
});

export const createSignalEvent = (input: {
  eventId: string;
  runId: string;
  playbookId: string;
  signal: PlaybookSignal;
  severity: ReadinessPriority;
}): PlaybookSignalEvent => ({
  type: 'playbook.signal',
  eventId: input.eventId,
  occurredAt: new Date().toISOString(),
  runId: input.runId,
  playbookId: input.playbookId,
  signal: input.signal,
  severity: input.severity,
});

export const createStepEvent = (input: {
  eventId: string;
  runId: string;
  playbookId: string;
  stepExecution: ReadinessStepExecution;
  durationMs: number;
}): PlaybookStepEvent => ({
  type: 'playbook.step',
  eventId: input.eventId,
  occurredAt: new Date().toISOString(),
  runId: input.runId,
  playbookId: input.playbookId,
  stepExecution: input.stepExecution,
  durationMs: input.durationMs,
});

export const createPlaybookDefinitionEvent = (input: {
  eventId: string;
  playbook: Pick<PlaybookDefinition, 'id' | 'name' | 'revision' | 'category' | 'priority'>;
  runId: string;
  notes?: string;
}): PlaybookDefinitionEvent => ({
  type: 'playbook.definition',
  eventId: input.eventId,
  occurredAt: new Date().toISOString(),
  runId: input.runId,
  playbookId: input.playbook.id,
  playbook: input.playbook,
  notes: input.notes,
});

export const toEventEnvelope = (payload: ReadinessDomainEvent, correlationId: string): ReadinessEventEnvelope => ({
  correlationId,
  stream: 'readiness-events',
  payload,
  metadata: {
    createdAt: new Date().toISOString(),
    source: 'recovery-readiness-domain',
    eventType: payload.type,
  },
});

export const isLifecycleEvent = (event: ReadinessDomainEvent): event is PlaybookLifecycleEvent => event.type === 'playbook.lifecycle';
export const isSignalEvent = (event: ReadinessDomainEvent): event is PlaybookSignalEvent => event.type === 'playbook.signal';
export const isStepEvent = (event: ReadinessDomainEvent): event is PlaybookStepEvent => event.type === 'playbook.step';

export const priorityRank: Record<ReadinessPriority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

export const sortEventsByPriority = (events: ReadinessDomainEvent[]): ReadinessDomainEvent[] => {
  const sorted = [...events];
  sorted.sort((left, right) => {
    if (left.type === 'playbook.signal' && right.type === 'playbook.signal') {
      return priorityRank[right.severity] - priorityRank[left.severity];
    }
    if (left.type === 'playbook.signal') return -1;
    if (right.type === 'playbook.signal') return 1;
    return 0;
  });
  return sorted;
};
