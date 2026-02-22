import {
  SignalKind,
  SignalState,
  type SignalEnvelope,
  type SignalVector,
  type SignalPlanCandidate,
  type SignalWindow,
  type SignalQueryFilter,
  type SignalWindowInput,
  type SignalId,
  type TenantId,
  type ZoneId,
  type SignalPlanId,
  signalKinds,
  signalStates,
  riskBands,
  makeTenantId,
  makeZoneId,
  makeSignalId,
  makeSignalPlanCandidateId,
} from './signal-core';

const assertString = (value: unknown): value is string => typeof value === 'string';
const assertNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hasOwnPropertyValue = <T extends string>(values: readonly T[], value: string): value is T => values.includes(value as T);

const parseString = (value: unknown): string => {
  if (assertString(value)) {
    return value;
  }
  throw new Error('Expected string');
};

const parseNumber = (value: unknown): number => {
  if (assertNumber(value)) {
    return value;
  }
  throw new Error('Expected number');
};

const parseArray = <T>(value: unknown, parser: (entry: unknown) => T): T[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => parser(entry));
};

export const parseTenantId = (value: unknown): TenantId => makeTenantId(parseString(value));
export const parseZoneId = (value: unknown): ZoneId => makeZoneId(parseString(value));
export const parseSignalId = (value: unknown): SignalId => makeSignalId(parseString(value));
export const parseSignalPlanId = (value: unknown): SignalPlanId => makeSignalPlanCandidateId(parseString(value));

export const parseSignalVector = (raw: unknown): SignalVector => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Expected vector');
  }
  const candidate = raw as Record<string, unknown>;
  return {
    magnitude: parseNumber(candidate.magnitude),
    variance: parseNumber(candidate.variance),
    entropy: parseNumber(candidate.entropy),
  };
};

export const parseSignalEnvelope = (value: unknown): SignalEnvelope => {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected signal');
  }
  const item = value as Record<string, unknown>;
  const kind = parseString(item.kind);
  const state = parseString(item.state);
  const risk = parseString(item.risk);
  if (!hasOwnPropertyValue(signalKinds, kind)) {
    throw new Error('Invalid kind');
  }
  if (!hasOwnPropertyValue(signalStates, state)) {
    throw new Error('Invalid state');
  }
  if (!hasOwnPropertyValue(riskBands, risk)) {
    throw new Error('Invalid risk');
  }

  return {
    id: parseSignalId(item.id),
    tenantId: parseTenantId(item.tenantId),
    zone: parseZoneId(item.zone),
    kind: kind as SignalKind,
    state: state as SignalState,
    vector: parseSignalVector(item.vector),
    risk,
    recordedAt: parseString(item.recordedAt),
    correlationKeys: parseArray(item.correlationKeys, parseString),
    meta: {
      source: parseString((item.meta as Record<string, unknown> | undefined)?.source),
      observedBy: parseString((item.meta as Record<string, unknown> | undefined)?.observedBy),
      region: parseString((item.meta as Record<string, unknown> | undefined)?.region),
      tags: parseArray((item.meta as Record<string, unknown> | undefined)?.tags, parseString),
    },
  };
};

export const parseSignalPlanCandidate = (value: unknown): SignalPlanCandidate => {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected plan');
  }
  const item = value as Record<string, unknown>;
  const actions = parseArray(item.actions, (entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid action');
    }
    const action = entry as Record<string, unknown>;
    const actionType = parseString(action.type);
    if (!hasOwnPropertyValue(['pause', 'shift', 'scale', 'notify', 'drain'] as const, actionType)) {
      throw new Error('Invalid action type');
    }
    return {
      type: actionType,
      priority: parseNumber(action.priority),
      target: parseString(action.target),
    };
  });

  return {
    id: parseSignalPlanId(item.id),
    signalId: parseSignalId(item.signalId),
    tenantId: parseTenantId(item.tenantId),
    title: parseString(item.title),
    rationale: parseString(item.rationale),
    actions,
    expectedDowntimeMinutes: parseNumber(item.expectedDowntimeMinutes),
    approved: Boolean(item.approved),
  };
};

export const parseSignalWindow = (value: unknown): SignalWindow => {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected window');
  }
  const item = value as Record<string, unknown>;
  return {
    from: parseString(item.from),
    to: parseString(item.to),
    samples: parseArray(item.samples, parseSignalVector),
  };
};

export const parseSignalFilter = (value: unknown): SignalQueryFilter => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const candidate = value as Record<string, unknown>;
  return {
    tenantId: candidate.tenantId ? parseTenantId(candidate.tenantId) : undefined,
    kinds: parseArray(candidate.kinds, (entry) => {
      const typed = parseString(entry);
      if (!hasOwnPropertyValue(signalKinds, typed)) {
        throw new Error('Invalid signal kind');
      }
      return typed;
    }),
    states: parseArray(candidate.states, (entry) => {
      const typed = parseString(entry);
      if (!hasOwnPropertyValue(signalStates, typed)) {
        throw new Error('Invalid signal state');
      }
      return typed;
    }),
    riskBands: parseArray(candidate.riskBands, (entry) => {
      const typed = parseString(entry);
      if (!hasOwnPropertyValue(riskBands, typed)) {
        throw new Error('Invalid risk band');
      }
      return typed;
    }),
    from: candidate.from ? parseString(candidate.from) : undefined,
    to: candidate.to ? parseString(candidate.to) : undefined,
    search: candidate.search ? parseString(candidate.search) : undefined,
  };
};

export const parseSignalWindowInput = (value: unknown): SignalWindowInput => {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected window input');
  }
  const input = value as Record<string, unknown>;
  const signalKind = parseString(input.signalKind);
  if (!hasOwnPropertyValue(signalKinds, signalKind)) {
    throw new Error('Invalid signal kind');
  }
  return {
    tenantId: parseTenantId(input.tenantId),
    signalKind,
    from: parseString(input.from),
    to: parseString(input.to),
    limit: input.limit ? parseNumber(input.limit) : undefined,
  };
};

export const parseSyntheticSignalId = (seed: string): SignalId => makeSignalId(seed);
