export interface StoreHealth {
  commandCount: number;
  planCount: number;
  simulationCount: number;
  executionCount: number;
  lastMutationAt: string | null;
}

export interface CommandTimelineSegment {
  at: string;
  commandId: string;
  event: 'created' | 'updated' | 'started' | 'finished';
  actor: string;
}

export const emptyHealth = (): StoreHealth => ({
  commandCount: 0,
  planCount: 0,
  simulationCount: 0,
  executionCount: 0,
  lastMutationAt: null,
});
