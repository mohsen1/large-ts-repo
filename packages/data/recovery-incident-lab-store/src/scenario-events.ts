import type { IncidentLabScenario, IncidentLabRun, IncidentLabEnvelope, IncidentLabSignal } from '@domain/recovery-incident-lab-core';
import { createClock } from '@domain/recovery-incident-lab-core';

export type ScenarioEventType = 'scenario.created' | 'plan.saved' | 'run.saved' | 'signal.ingested' | 'envelope.enqueued';

export interface ScenarioEvent {
  readonly eventId: string;
  readonly type: ScenarioEventType;
  readonly scenarioId: string;
  readonly at: string;
  readonly actor: string;
  readonly payload?: string;
}

export interface ScenarioEventLog {
  readonly scenarioId: string;
  readonly events: readonly ScenarioEvent[];
  readonly total: number;
}

export interface ScenarioEventSink {
  readonly append: (event: ScenarioEvent) => void;
  readonly list: (scenarioId: string) => readonly ScenarioEvent[];
  readonly flush: (scenarioId: string) => void;
}

const makeEvent = (type: ScenarioEventType, scenarioId: string, actor: string, payload?: string): ScenarioEvent => ({
  eventId: `${scenarioId}:${type}:${Date.now()}` ,
  type,
  scenarioId,
  at: createClock().now(),
  actor,
  payload,
});

export const createScenarioEventLog = (): ScenarioEventLog => ({ scenarioId: 'none', events: [], total: 0 });

export const createInMemoryScenarioEventSink = (): ScenarioEventSink => {
  const buckets = new Map<string, ScenarioEvent[]>();

  const append = (event: ScenarioEvent): void => {
    const bucket = buckets.get(event.scenarioId) ?? [];
    buckets.set(event.scenarioId, [event, ...bucket]);
  };

  return {
    append,
    list: (scenarioId: string) => buckets.get(scenarioId) ?? [],
    flush: (scenarioId: string) => {
      buckets.delete(scenarioId);
    },
  };
};

export const appendScenarioCreated = (sink: ScenarioEventSink, scenario: IncidentLabScenario, actor = 'system'): void => {
  sink.append(makeEvent('scenario.created', scenario.id, actor, scenario.name));
};

export const appendPlanSaved = (sink: ScenarioEventSink, run: IncidentLabRun, actor = 'system'): void => {
  sink.append(makeEvent('plan.saved', run.scenarioId, actor, run.planId));
};

export const appendRunSaved = (sink: ScenarioEventSink, run: IncidentLabRun, actor = 'system'): void => {
  sink.append(makeEvent('run.saved', run.scenarioId, actor, run.runId));
};

export const appendSignalIngested = (sink: ScenarioEventSink, signal: IncidentLabSignal, actor = 'system'): void => {
  sink.append(makeEvent('signal.ingested', signal.node, actor, `${signal.kind}:${signal.value}`));
};

export const appendEnvelope = (sink: ScenarioEventSink, envelope: IncidentLabEnvelope, actor = 'system'): void => {
  sink.append(makeEvent('envelope.enqueued', envelope.scenarioId, actor, envelope.id));
};

export const eventsToText = (events: readonly ScenarioEvent[]): string =>
  events
    .slice()
    .sort((left, right) => right.at.localeCompare(left.at))
    .map((event) => `${event.at} ${event.type} ${event.scenarioId}`)
    .join('\n');
