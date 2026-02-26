import type { Brand, NoInfer } from '@shared/type-level';
import { mapWithIteratorHelpers } from '@shared/type-level';

export interface TypedFactoryInput<TId extends string, TPayload = unknown> {
  readonly id: Brand<TId, 'factory-id'>;
  readonly payload: TPayload;
}

export interface TypedFactoryResult<TPayload> {
  readonly ok: boolean;
  readonly payload: TPayload;
  readonly tags: readonly string[];
}

export type FactoryMode = 'read' | 'write' | 'execute' | 'plan' | 'simulate';

export interface FactoryContext<TMode extends FactoryMode = FactoryMode> {
  readonly mode: TMode;
  readonly contextId: Brand<string, 'ctx'>;
}

export type ConstraintPayload<
  TMode extends FactoryMode,
  TPayload,
  TId extends string,
  TCtx extends FactoryContext<TMode>,
> = TMode extends 'read'
  ? { readonly mode: TMode; readonly input: TypedFactoryInput<TId, TPayload>; readonly ctx: TCtx }
  : TMode extends 'write'
    ? { readonly mode: TMode; readonly input: TypedFactoryInput<TId, TPayload>; readonly ctx: TCtx; readonly overwrite: true }
    : TMode extends 'execute'
      ? { readonly mode: TMode; readonly input: TypedFactoryInput<TId, TPayload>; readonly ctx: TCtx; readonly runAt: Date }
      : TMode extends 'plan'
        ? { readonly mode: TMode; readonly input: TypedFactoryInput<TId, TPayload>; readonly ctx: TCtx; readonly horizon: number }
        : { readonly mode: TMode; readonly input: TypedFactoryInput<TId, TPayload>; readonly ctx: TCtx; readonly horizon: number };

export const factorySignature = <
  TMode extends FactoryMode,
  TPayload,
  TId extends string,
  TCtx extends FactoryContext<TMode>,
>(payload: ConstraintPayload<TMode, TPayload, TId, TCtx>): TypedFactoryResult<TPayload> => {
  return {
    ok: payload.mode !== 'write' || payload.input.payload != null,
    payload: payload.input.payload,
    tags: [payload.mode, payload.ctx.mode, payload.input.id],
  };
};

export function createFactory<TMode extends 'read', TId extends string, TPayload>(
  value: ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>,
): TypedFactoryResult<TPayload>;
export function createFactory<TMode extends 'write', TId extends string, TPayload>(
  value: ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>,
): TypedFactoryResult<TPayload>;
export function createFactory<TMode extends 'execute', TId extends string, TPayload>(
  value: ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>,
): TypedFactoryResult<TPayload>;
export function createFactory<TMode extends 'plan', TId extends string, TPayload>(
  value: ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>,
): TypedFactoryResult<TPayload>;
export function createFactory<TMode extends 'simulate', TId extends string, TPayload>(
  value: ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>,
): TypedFactoryResult<TPayload>;
export function createFactory<TMode extends FactoryMode, TId extends string, TPayload>(
  value: ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>,
): TypedFactoryResult<TPayload>;
export function createFactory<TMode extends FactoryMode, TId extends string, TPayload>(
  value: ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>,
): TypedFactoryResult<TPayload> {
  return {
    ok: value.mode !== 'write' || value.input.payload != null,
    payload: value.input.payload,
    tags: ['factory', value.mode, value.input.id],
  };
}

export const runFactoryMatrix = (): readonly TypedFactoryResult<unknown>[] => {
  const ctx = (mode: FactoryMode): FactoryContext<FactoryMode> => ({ mode, contextId: `${mode}:ctx` as Brand<string, 'ctx'> });
  const results = [
    createFactory({ mode: 'read', input: { id: 'a' as Brand<'a', 'factory-id'>, payload: { a: 1 } }, ctx: ctx('read') }),
    createFactory({ mode: 'write', input: { id: 'b' as Brand<'b', 'factory-id'>, payload: { b: 2 }, }, ctx: ctx('write'), overwrite: true }),
    createFactory({ mode: 'execute', input: { id: 'c' as Brand<'c', 'factory-id'>, payload: [1, 2, 3] }, ctx: ctx('execute'), runAt: new Date('2024-01-01T00:00:00Z') }),
    createFactory({ mode: 'plan', input: { id: 'd' as Brand<'d', 'factory-id'>, payload: new Set([1, 2, 3]) }, ctx: ctx('plan'), horizon: 30 }),
    createFactory({ mode: 'simulate', input: { id: 'e' as Brand<'e', 'factory-id'>, payload: 'simulate' }, ctx: ctx('simulate'), horizon: 12 }),
  ];
  return mapWithIteratorHelpers(results, (result) => result);
};

export const dispatchFactories = async <
  TMode extends FactoryMode,
  TId extends string,
  TPayload,
>(payloads: readonly NoInfer<ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>>[]): Promise<readonly TypedFactoryResult<TPayload>[]> => {
  const output: TypedFactoryResult<TPayload>[] = [];
  for await (const value of payloads) {
    const result = factorySignature(value);
    output.push(result);
  }
  return output;
};

export const reduceFactory = <TMode extends FactoryMode, TId extends string, TPayload>(
  payloads: readonly ConstraintPayload<TMode, TPayload, TId, FactoryContext<TMode>>[],
): { readonly passed: number; readonly failed: number; readonly values: readonly TPayload[] } => {
  let passed = 0;
  let failed = 0;
  const values = new Array<TPayload>();

  for (const payload of payloads) {
    const result = createFactory(payload);
    if (result.ok) {
      passed += 1;
      values.push(result.payload);
    } else {
      failed += 1;
    }
  }

  return { passed, failed, values };
};

export const makePlanPayload = <T extends string, P>(id: T, payload: P): ConstraintPayload<'plan', P, T, FactoryContext<'plan'>> => ({
  mode: 'plan',
  input: { id: id as Brand<T, 'factory-id'>, payload },
  ctx: { mode: 'plan', contextId: `${id}:ctx` as Brand<string, 'ctx'> },
  horizon: 120,
});

export const executePlan = (id: string): TypedFactoryResult<unknown> => {
  const payload = makePlanPayload(id, { steps: ['collect', 'process', 'complete'] });
  return createFactory(payload);
};

export const genericFactoryBench = {
  read: createFactory({ mode: 'read', input: { id: 'r1' as Brand<'r1', 'factory-id'>, payload: 100 }, ctx: { mode: 'read', contextId: 'r1:ctx' as Brand<string, 'ctx'> } }),
  write: createFactory({
    mode: 'write',
    input: { id: 'w1' as Brand<'w1', 'factory-id'>, payload: { status: 'ok' } },
    ctx: { mode: 'write', contextId: 'w1:ctx' as Brand<string, 'ctx'> },
    overwrite: true,
  }),
  exec: createFactory({
    mode: 'execute',
    input: { id: 'e1' as Brand<'e1', 'factory-id'>, payload: [true, false] },
    ctx: { mode: 'execute', contextId: 'e1:ctx' as Brand<string, 'ctx'> },
    runAt: new Date(),
  }),
};
