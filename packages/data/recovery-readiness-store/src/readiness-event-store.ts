import type { ReadinessEventEnvelope, ReadinessRunId } from '@domain/recovery-readiness';
import type { Result } from '@shared/result';
import { ok } from '@shared/result';

export interface BufferedEnvelope {
  sequence: number;
  envelope: ReadinessEventEnvelope;
}

interface ReadinessEventStoreState {
  stream: Map<ReadinessRunId, BufferedEnvelope[]>;
  offsets: Map<ReadinessRunId, number>;
}

export interface AppendEventResult {
  runId: string;
  offset: number;
  action: ReadinessEventEnvelope['action'];
}

export interface ReadinessEventStore {
  append(event: ReadinessEventEnvelope): Promise<Result<AppendEventResult, Error>>;
  consume(runId: ReadinessRunId, fromOffset: number): Promise<ReadinessEventEnvelope[]>;
  latestOffset(runId: ReadinessRunId): number;
}

export class InMemoryReadinessEventStore implements ReadinessEventStore {
  private state: ReadinessEventStoreState = {
    stream: new Map(),
    offsets: new Map(),
  };

  async append(event: ReadinessEventEnvelope): Promise<Result<AppendEventResult, Error>> {
    const bucket = this.state.stream.get(event.runId) ?? [];
    const current = this.state.offsets.get(event.runId) ?? 0;
    const nextOffset = current + 1;

    const item: BufferedEnvelope = {
      sequence: nextOffset,
      envelope: event,
    };

    this.state.stream.set(event.runId, [...bucket, item]);
    this.state.offsets.set(event.runId, nextOffset);

    return ok({
      runId: event.runId,
      offset: nextOffset,
      action: event.action,
    });
  }

  async consume(runId: ReadinessRunId, fromOffset: number): Promise<ReadinessEventEnvelope[]> {
    const bucket = this.state.stream.get(runId) ?? [];
    return bucket.filter((item) => item.sequence > fromOffset).map((item) => item.envelope);
  }

  latestOffset(runId: ReadinessRunId): number {
    return this.state.offsets.get(runId) ?? 0;
  }
}

export const createReadinessEventStore = (): ReadinessEventStore => new InMemoryReadinessEventStore();
