import { Brand } from '@shared/type-level';
import { ok, fail, type Result } from '@shared/result';
import type {
  InMemoryMetrics,
  OrchestrationRunRecord,
  QueryResult,
  SurfaceEnvelopeRecord,
  CommandSurface,
} from './types';
import type { CommandSurfaceQuery, CommandOrchestrationResult } from '@domain/recovery-ops-orchestration-surface';
import { filterRunRecords, filterSurfaceEnvelopes } from './query';
import {
  encodeSurfaceEnvelope,
  encodeOrchestrationRun,
  parseOrchestrationRun,
  parseSurfaceEnvelope,
} from './serializer';

interface SurfaceEnvelopeInput {
  readonly id: string;
  readonly surface: CommandSurface;
  readonly createdAt: string;
  readonly queryContext: CommandSurfaceQuery;
  readonly generatedBy: string;
  readonly metadata: Record<string, unknown>;
}

interface RunRecordInput {
  readonly id: string;
  readonly surfaceId: string;
  readonly runAt: string;
  readonly planId: string;
  readonly result: CommandOrchestrationResult | unknown;
  readonly selected: boolean;
  readonly notes: readonly string[];
}

interface RepositoryState {
  readonly surfaces: Map<string, SurfaceEnvelopeRecord>;
  readonly runs: Map<string, OrchestrationRunRecord>;
}

const nowIso = (): string => new Date().toISOString();

const normalizeRecord = (input: SurfaceEnvelopeInput): Result<SurfaceEnvelopeRecord, Error> => {
  try {
    return ok(parseSurfaceEnvelope({
      id: input.id,
      surface: input.surface,
      createdAt: input.createdAt,
      queryContext: input.queryContext,
      generatedBy: input.generatedBy,
      metadata: input.metadata,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('invalid-surface-record'));
  }
};

const normalizeRun = (input: RunRecordInput & { surface: CommandSurface; queryContext: CommandSurfaceQuery; generatedBy: string; metadata: Record<string, unknown>; }): Result<OrchestrationRunRecord, Error> => {
  try {
    return ok(parseOrchestrationRun({
      id: input.id,
      surfaceId: input.surfaceId,
      runAt: input.runAt,
      planId: input.planId,
      result: input.result,
      selected: input.selected,
      notes: input.notes,
      queryContext: input.queryContext,
      generatedBy: input.generatedBy,
      metadata: input.metadata,
      surface: input.surface,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('invalid-run-record'));
  }
};

const toSurfaceEnvelopeId = (value: string): Brand<string, 'SurfaceEnvelopeId'> => value as Brand<string, 'SurfaceEnvelopeId'>;
const toSurfaceId = (value: string): Brand<string, 'SurfaceId'> => value as Brand<string, 'SurfaceId'>;
const toOrchestrationRunId = (value: string): Brand<string, 'OrchestrationRunId'> => value as Brand<string, 'OrchestrationRunId'>;

const toMapId = (value: string): string => value;

export class RecoveryOpsOrchestrationStore {
  private readonly state: RepositoryState;

  constructor() {
    this.state = {
      surfaces: new Map<string, SurfaceEnvelopeRecord>(),
      runs: new Map<string, OrchestrationRunRecord>(),
    };
  }

  addSurface(input: SurfaceEnvelopeInput): Result<SurfaceEnvelopeRecord, Error> {
    const normalized = normalizeRecord(input);
    if (!normalized.ok) {
      return normalized;
    }

    const record: SurfaceEnvelopeRecord = {
      ...normalized.value,
      id: toSurfaceEnvelopeId(normalized.value.id),
    };
    this.state.surfaces.set(toMapId(record.id), record);
    return ok(record);
  }

  recordRun(payload: {
    id: string;
    planId: string;
    surface: CommandSurface;
    runAt?: string;
    result: unknown;
    selected?: boolean;
    notes?: readonly string[];
  }): Result<OrchestrationRunRecord, Error> {
    const now = runSafeDate(payload.runAt);
    const storedSurfaceId = toSurfaceId(payload.surface.id);
    const normalized = normalizeRun({
      id: payload.id,
      surfaceId: storedSurfaceId,
      runAt: now,
      planId: payload.planId,
      result: payload.result,
      selected: payload.selected ?? false,
      notes: payload.notes ?? [],
      queryContext: {
        tenantId: payload.surface.tenantId,
        scenarioId: payload.surface.scenarioId,
      },
      generatedBy: payload.surface.metadata.owner,
      metadata: payload.surface.metadata,
      surface: payload.surface,
    });

    if (!normalized.ok) {
      return normalized;
    }

    const record: OrchestrationRunRecord = {
      ...normalized.value,
      id: toOrchestrationRunId(normalized.value.id),
      runAt: now,
      selected: payload.selected ?? false,
      notes: [...normalized.value.notes],
    };

    this.state.runs.set(toMapId(record.id), {
      ...record,
      selected: payload.selected ?? false,
      notes: [...record.notes],
    });

    const latest = this.state.runs.get(record.id);
    return latest ? ok(latest) : fail(new Error('run-not-found'));
  }

  getSurface(id: string): SurfaceEnvelopeRecord | undefined {
    return this.state.surfaces.get(id);
  }

  getRun(id: string): OrchestrationRunRecord | undefined {
    return this.state.runs.get(id);
  }

  searchSurfaces(filter: {
    tenantId?: string;
    scenarioId?: string;
    onlySuccessful?: boolean;
    limit?: number;
    offset?: number;
  }): QueryResult<SurfaceEnvelopeRecord> {
    return filterSurfaceEnvelopes([...this.state.surfaces.values()], filter);
  }

  searchRuns(filter: {
    tenantId?: string;
    scenarioId?: string;
    onlySuccessful?: boolean;
    limit?: number;
    offset?: number;
  }): QueryResult<OrchestrationRunRecord> {
    return filterRunRecords([...this.state.runs.values()], filter);
  }

  snapshot(): InMemoryMetrics {
    const runEntries = [...this.state.runs.values()];
    const total = runEntries.length;
    const selected = runEntries.filter((entry) => entry.selected).length;

    return {
      totalSurfaces: this.state.surfaces.size,
      totalRuns: total,
      averageScore: total === 0 ? 0 : runEntries.reduce((sum, entry) => sum + entry.result.score, 0) / total,
      selectionRate: total === 0 ? 0 : selected / total,
      lastUpdated: nowIso(),
    };
  }

  exportSnapshot(): string {
    const surfaces = [...this.state.surfaces.values()];
    const runs = [...this.state.runs.values()];

    return JSON.stringify({
      surfaces: surfaces.map((entry) => encodeSurfaceEnvelope(entry)),
      runs: runs.map((entry) => encodeOrchestrationRun(entry)),
      metadata: this.snapshot(),
      exportedAt: nowIso(),
    });
  }
}

const runSafeDate = (value?: string): string => {
  if (!value) {
    return nowIso();
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? nowIso() : value;
};

export type { OrchestrationRunRecord, SurfaceEnvelopeRecord };
