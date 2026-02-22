import type { CoordinationPlanCandidate, CoordinationProgram, CoordinationSelectionResult } from '@domain/recovery-coordination';
import type { RecoveryCoordinationQuery, CoordinationRecord, ProgramProjection } from './models';
import { validateQuery } from './adapter';

export interface CoordinationQueryResult {
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly records: readonly CoordinationRecord[];
}

export interface CoordinationSelectionMetrics {
  readonly approved: number;
  readonly deferred: number;
  readonly blocked: number;
  readonly byTenant: Record<string, number>;
}

export interface ProgramProjectionInput {
  readonly program: CoordinationProgram;
  readonly selection: CoordinationSelectionResult;
}

export const buildSelectionMetrics = (
  selections: readonly CoordinationSelectionResult[],
): CoordinationSelectionMetrics => {
  const totals = selections.reduce(
    (acc, selection) => {
      if (selection.decision === 'approved') acc.approved += 1;
      if (selection.decision === 'deferred') acc.deferred += 1;
      if (selection.decision === 'blocked') acc.blocked += 1;
      return acc;
    },
    { approved: 0, deferred: 0, blocked: 0, byTenant: {} as Record<string, number> },
  );

  for (const selection of selections) {
    const tenant = selection.selectedCandidate.tenant as string;
    const count = totals.byTenant[tenant] ?? 0;
    totals.byTenant[tenant] = count + 1;
  }

  return totals;
};

export const normalizeCursor = (value?: string): number => {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const applyQuery = (
  records: readonly CoordinationRecord[],
  query: RecoveryCoordinationQuery,
): CoordinationQueryResult => {
  const normalized = validateQuery(query);
  if (!normalized.ok) {
    return {
      total: 0,
      hasMore: false,
      nextCursor: undefined,
      records: [],
    };
  }

  const limit = Math.max(1, Math.min(normalized.value.take ?? 200, 10000));
  const start = normalizeCursor(normalized.value?.from);

  const filtered = records
    .filter((record) => {
      if (query.tenant && record.tenant !== query.tenant) return false;
      if (query.runId && record.runId !== query.runId) return false;
      if (!query.includeArchived && record.archived) return false;

      if (!query.from && !query.to) return true;
      const createdAt = Date.parse(record.createdAt);
      const from = query.from ? Date.parse(query.from) : Number.NEGATIVE_INFINITY;
      const to = query.to ? Date.parse(query.to) : Number.POSITIVE_INFINITY;
      return createdAt >= from && createdAt <= to;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const recordsSlice = filtered.slice(start, start + limit);
  const nextCursor = start + recordsSlice.length < filtered.length ? `${start + recordsSlice.length}` : undefined;
  return {
    total: filtered.length,
    hasMore: Boolean(nextCursor),
    nextCursor,
    records: recordsSlice,
  };
};

export const summarizeProgramProjection = (
  input: ProgramProjectionInput,
): ProgramProjection => {
  const alternatives = input.selection.alternatives;
  const averageResilience = alternatives.length
    ? alternatives.reduce((sum, candidate) => sum + candidate.metadata.resilienceScore, 0) / alternatives.length
    : 0;

  return {
    programId: input.program.id,
    tenant: input.program.tenant,
    scope: input.program.scope,
    stepCount: input.program.steps.length,
    candidateCount: alternatives.length + 1,
    averageResilience,
  };
};

export const hasDecisionChanged = (
  left: CoordinationSelectionResult,
  right: CoordinationSelectionResult,
): boolean => left.decision !== right.decision;

export const topByRisk = (
  candidates: readonly CoordinationPlanCandidate[],
): CoordinationPlanCandidate | undefined =>
  candidates
    .slice()
    .sort((a, b) => a.metadata.riskIndex - b.metadata.riskIndex)
    .at(0);
