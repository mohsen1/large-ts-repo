import { RecoveryIntent } from './intentDefinition';

export type IntentEventType =
  | 'intent-created'
  | 'step-added'
  | 'intent-activated'
  | 'intent-monitoring'
  | 'intent-completed'
  | 'intent-aborted'
  | 'risk-flagged'
  | 'simulation-generated';

export type IntentEvent = Readonly<{
  eventId: string;
  type: IntentEventType;
  at: string;
  intentId: string;
  actor: string;
  message: string;
  payload: Record<string, unknown>;
}>;

export type TimelineStats = Readonly<{
  totalEvents: number;
  byType: Record<IntentEventType, number>;
  spanMinutes: number;
  uniqueActors: number;
}>;

export type IntentTimeline = Readonly<{
  intentId: string;
  events: ReadonlyArray<IntentEvent>;
}>;

const now = () => new Date().toISOString();

const toId = (type: IntentEventType, intentId: string): string => `${type}-${intentId}-${Math.random().toString(36).slice(2, 10)}`;

export const createTimeline = (intentId: string): IntentTimeline => ({ intentId, events: [] });

const createEvent = (
  timeline: IntentTimeline,
  type: IntentEventType,
  actor: string,
  message: string,
  payload: Record<string, unknown>,
): IntentTimeline => ({
  ...timeline,
  events: [
    ...timeline.events,
    {
      eventId: toId(type, timeline.intentId),
      type,
      at: now(),
      intentId: timeline.intentId,
      actor,
      message,
      payload,
    },
  ],
});

export const logIntentCreated = (intent: RecoveryIntent): IntentTimeline =>
  createEvent(
    createTimeline(intent.intentId),
    'intent-created',
    intent.operator,
    `${intent.title} created`,
    { title: intent.title, mode: intent.mode },
  );

export const logIntentStepAdded = (timeline: IntentTimeline, actor: string, key: string): IntentTimeline =>
  createEvent(timeline, 'step-added', actor, `Added step ${key}`, { key });

export const logIntentActivated = (timeline: IntentTimeline, intent: RecoveryIntent): IntentTimeline =>
  createEvent(timeline, 'intent-activated', intent.operator, `Activated with ${intent.steps.length} steps`, { steps: intent.steps.length });

export const logIntentMonitoring = (timeline: IntentTimeline, intent: RecoveryIntent): IntentTimeline =>
  createEvent(timeline, 'intent-monitoring', intent.operator, `Monitoring ${intent.intentId}`, { status: intent.status });

export const logIntentCompleted = (timeline: IntentTimeline, intent: RecoveryIntent): IntentTimeline =>
  createEvent(timeline, 'intent-completed', intent.operator, `Completed at ${intent.completedAt ?? now()}`, { status: intent.status });

export const logIntentAborted = (timeline: IntentTimeline, intent: RecoveryIntent, reason: string): IntentTimeline =>
  createEvent(timeline, 'intent-aborted', intent.operator, `Aborted: ${reason}`, { reason });

export const logRiskFlagged = (timeline: IntentTimeline, actor: string, reason: string, score: number): IntentTimeline =>
  createEvent(timeline, 'risk-flagged', actor, `Risk flagged ${score.toFixed(1)}`, { score, reason });

export const logSimulationGenerated = (timeline: IntentTimeline, actor: string, scenarioId: string, score: number): IntentTimeline =>
  createEvent(timeline, 'simulation-generated', actor, `Simulation ${scenarioId} generated`, { scenarioId, score });

export const mergeTimelines = (left: IntentTimeline, right: IntentTimeline): IntentTimeline => {
  const events = [...left.events, ...right.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    intentId: left.intentId,
    events,
  };
};

export const extractStats = (timeline: IntentTimeline): TimelineStats => {
  const byType = timeline.events.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] ?? 0) + 1;
    return acc;
  }, {} as Record<IntentEventType, number>);

  const sorted = [...timeline.events].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const firstEvent = sorted[0];
  const lastEvent = sorted.at(-1);
  const spanMinutes = sorted.length <= 1 || !firstEvent || !lastEvent ? 0 : Math.max(0, (Date.parse(lastEvent.at) - Date.parse(firstEvent.at)) / 60_000);
  const uniqueActors = new Set(timeline.events.map((entry) => entry.actor)).size;

  return {
    totalEvents: timeline.events.length,
    byType: {
      'intent-created': byType['intent-created'] ?? 0,
      'step-added': byType['step-added'] ?? 0,
      'intent-activated': byType['intent-activated'] ?? 0,
      'intent-monitoring': byType['intent-monitoring'] ?? 0,
      'intent-completed': byType['intent-completed'] ?? 0,
      'intent-aborted': byType['intent-aborted'] ?? 0,
      'risk-flagged': byType['risk-flagged'] ?? 0,
      'simulation-generated': byType['simulation-generated'] ?? 0,
    },
    spanMinutes: Number(spanMinutes.toFixed(1)),
    uniqueActors,
  };
};

export const timelineContainsFailure = (timeline: IntentTimeline): boolean =>
  timeline.events.some((entry) => entry.type === 'intent-aborted' || entry.type === 'risk-flagged');

export const recentEvents = (timeline: IntentTimeline, lookbackMinutes = 120): IntentEvent[] => {
  const window = Date.now() - lookbackMinutes * 60_000;
  return [...timeline.events].filter((entry) => Date.parse(entry.at) >= window);
};

export const describeTimeline = (timeline: IntentTimeline): string =>
  `${timeline.intentId}: ${timeline.events.length} events, latest=${timeline.events.at(-1)?.at ?? 'none'}`;
