import type { Brand, JsonValue } from '@shared/type-level';
import type {
  CommandOrchestrationResult,
  CommandPlanId,
  CommandSurface,
  CommandSurfaceQuery,
} from '@domain/recovery-ops-orchestration-surface';

export type SurfaceEnvelopeId = Brand<string, 'SurfaceEnvelopeId'>;

export interface SurfaceEnvelopeRecord {
  readonly id: SurfaceEnvelopeId;
  readonly surface: CommandSurface;
  readonly createdAt: string;
  readonly queryContext: CommandSurfaceQuery;
  readonly generatedBy: string;
  readonly metadata: Record<string, JsonValue>;
}

export interface OrchestrationRunRecord {
  readonly id: Brand<string, 'OrchestrationRunId'>;
  readonly surfaceId: string;
  readonly runAt: string;
  readonly planId: CommandPlanId;
  readonly result: CommandOrchestrationResult;
  readonly selected: boolean;
  readonly notes: readonly string[];
}

export interface StoredSignalIndex {
  readonly surfaceId: string;
  readonly planId: CommandPlanId;
  readonly signalFingerprint: string;
}

export interface InMemoryMetrics {
  readonly totalSurfaces: number;
  readonly totalRuns: number;
  readonly averageScore: number;
  readonly selectionRate: number;
  readonly lastUpdated: string;
}

export interface QueryResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
