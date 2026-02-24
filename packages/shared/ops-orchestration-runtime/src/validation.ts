import { DeepReadonly } from '@shared/type-level';
import { ORCHESTRATION_PHASES, OrchestratorPhase, OrchestrationRuntimeConfig, RuntimeNamespace, StageName } from './domain.js';

export type ParseError = Readonly<{ path: string; message: string }>;

export interface RuntimeConfigWire {
  readonly namespace: string;
  readonly maxConcurrency: number;
  readonly timeoutMs: number;
  readonly retryBudget: number;
  readonly pluginWhitelist: readonly string[];
}

export interface RuntimeRecordWire {
  readonly namespace: string;
  readonly phases: readonly string[];
  readonly startedAt: number;
  readonly config: RuntimeConfigWire;
}

export const parseRuntimeConfig = (candidate: unknown): OrchestrationRuntimeConfig => {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('runtime config requires object');
  }

  const candidateRecord = candidate as Record<string, unknown>;
  const whitelist = Array.isArray(candidateRecord.pluginWhitelist) ? candidateRecord.pluginWhitelist : [];

  return {
    maxConcurrency: ensurePositiveNumber(candidateRecord.maxConcurrency, 'maxConcurrency'),
    timeoutMs: ensurePositiveNumber(candidateRecord.timeoutMs, 'timeoutMs'),
    retryBudget: ensureNumber(candidateRecord.retryBudget, 'retryBudget'),
    namespace: ensureNamespace(candidateRecord.namespace),
    pluginWhitelist: whitelist.filter((value): value is `stage:${string}` =>
      typeof value === 'string' && value.startsWith('stage:'),
    ),
  };
};

export const parseRuntimeRecord = async (
  candidate: unknown,
): Promise<{
  readonly namespace: RuntimeNamespace;
  readonly phases: readonly OrchestratorPhase[];
  readonly startedAt: number;
  readonly config: OrchestrationRuntimeConfig;
}> => {
  const record = ensureRecord(candidate);
  return {
    namespace: ensureNamespace(record.namespace),
    phases: ensurePhases(record.phases),
    startedAt: ensureNumber(record.startedAt, 'startedAt'),
    config: parseRuntimeConfig(record.config),
  };
};

export const DEFAULT_RECORD = {
  namespace: 'namespace:recovery-default',
  phases: ORCHESTRATION_PHASES,
  startedAt: Date.now(),
  config: {
    namespace: 'recovery-default',
    maxConcurrency: 12,
    timeoutMs: 30_000,
    retryBudget: 4,
    pluginWhitelist: ['stage:intake', 'stage:validate', 'stage:plan', 'stage:execute', 'stage:verify', 'stage:finalize'],
  },
} as const satisfies RuntimeRecordWire;

export const DEFAULT_RUNTIME_CONFIG = parseRuntimeConfig(DEFAULT_RECORD.config);

export function normalizeConfig(config: OrchestrationRuntimeConfig): Readonly<OrchestrationRuntimeConfig> {
  return {
    maxConcurrency: Math.max(1, Math.min(config.maxConcurrency, 64)),
    timeoutMs: Math.max(100, config.timeoutMs),
    retryBudget: Math.max(0, Math.min(config.retryBudget, 10)),
    namespace: config.namespace,
    pluginWhitelist: [...config.pluginWhitelist],
  };
}

export function summarizeConfig(config: OrchestrationRuntimeConfig): DeepReadonly<{
  namespace: RuntimeNamespace;
  pluginCount: number;
  hasSecurityStages: boolean;
}> {
  return {
    namespace: config.namespace,
    pluginCount: config.pluginWhitelist.length,
    hasSecurityStages: config.pluginWhitelist.includes('stage:validate'),
  };
}

function ensureRecord(candidate: unknown): RuntimeRecordWire {
  if (candidate === null || typeof candidate !== 'object') {
    throw new Error('runtime record expects object');
  }
  const record = candidate as Record<string, unknown>;
  if (!('namespace' in record && 'phases' in record && 'startedAt' in record && 'config' in record)) {
    throw new Error('invalid runtime record');
  }

  const wireRecord = {
    namespace: ensureString(record.namespace, 'namespace'),
    phases: ensureStringArray(record.phases, 'phases'),
    startedAt: ensureNumber(record.startedAt, 'startedAt'),
    config: ensureRecordLike(record.config, 'config'),
  } as unknown;

  return wireRecord as RuntimeRecordWire;
}

function ensureStringArray(candidate: unknown, label: string): readonly string[] {
  if (!Array.isArray(candidate) || candidate.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${label} must be string[]`);
  }
  return candidate;
}

function ensureString(candidate: unknown, label: string): string {
  if (typeof candidate !== 'string') {
    throw new Error(`${label} must be string`);
  }
  return candidate;
}

function ensureNumber(candidate: unknown, label: string): number {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new Error(`${label} must be number`);
  }
  return candidate;
}

function ensurePositiveNumber(candidate: unknown, label: string): number {
  const value = ensureNumber(candidate, label);
  return Math.max(1, Math.floor(value));
}

function ensureRecordLike(candidate: unknown, label: string): Record<string, unknown> {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`${label} must be object`);
  }
  return candidate as Record<string, unknown>;
}

function ensurePhases(phases: unknown): readonly OrchestratorPhase[] {
  const values = ensureStringArray(phases, 'phases');
  const filtered = values.filter((value): value is OrchestratorPhase =>
    ORCHESTRATION_PHASES.includes(value as OrchestratorPhase),
  );
  if (filtered.length === 0) {
    throw new Error('phases must include known orchestrator phases');
  }
  return filtered;
}

function ensureNamespace(candidate: unknown): RuntimeNamespace {
  const raw = ensureString(candidate, 'namespace');
  return `namespace:${raw.replace(/^namespace:/, '')}` as RuntimeNamespace;
}
