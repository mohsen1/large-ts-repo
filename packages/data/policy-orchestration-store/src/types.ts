export type PolicyStoreRecordId = string;

export interface PolicyStoreRecordMeta {
  id: PolicyStoreRecordId;
  createdAt: string;
  updatedAt: string;
  correlationId: string;
}

export interface PolicyStoreArtifact extends PolicyStoreRecordMeta {
  orchestratorId: string;
  artifactId: string;
  namespace: string;
  name: string;
  revision: number;
  state: 'active' | 'archived' | 'retired';
  payload: Record<string, unknown>;
}

export interface PolicyStorePlanSnapshot extends PolicyStoreRecordMeta {
  planId: string;
  orchestratorId: string;
  revision: number;
  window: string;
  snapshot: Record<string, unknown>;
}

export interface PolicyStoreRunRecord extends PolicyStoreRecordMeta {
  runId: string;
  planId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  actor: string;
  summary: Record<string, unknown>;
  metrics: Record<string, number>;
}

export interface PolicyStoreFilters {
  orchestratorId?: string;
  artifactId?: string;
  states?: readonly PolicyStoreArtifact['state'][];
  fromDate?: string;
  toDate?: string;
}

export interface PolicyStoreSort {
  key: 'createdAt' | 'updatedAt' | 'revision';
  order: 'asc' | 'desc';
}

export interface PolicyStorePage<T> {
  items: readonly T[];
  nextCursor?: string;
  hasMore: boolean;
}
