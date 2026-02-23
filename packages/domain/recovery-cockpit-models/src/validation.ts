import { AuditContext, DomainVersion, EntityId, PlanLabel, RegionTopology } from './identifiers';
import { RecoveryAction, RecoveryPlan as RuntimeRecoveryPlan, RecoveryPlan } from './runtime';

const safeStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const isUtcIso = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const asEntity = (value: unknown): value is string => typeof value === 'string' && value.length >= 3;

const parseLabel = (value: unknown): PlanLabel | undefined => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  const candidate = value as Partial<PlanLabel> & Record<string, unknown>;
  if (typeof candidate.short !== 'string' || typeof candidate.long !== 'string' || typeof candidate.emoji !== 'string') {
    return;
  }
  const labels = safeStringArray(candidate.labels);
  return {
    short: candidate.short,
    long: candidate.long,
    emoji: candidate.emoji,
    labels,
  };
};

const parseAction = (value: unknown): RecoveryAction | undefined => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  const candidate = value as Partial<RecoveryAction> & Record<string, unknown>;
  if (!asEntity(candidate.id) || !asEntity(candidate.serviceCode) || !asEntity(candidate.region) || typeof candidate.command !== 'string') {
    return;
  }
  const dependencies = Array.isArray(candidate.dependencies)
    ? candidate.dependencies.filter((entry): entry is string => asEntity(entry)).map((entry) => entry as EntityId)
    : [];

  return {
    id: candidate.id as EntityId,
    serviceCode: candidate.serviceCode,
    region: candidate.region,
    command: candidate.command,
    desiredState: (candidate.desiredState as RecoveryAction['desiredState']) ?? 'up',
    dependencies: dependencies as RecoveryAction['dependencies'],
    expectedDurationMinutes: typeof candidate.expectedDurationMinutes === 'number' ? candidate.expectedDurationMinutes : 0,
    retriesAllowed: typeof candidate.retriesAllowed === 'number' ? candidate.retriesAllowed : 0,
    tags: safeStringArray(candidate.tags),
  };
};

export const parseRegionTopology = (value: unknown): RegionTopology | undefined => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  const candidate = value as Partial<RegionTopology> & Record<string, unknown>;
  if (typeof candidate.region !== 'string' || typeof candidate.namespace !== 'string' || !Array.isArray(candidate.services)) {
    return;
  }
  return {
    region: candidate.region as RegionTopology['region'],
    namespace: candidate.namespace as RegionTopology['namespace'],
    services: candidate.services.filter(asEntity).map((serviceCode) => serviceCode as RegionTopology['services'][number]),
    isPrimary: typeof candidate.isPrimary === 'boolean' ? candidate.isPrimary : false,
  };
};

export const parseAuditContext = (value: unknown): AuditContext | undefined => {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  const candidate = value as Partial<AuditContext> & Record<string, unknown>;
  if (typeof candidate.source !== 'string' || !candidate.actor || typeof candidate.actor !== 'object') return;
  const actorValue = candidate.actor as Partial<{ id: string; kind: string }>;
  if (typeof actorValue.id !== 'string' || typeof actorValue.kind !== 'string' || !asEntity(candidate.requestId)) return;
  if (typeof candidate.correlationId !== 'string') return;
  return {
    actor: {
      id: actorValue.id as AuditContext['actor']['id'],
      kind: actorValue.kind as 'operator',
    },
    source: candidate.source,
    requestId: candidate.requestId as AuditContext['requestId'],
    correlationId: candidate.correlationId,
  };
};

export const safeParsePlan = (value: unknown): { ok: boolean; result?: RecoveryPlan; errors?: string[] } => {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, errors: ['payload-not-object'] };
  }
  const candidate = value as Partial<RuntimeRecoveryPlan> & Record<string, unknown>;
  const labels = parseLabel(candidate.labels);
  if (!labels) return { ok: false, errors: ['labels.invalid'] };
  if (!asEntity(candidate.planId) || typeof candidate.title !== 'string' || typeof candidate.mode !== 'string') {
    return { ok: false, errors: ['plan-missing-core-fields'] };
  }

  const candidateActions = Array.isArray(candidate.actions) ? candidate.actions : [];
  if (candidateActions.length === 0) {
    return { ok: false, errors: ['actions.empty'] };
  }

  const actions = candidateActions
    .map((action) => parseAction(action))
    .filter((action): action is RecoveryAction => action !== undefined);
  if (actions.length !== candidateActions.length) {
    return { ok: false, errors: ['actions.invalid'] };
  }

  const audit = Array.isArray(candidate.audit) ? candidate.audit.map((entry) => parseAuditContext(entry)).filter((entry): entry is AuditContext => entry !== undefined) : [];

  if (!isUtcIso(candidate.effectiveAt)) {
    return { ok: false, errors: ['effectiveAt.invalid'] };
  }

  return {
    ok: true,
    result: {
      planId: candidate.planId as RuntimeRecoveryPlan['planId'],
      labels,
      mode: candidate.mode as RuntimeRecoveryPlan['mode'],
      title: candidate.title,
      description: String(candidate.description ?? ''),
      actions,
      audit,
      version: (typeof candidate.version === 'number' ? candidate.version : 0) as DomainVersion,
      slaMinutes: typeof candidate.slaMinutes === 'number' ? candidate.slaMinutes : 0,
      isSafe: Boolean(candidate.isSafe),
      effectiveAt: candidate.effectiveAt,
    },
  };
};

export const parseTimestamp = (value: unknown): string => {
  if (!isUtcIso(value)) {
    throw new Error('invalid timestamp');
  }
  return value;
};
