import { z } from 'zod';
import type { AnySignalEnvelope, SignalLayer, SignalRunId } from '@domain/recovery-cockpit-cognitive-core';

export const signalStoreLayers = ['readiness', 'continuity', 'drift', 'policy', 'anomaly', 'capacity'] as const;
export type SignalStoreLayer = (typeof signalStoreLayers)[number];

export interface WorkspaceCursor {
  readonly runId: SignalRunId;
  readonly limit: number;
  readonly offset: number;
}

export interface QueryFilter {
  readonly layers: readonly SignalStoreLayer[];
  readonly runIds: readonly SignalRunId[];
  readonly minTs: string;
  readonly maxTs: string;
  readonly minPriority?: number;
}

export interface StoreStats {
  readonly workspaceId: string;
  readonly total: number;
  readonly byLayer: Readonly<Record<SignalStoreLayer, number>>;
  readonly lastUpdated: string;
}

export const runRecordSchema = z.object({
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  snapshotAt: z.string().datetime({ offset: true }),
  createdSignals: z.number().int().min(0),
  updatedSignals: z.number().int().min(0),
});

export const workspaceStateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  signals: z.array(z.unknown()),
  nextCursor: z
    .object({
      runId: z.string().min(1),
      limit: z.number().int().min(1),
      offset: z.number().int().min(0),
    })
    .nullable(),
  stats: z.object({
    total: z.number().int().min(0),
    byLayer: z.record(z.number().int().min(0)),
    lastUpdated: z.string().datetime({ offset: true }),
  }),
});

export type RunRecord = z.infer<typeof runRecordSchema>;
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;

export type StoreSignal = AnySignalEnvelope & { readonly acceptedAt: string };

export interface CursorEvent {
  readonly runId: SignalRunId;
  readonly at: string;
  readonly kind: 'append' | 'flush' | 'evict';
}

export interface SignalWriteBatch {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly records: readonly StoreSignal[];
}

export interface SignalQuery {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly layers?: readonly SignalStoreLayer[];
  readonly kinds?: readonly string[];
  readonly runIds?: readonly SignalRunId[];
  readonly minEmittedAt?: string;
  readonly maxEmittedAt?: string;
  readonly includeWarningsOnly?: boolean;
  readonly sortByAt?: 'asc' | 'desc';
  readonly cursor?: WorkspaceCursor;
}

export const createWorkspaceCursor = (runId: SignalRunId): WorkspaceCursor => ({
  runId,
  limit: 100,
  offset: 0,
});
