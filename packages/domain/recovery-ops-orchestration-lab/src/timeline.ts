import type { OrchestrationLab, TimelineEvent } from './types';
import type { JsonValue } from '@shared/type-level';

export const collectTimelineEvents = (lab: OrchestrationLab): readonly TimelineEvent[] => {
  const signalEvents = lab.signals.map((signal) => ({
    id: signal.id as TimelineEvent['id'],
    labId: lab.id,
    kind: 'signal' as const,
    timestamp: signal.createdAt,
    actor: signal.source,
    detail: signal.message,
    metadata: {
      score: signal.score,
      tier: signal.tier,
      message: signal.title,
    } as Record<string, JsonValue>,
  }));

  const planEvents = lab.plans.flatMap((plan) => [
    {
      id: `${plan.id}:created` as TimelineEvent['id'],
      labId: lab.id,
      kind: 'plan' as const,
      timestamp: plan.createdAt,
      actor: plan.steps[0]?.owner ?? 'planner',
      detail: `plan ${plan.id} prepared`,
      metadata: {
        score: plan.score,
        confidence: plan.confidence,
      } as Record<string, JsonValue>,
    },
    {
      id: `${plan.id}:updated` as TimelineEvent['id'],
      labId: lab.id,
      kind: 'decision' as const,
      timestamp: plan.updatedAt,
      actor: 'policy-check',
      detail: `plan ${plan.id} updated`,
      metadata: {
        state: plan.state,
        stepCount: plan.steps.length,
      } as Record<string, JsonValue>,
    },
  ]);

  return [...signalEvents, ...planEvents].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
};

export const latestEvent = (events: readonly TimelineEvent[]): TimelineEvent | undefined =>
  events.slice().sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];

export const buildSegments = (events: readonly TimelineEvent[]): readonly { from: string; to: string; label: string; steps: readonly string[]; health: number }[] => {
  const sorted = [...events].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const segments: { from: string; to: string; label: string; steps: readonly string[]; health: number }[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (!next) {
      break;
    }

    const from = current.timestamp;
    const to = next.timestamp;
    const label = `${current.kind} => ${next.kind}`;
    const score = Number(current.metadata.score ?? 0);

    segments.push({
      from,
      to,
      label,
      steps: [current.id, next.id],
      health: Math.min(100, Math.max(0, 100 - score)),
    });
  }

  return segments;
};
