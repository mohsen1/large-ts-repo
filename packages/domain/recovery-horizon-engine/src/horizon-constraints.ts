import { z } from 'zod';
import type { Brand, NoInfer, RecursivePath } from '@shared/type-level';
import type {
  HorizonInput,
  HorizonSignal,
  JsonLike,
  PluginConfig,
  PluginContract,
  PluginStage,
  RunId,
  TimeMs,
} from './types.js';
import { horizonBrand } from './types.js';

export type ConstraintLevel = 'strict' | 'relaxed' | 'disabled';
export type ConstraintId = Brand<string, 'horizon-constraint'>;
export type ConstraintLabel<T extends string> = `${T}/constraint`;

export interface ConstraintContext {
  readonly tenantId: string;
  readonly runId: RunId;
  readonly stage: PluginStage;
  readonly issuedAt: TimeMs;
}

export interface ConstraintPayloadShape {
  readonly stage: PluginStage;
  readonly code: string;
  readonly tags: readonly string[];
  readonly metrics: {
    readonly latencyMs: number;
    readonly latencyBudgetMs: number;
  };
}

export type ConstraintPayload<T extends string> = {
  readonly stage: PluginStage;
  readonly code: T;
  readonly tags: readonly string[];
  readonly path: RecursivePath<ConstraintPayloadShape>;
};

export interface ConstraintError<TCode extends string = string> {
  readonly id: ConstraintId;
  readonly code: TCode;
  readonly level: ConstraintLevel;
  readonly message: string;
  readonly payload: ConstraintPayload<TCode>;
  readonly context: ConstraintContext;
}

export interface ConstraintSpec<TCode extends string = string, TPayload = unknown> {
  readonly id: ConstraintId;
  readonly code: TCode;
  readonly level: ConstraintLevel;
  readonly description: string;
  readonly validate: (input: TPayload, context: ConstraintContext) => boolean;
}

export type ConstraintMap<T extends readonly ConstraintSpec[]> = {
  [Spec in T[number] as ConstraintLabel<Spec['code']>]: Spec;
};

export type ConstraintSet<TSpec extends readonly ConstraintSpec[]> = {
  readonly entries: TSpec;
  readonly policies: Record<string, {
    readonly enabled: boolean;
    readonly level: ConstraintLevel;
    readonly weight: number;
  }>;
};

export type ConstraintResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: readonly ConstraintError[] };

export type ConstraintEnvelope<TKind extends PluginStage, TPayload = JsonLike> = {
  readonly stage: TKind;
  readonly input: HorizonInput<TKind>;
  readonly signal: HorizonSignal<TKind, TPayload>;
};

const constraintSchema = z.object({
  id: z.string(),
  code: z.string(),
  level: z.enum(['strict', 'relaxed', 'disabled']),
  description: z.string(),
});

const makeConstraintId = (value: string): ConstraintId =>
  `constraint:${value}` as ConstraintId;

export const makeConstraintPayload = <TCode extends string = string>(
  spec: ConstraintSpec<TCode>,
  context: ConstraintContext,
): ConstraintPayload<TCode> => ({
  stage: context.stage,
  code: spec.code,
  tags: ['runtime', spec.code, context.stage],
  path: 'stage' as RecursivePath<ConstraintPayloadShape>,
});

export const constraintFromSpec = (code: string, description: string, level: ConstraintLevel): ConstraintSpec => {
  const payload = {
    id: makeConstraintId(code),
    code,
    level,
    description,
  } satisfies Omit<ConstraintSpec, 'validate'>;

  return {
    ...payload,
    validate: (_input: unknown, _context: ConstraintContext) => {
      if (level === 'disabled') {
        return true;
      }
      if (level === 'relaxed') {
        return code.length > 0;
      }
      return code.length > 2 && description.length > 4;
    },
  };
};

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

export const inferConstraintPayload = <TPayload,>(
  specs: readonly ConstraintSpec[],
  payloads: readonly TPayload[],
): ConstraintResult<{
  readonly passed: readonly TPayload[];
  readonly failed: readonly TPayload[];
}> => {
  const passed: TPayload[] = [];
  const failed: TPayload[] = [];

  for (const payload of payloads) {
    const invalid = specs.some((spec) => {
      const context: ConstraintContext = {
        tenantId: 'tenant-001',
        runId: horizonBrand.fromRunId(`run:${spec.code}`),
        stage: 'analyze',
        issuedAt: now(),
      };
      return !spec.validate(payload as unknown, context);
    });

    if (invalid) {
      failed.push(payload);
    } else {
      passed.push(payload);
    }
  }

  if (!failed.length) {
    return { ok: true, value: { passed, failed } };
  }

  return {
    ok: false,
    errors: failed.map((entry, index) => ({
      id: makeConstraintId(`runtime:${index}`),
      code: 'runtime',
      level: 'strict',
      message: `Constraint failed for payload ${String(entry)}`,
      payload: makeConstraintPayload(constraintFromSpec('runtime', 'runtime-guard', 'strict'), {
        tenantId: 'tenant-001',
        runId: horizonBrand.fromRunId(`run:${entry}` as string),
        stage: 'analyze',
        issuedAt: now(),
      }),
      context: {
        tenantId: 'tenant-001',
        runId: horizonBrand.fromRunId(`run:constraint:${index}`),
        stage: 'analyze',
        issuedAt: now(),
      },
    })),
  };
};

export const buildConstraintSet = <TSpec extends readonly ConstraintSpec[]>(
  specs: NoInfer<TSpec>,
): ConstraintSet<TSpec> => {
  const policies = {} as ConstraintSet<TSpec>['policies'];
  for (const spec of specs) {
    policies[String(spec.id)] = {
      enabled: spec.level !== 'disabled',
      level: spec.level,
      weight: spec.level === 'strict' ? 2 : spec.level === 'relaxed' ? 1 : 0,
    };
  }

  return { entries: specs, policies };
};

export const normalizeConstraintEnvelope = <
  TKind extends PluginStage,
  TPayload extends JsonLike,
>(
  contract: PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>,
  input: HorizonInput<TKind>,
  signal: HorizonSignal<TKind, TPayload>,
): ConstraintEnvelope<TKind, TPayload> => ({
  stage: contract.kind,
  input,
  signal,
});

export const validateEnvelope = <
  TKind extends PluginStage,
  TPayload extends JsonLike,
>(
  envelope: ConstraintEnvelope<TKind, TPayload>,
  specs: readonly ConstraintSpec[],
): ConstraintResult<ConstraintEnvelope<TKind, TPayload>> => {
  const payload: readonly TPayload[] = [envelope.signal.payload];
  const result = inferConstraintPayload(specs, payload);
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  return { ok: true, value: envelope };
};

export const parseConstraint = (raw: string): ConstraintSpec | undefined => {
  const parsed = constraintSchema.parse(JSON.parse(raw));
  return constraintFromSpec(parsed.code, parsed.description, parsed.level);
};

export type InferConstraintCode<T extends readonly ConstraintSpec[]> = T[number]['code'];

export const collectConstraintIds = <T extends readonly ConstraintSpec[]>(
  set: ConstraintSet<T>,
): readonly ConstraintId[] =>
  Object.keys(set.policies).map((entry) => makeConstraintId(entry)) as readonly ConstraintId[];
