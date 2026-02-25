import { z } from 'zod';
import { brandMetricKey, createRunId } from '@domain/recovery-scenario-design';
import {
  isKnownKind,
  describeKind,
  bootstrapCatalog,
  type EventEnvelope,
} from '@shared/scenario-design-kernel';

const StageTemplateInput = z.object({
  id: z.string().min(1),
  kind: z.string(),
  inputShape: z.unknown(),
  outputShape: z.unknown(),
});

export interface ValidationReport {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly checks: readonly string[];
}

export interface StageValidationRecord {
  readonly id: string;
  readonly metric: string;
  readonly reason: string;
}

const validatorSeed = createRunId('template-validation', BigInt(Date.now()));
const catalogPromise = bootstrapCatalog;

export async function validateTemplateEntry(raw: unknown): Promise<ValidationReport> {
  const parsed = StageTemplateInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reasons: parsed.error.issues.map((issue) => issue.message),
      checks: ['schema'],
    };
  }

  const item = parsed.data;
  if (!isKnownKind(item.kind)) {
    return {
      ok: false,
      reasons: [`unknown kind: ${item.kind}`],
      checks: ['catalog'],
    };
  }

  const catalog = await catalogPromise;
  const matched = catalog.find((entry) => entry.kind === item.kind);
  const checks = matched
    ? matched.requirements.map((requirement) => `requires:${requirement}`)
    : ['missing-catalog-entry'];

  return {
    ok: checks.length > 0,
    reasons: [],
    checks,
  };
}

function toRecord(raw: unknown): StageValidationRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry) => {
    const details = typeof entry === 'object' && entry !== null ? entry : {};
    return {
      id: String(details.id ?? 'unknown'),
      metric: brandMetricKey('validation', String(details.kind ?? 'template')).slice(0, 20),
      reason: String(details.ok ?? false),
    };
  });
}

export function inspectValidation(records: StageValidationRecord[]): EventEnvelope<'validation', StageValidationRecord[]> {
  return {
    name: 'validation',
    version: '1.0.0',
    payload: records,
    timestamp: Date.now(),
  };
}

export function validateTemplateList(raw: unknown[]): readonly ValidationReport[] {
  interface NormalizedTemplate {
    readonly metric: string;
    readonly id?: unknown;
    readonly kind?: unknown;
    readonly inputShape?: unknown;
    readonly outputShape?: unknown;
  }

  const bootstrap = raw
    .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object')
    .map((entry): NormalizedTemplate => ({
      ...entry,
      metric: brandMetricKey('list', String(entry.id ?? 'unknown')).slice(0, 32),
    }));

  const checks = ['pre', ...bootstrap.map((entry) => String(entry.metric))];
  const records = toRecord(bootstrap);

  return bootstrap.map((entry) => {
    if (!isKnownKind(String(entry.kind ?? ''))) {
      return {
        ok: false,
        reasons: [`unsupported:${String(entry.kind)}`],
        checks,
      };
    }

    const stageDef = describeKind(String(entry.kind) as any);
    const isSafe = stageDef.cost !== 'high' || String(entry.kind).length > 4;

    return {
      ok: isSafe,
      reasons: isSafe ? [] : ['high-risk-stage-without-approval'],
      checks: [...checks, stageDef.token],
    };
  });
}

export const validationDefaults = {
  validatorSeed,
  passMessage: 'template-verified',
};
