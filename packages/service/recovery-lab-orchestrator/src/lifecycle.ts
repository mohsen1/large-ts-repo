import type { LabExecutionResult } from '@domain/recovery-simulation-lab-core';
import type { SnapshotEvent } from '@data/recovery-lab-simulation-store';
import { collectPluginIds, summarizeResult } from '@data/recovery-lab-simulation-store';

export interface EngineEvent {
  readonly event: 'started' | 'tick' | 'done';
  readonly payload: Record<string, unknown>;
  readonly at: number;
}

export interface EngineLifecycle {
  readonly events: readonly EngineEvent[];
  readonly startedAt: number;
  readonly completeAt?: number;
}

const asRecordPayload = (snapshot: SnapshotEvent): Record<string, unknown> => ({
  at: snapshot.at,
  tenant: snapshot.tenant,
  kind: snapshot.kind,
  payload: snapshot.payload,
});

const createSnapshot = (events: readonly EngineEvent[]) => {
  const sorted = [...events].toSorted((left, right) => right.at - left.at);
  const latest = sorted[0];
  return {
    latest: latest ? latest.event : 'started',
    latestAt: latest ? latest.at : 0,
  };
};

export const collectSnapshot = (result: LabExecutionResult, extras: string[]): EngineLifecycle => {
  const events: EngineEvent[] = [
    {
      event: 'started',
      at: Date.now(),
      payload: {
        tenant: result.context.tenant,
        runId: result.execution.executionId,
      },
    },
    {
      event: 'done',
      at: Date.now() + 1,
      payload: asRecordPayload(summarizeResult(result)),
    },
    ...extras.map((label, index) => ({
      event: 'tick' as const,
      payload: { label },
      at: Date.now() + index,
    })),
  ];

  return {
    events,
    startedAt: events[events.length - 1]?.at ?? Date.now(),
    completeAt: events[0]?.at,
  };
};

export const collectPluginsFromResult = (result: LabExecutionResult): readonly string[] => {
  return collectPluginIds(result.steps);
};

export const snapshotMetadata = (result: LabExecutionResult): ReturnType<typeof createSnapshot> => {
  return createSnapshot(awaitedEvents(result));
};

const awaitedEvents = (result: LabExecutionResult): readonly EngineEvent[] => {
  const snapshot = collectPluginsFromResult(result).map((pluginId) => ({
    event: 'tick' as const,
    at: Date.now(),
    payload: { pluginId },
  }));

  return [
    {
      event: 'started',
      at: Date.now(),
      payload: { tenant: result.context.tenant },
    },
    {
      event: 'done',
      at: Date.now(),
      payload: asRecordPayload(summarizeResult(result)),
    },
    ...snapshot,
  ];
};
