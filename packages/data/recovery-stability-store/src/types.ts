import type {
  StabilityEnvelope,
  StabilitySignal,
  StabilityRunId,
  StabilitySignalId,
  ServiceNodeId,
} from '@domain/recovery-stability-models';

export interface StabilityRecord extends StabilityEnvelope {
  readonly createdAt: string;
}

export interface SignalRecord extends StabilitySignal {
  readonly storedAt: string;
}

export interface IncidentWindow {
  readonly runId: StabilityRunId;
  readonly start: string;
  readonly end: string;
}

export interface StabilityFilter {
  readonly runIds?: readonly StabilityRunId[];
  readonly serviceIds?: readonly ServiceNodeId[];
  readonly minValue?: number;
}

export type StoreLookup = ReadonlyArray<StabilityRunId>;

export interface StorePage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: StabilityRunId;
  readonly hasMore: boolean;
}

export interface StabilityStoreMutationResult {
  readonly runId: StabilityRunId;
  readonly insertedSignals: number;
  readonly changed: boolean;
}

export interface SignalWriteBatch {
  readonly runId: StabilityRunId;
  readonly signals: readonly SignalRecord[];
}

export const parseStoredSignal = (input: Omit<SignalRecord, 'storedAt'>): SignalRecord => ({
  ...input,
  storedAt: new Date(0).toISOString(),
});

export const asStoredSignal = (runId: StabilityRunId): SignalRecord[] => [] as SignalRecord[];
