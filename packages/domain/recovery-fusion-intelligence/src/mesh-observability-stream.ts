import type { MeshRuntimeEvent, MeshSignalEnvelope } from './mesh-types';

export interface StreamCursor<T> {
  readonly position: number;
  readonly value: T | null;
}

export interface ObservabilityWindow {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly sampleSize: number;
  readonly averageSeverity: number;
}

export interface ObservabilityStreamOptions {
  readonly sampleWindow: number;
  readonly jitterMs: number;
  readonly label: string;
}

const normalizeEvents = (events: readonly MeshRuntimeEvent[]): readonly MeshRuntimeEvent[] =>
  events
    .toSorted((left, right) => left.runId.localeCompare(right.runId))
    .map((event) => ({
      ...event,
      runId: event.runId,
    }));

export const createEventStream = async function* (
  events: readonly MeshRuntimeEvent[],
  options: Partial<ObservabilityStreamOptions> = {},
): AsyncGenerator<StreamCursor<MeshRuntimeEvent>> {
  const jitter = options.jitterMs ?? 0;
  const sampleWindow = options.sampleWindow ?? 1_000;

  const sorted = normalizeEvents(events);
  let index = 0;

  while (index < sorted.length) {
    const chunk = sorted.slice(index, index + sampleWindow);
    index += chunk.length;

    for (const event of chunk) {
      if (jitter > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, jitter);
        });
      }
      yield { position: index, value: event };
    }
  }
};

export const calculateObservabilityWindow = (events: readonly MeshSignalEnvelope[]): ObservabilityWindow => {
  if (events.length === 0) {
    return {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      sampleSize: 0,
      averageSeverity: 0,
    };
  }

  const numericSeverities = events.map((signal) => signal.severity);
  return {
    startedAt: events[0]?.createdAt ?? new Date().toISOString(),
    endedAt: events.at(-1)?.createdAt ?? new Date().toISOString(),
    sampleSize: events.length,
    averageSeverity:
      numericSeverities.reduce<number>((acc, severity) => acc + severity, 0) / numericSeverities.length,
  };
};

export const mergeCursorStreams = async function* (
  a: AsyncGenerator<StreamCursor<MeshRuntimeEvent>>,
  b: AsyncGenerator<StreamCursor<MeshRuntimeEvent>>,
): AsyncGenerator<MeshRuntimeEvent> {
  const pull = async (it: AsyncGenerator<StreamCursor<MeshRuntimeEvent>>): Promise<StreamCursor<MeshRuntimeEvent> | null> => {
    const { done, value } = await it.next();
    return done ? null : value;
  };

  const left = pull(a);
  const right = pull(b);
  let leftValue = await left;
  let rightValue = await right;

  while (leftValue || rightValue) {
    if (!rightValue || (leftValue && leftValue.position <= rightValue.position)) {
      if (leftValue?.value) {
        yield leftValue.value;
      }
      leftValue = await pull(a);
      continue;
    }

    if (rightValue?.value) {
      yield rightValue.value;
    }
    rightValue = await pull(b);
  }
}
