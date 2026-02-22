import { StreamId, StreamPartition } from './types';

export interface CheckpointState {
  stream: StreamId;
  offsets: Record<string, number>;
  at: Date;
}

export class CheckpointStore {
  private readonly offsets: Map<string, CheckpointState> = new Map();

  save(state: CheckpointState): void {
    this.offsets.set(state.stream, { ...state, at: new Date() });
  }

  load(stream: StreamId): CheckpointState | undefined {
    return this.offsets.get(stream);
  }

  list(): readonly CheckpointState[] {
    return [...this.offsets.values()];
  }
}

export function advance(state: CheckpointState, partition: StreamPartition, offset: number): CheckpointState {
  return {
    ...state,
    offsets: { ...state.offsets, [partition.id]: offset },
    at: new Date(),
  };
}

export function reconcile(base: CheckpointState, next: CheckpointState): CheckpointState {
  return {
    stream: base.stream,
    offsets: { ...base.offsets, ...next.offsets },
    at: new Date(Math.max(base.at.getTime(), next.at.getTime())),
  };
}
