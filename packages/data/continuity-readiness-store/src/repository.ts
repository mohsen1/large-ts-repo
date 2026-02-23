import { randomUUID } from 'node:crypto';
import { ok, fail, type Result } from '@shared/result';
import { normalizeLimit } from '@shared/core';
import { filterRuns, filterSurfaces, paginate } from './query';
import { validateRecord } from './invariants';
import {
  decodeRunRecord,
  decodeReadinessRecord,
  encodeMetrics,
  encodeReadinessRecord,
  encodeRunRecord,
  parseReadinessMetrics,
} from './serializer';
import { ContinuityReadinessIds } from '@domain/recovery-continuity-readiness';
import type {
  ContinuityReadinessEnvelope,
  ContinuityReadinessRun,
  ContinuityReadinessTenantId,
} from '@domain/recovery-continuity-readiness';
import type {
  ReadinessRecordEnvelope,
  ReadinessRunRecord,
  ReadinessSearchResult,
  ReadinessQuery,
  ReadinessMetrics,
  ReadinessStoreDependencies,
  ReadinessSeed,
} from './types';

interface RepositoryState {
  readonly records: Map<string, ReadinessRecordEnvelope>;
  readonly runs: Map<string, ReadinessRunRecord>;
  readonly windows: Set<string>;
}

const nowIso = (): string => new Date().toISOString();

const buildFallbackRun = (run = {} as Partial<ContinuityReadinessRun>): ContinuityReadinessRun => ({
  id: run.id ?? ContinuityReadinessIds.run(`fallback-run-${randomUUID()}`),
  surfaceId: run.surfaceId ?? ContinuityReadinessIds.surface(`surface-${randomUUID()}`),
  tenantId: run.tenantId ?? ('tenant-default' as ContinuityReadinessTenantId),
  planId: run.planId ?? ContinuityReadinessIds.plan(`plan-${randomUUID()}`),
  phase: 'observe',
  startedAt: run.startedAt ?? nowIso(),
  startedBy: run.startedBy ?? 'continuity-readiness-store',
  expectedFinishAt: run.expectedFinishAt ?? nowIso(),
  currentScore: run.currentScore ?? 50,
  riskBand: run.riskBand ?? 'medium',
  active: run.active ?? false,
  metadata: run.metadata ?? {},
});

const buildEnvelopeRun = (envelope: ContinuityReadinessEnvelope): ContinuityReadinessRun => {
  return buildFallbackRun(envelope.run ?? undefined);
};

export class ContinuityReadinessStore {
  private readonly state: RepositoryState;

  constructor(_deps: ReadinessStoreDependencies = {}) {
    this.state = {
      records: new Map<string, ReadinessRecordEnvelope>(),
      runs: new Map<string, ReadinessRunRecord>(),
      windows: new Set<string>(),
    };
  }

  seed(seed: ReadinessSeed): void {
    const surface = seed.surfaces[0];
    if (!surface) return;
    const envelope: ContinuityReadinessEnvelope = {
      tenantId: seed.tenantId,
      surface,
      coverage: [],
      run: buildFallbackRun({
        tenantId: seed.tenantId,
        surfaceId: surface.id,
        active: true,
      }),
      projection: {
        horizonMinutes: 180,
        trend: 'flat',
        confidence: 0.75,
        meanScore: 50,
        volatility: 0,
        points: [50, 50],
      },
    };

    const record: ReadinessRecordEnvelope = {
      id: `record-${randomUUID()}` as ReadinessRecordEnvelope['id'],
      tenantId: seed.tenantId,
      surface,
      createdAt: nowIso(),
      window: {
        from: nowIso(),
        to: nowIso(),
      },
      createdBy: 'seed',
    };

    this.state.records.set(String(record.id), record);
    void this.putSurface(envelope);
  }

  putSurface(envelope: ContinuityReadinessEnvelope): Result<ReadinessRecordEnvelope, Error> {
    const run = buildEnvelopeRun(envelope);
    const validation = validateRecord({
      id: `surface-${randomUUID()}` as ReadinessRecordEnvelope['id'],
      tenantId: envelope.tenantId,
      surface: envelope.surface,
      createdAt: nowIso(),
      window: { from: run.startedAt, to: nowIso() },
      createdBy: run.startedBy,
    });

    if (!validation.ok) {
      return fail(validation.error);
    }

    const record: ReadinessRecordEnvelope = {
      ...validation.value,
      id: `record-${randomUUID()}` as ReadinessRecordEnvelope['id'],
      createdBy: 'continuity-readiness-store',
    };

    this.state.records.set(String(record.id), record);
    return ok(record);
  }

  listSurfaces(query: ReadinessQuery): ReadinessSearchResult<ContinuityReadinessEnvelope> {
    const rows = [...this.state.records.values()]
      .filter((record) => !query.tenantId || record.tenantId === query.tenantId)
      .map((record): ContinuityReadinessEnvelope => ({
        tenantId: record.tenantId,
        surface: record.surface,
        coverage: [],
        run: buildFallbackRun({
          tenantId: record.tenantId,
          surfaceId: record.surface.id,
          planId: record.surface.plans[0]?.id,
          active: true,
        }),
        projection: {
          horizonMinutes: 120,
          trend: 'flat',
          confidence: 0.75,
          meanScore: record.surface.plans.reduce((sum, plan) => sum + plan.score, 0) / Math.max(1, record.surface.plans.length),
          volatility: 0,
          points: [100, 99, 98],
        },
      }));

    const filtered = filterSurfaces(rows, {
      tenantId: query.tenantId,
      planId: query.planId,
      surfaceId: query.surfaceId,
    });

    const pageRows = filtered.map((surface): ContinuityReadinessEnvelope => {
      const matchedCoverage = rows.find((entry) => entry.surface.id === surface.id);
      return matchedCoverage ?? {
        tenantId: surface.tenantId,
        surface,
        coverage: [],
        run: buildFallbackRun({
          tenantId: surface.tenantId,
          surfaceId: surface.id,
          planId: surface.plans[0]?.id,
          active: true,
        }),
        projection: {
          horizonMinutes: 120,
          trend: 'flat',
          confidence: 0.84,
          meanScore: surface.plans[0]?.score ?? 50,
          volatility: 0,
          points: [50, 50, 50],
        },
      };
    });

    const paged = paginate(pageRows, 1, normalizeLimit(query.limit));
    return {
      rows: paged.rows,
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
    };
  }

  getRun(id: string): ContinuityReadinessRun | undefined {
    return this.state.runs.get(id)?.run;
  }

  listRuns(query: ReadinessQuery): ReadinessSearchResult<ContinuityReadinessRun> {
    const rows = [...this.state.runs.values()].map((entry) => entry.run);
    const filtered = filterRuns(rows, {
      tenantId: query.tenantId,
      planId: query.planId,
      runId: query.runId,
      activeOnly: query.activeOnly,
    });
    return filtered;
  }

  recordRun(run: ContinuityReadinessRun): Result<ReadinessRunRecord, Error> {
    const safeRun = buildFallbackRun(run);
    const record: ReadinessRunRecord = {
      id: `runrec-${randomUUID()}` as ReadinessRunRecord['id'],
      run: safeRun,
      snapshot: {
        tenantId: safeRun.tenantId,
        surface: {
          id: safeRun.surfaceId,
          tenantId: safeRun.tenantId,
          signals: [],
          plans: [],
          metrics: [],
          lastUpdated: nowIso(),
        },
        coverage: [],
        run: safeRun,
        projection: {
          horizonMinutes: 120,
          trend: 'flat',
          confidence: 0.6,
          meanScore: safeRun.currentScore,
          volatility: 1,
          points: [safeRun.currentScore, safeRun.currentScore],
        },
      },
      archived: false,
    };

    this.state.runs.set(String(record.id), record);
    return ok(record);
  }

  snapshot(): ReadinessMetrics {
    const runs = [...this.state.runs.values()];
    const active = runs.filter((entry) => entry.run.active).length;
    const archived = runs.filter((entry) => entry.archived).length;
    const avgRisk = runs.length === 0 ? 0 : runs.reduce((acc, entry) => acc + entry.run.currentScore, 0) / runs.length;

    return {
      tenantId: 'tenant-default' as ContinuityReadinessTenantId,
      activeRuns: active,
      archivedRuns: archived,
      avgRisk: Number(avgRisk.toFixed(2)),
      lastUpdated: nowIso(),
    };
  }

  exportState(): string {
    const payload = {
      records: [...this.state.records.values()].map(encodeReadinessRecord),
      runs: [...this.state.runs.values()].map(encodeRunRecord),
      windows: [...this.state.windows],
      metrics: encodeMetrics(this.snapshot()),
      exportedAt: nowIso(),
    };
    return JSON.stringify(payload);
  }

  importState(payload: string): Result<true, Error> {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed.records) || !Array.isArray(parsed.runs)) {
      return fail(new Error('invalid import format'));
    }

    for (const raw of parsed.records) {
      const record = decodeReadinessRecord(raw);
      if (!record.ok) {
        return fail(record.error);
      }
      this.state.records.set(String(record.value.id), record.value);
    }

    for (const raw of parsed.runs) {
      const run = decodeRunRecord(raw);
      if (run.ok) {
        this.state.runs.set(String(run.value.id), run.value);
      }
    }

    return ok(true);
  }

  validateConsistency(): Result<ReadinessMetrics, Error> {
    const parsed = parseReadinessMetrics(this.snapshot());
    return parsed.ok ? ok(this.snapshot()) : fail(parsed.error);
  }
}

export type { ReadinessRunRecord, ReadinessRecordEnvelope };
