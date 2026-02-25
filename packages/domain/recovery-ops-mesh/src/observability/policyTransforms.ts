import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import { type Brand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import type { MeshPayloadFor, MeshSignalKind } from '../types';

export type TransformKind = 'identity' | 'scale' | 'filter' | 'enrich' | 'project';
export type TransformId<T extends string = string> = Brand<string, `mesh-transform:${T}`>;
export type TransformPath<T extends string = string> = `transform.${T}`;

export type TransformPhase = 'pre' | 'core' | 'post';

export type InputSignalPayload<TKind extends MeshSignalKind> = MeshPayloadFor<TKind>['payload'];

export type OutputTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly unknown[]
    ? readonly [Head, ...OutputTuple<Tail>]
    : readonly [Head]
  : readonly [];

type WrappedPayload<TSignals extends readonly MeshSignalKind[]> = {
  [Kind in TSignals[number] as `in:${Kind}`]: {
    readonly kind: Kind;
    readonly payload: InputSignalPayload<Kind>;
  };
};

export interface PolicyTransform<TKind extends MeshSignalKind = MeshSignalKind, TName extends TransformKind = TransformKind> {
  readonly id: TransformId<TName>;
  readonly name: TransformKind;
  readonly phase: TransformPhase;
  readonly supports: readonly TKind[];
  readonly metadata: Readonly<Record<string, unknown>>;
  apply(input: MeshPayloadFor<TKind>): MeshPayloadFor<TKind>;
}

export interface TransformChain<TTransforms extends readonly PolicyTransform[]> {
  readonly id: Brand<string, 'mesh-transform-chain'>;
  readonly path: readonly TransformPath[];
  readonly transforms: readonly PolicyTransform[];
  readonly createdAt: number;
}

export type MapTransformsByPhase<TTransforms extends readonly PolicyTransform[]> = {
  [TPhase in TransformPhase]: PolicyTransform[];
};

export type TransformResult<TTransform extends PolicyTransform> = TTransform extends PolicyTransform<
  infer TKind,
  infer TName
>
  ? {
      readonly transform: TName;
      readonly kind: TKind;
      readonly payload: MeshPayloadFor<TKind>;
    }
  : never;

export type WrappedChainResult<TTransforms extends readonly PolicyTransform[]> = {
  [Index in keyof TTransforms]: TransformResult<TTransforms[Index]>;
};

type TransformInput<TPayload> = Readonly<{
  readonly payload: TPayload;
  readonly at: number;
  readonly trace: readonly string[];
}>;

const defaultMetadata = {
  owner: 'mesh',
  namespace: 'mesh-policy-transform',
} as const;

const buildId = <TName extends string>(name: TName): TransformId<TName> =>
  withBrand(`transform-${name}-${randomUUID()}`, `mesh-transform:${name}`);

const normalizeKind = (value: MeshSignalKind): string => `${value}`;

const toKindPath = (kind: MeshSignalKind): TransformPath => `transform.${normalizeKind(kind)}`;

const defaultChainPath = ['transform.pre', 'transform.core', 'transform.post'] as const satisfies readonly TransformPath[];

export const createIdentityTransform = <TKind extends MeshSignalKind>(
  phase: TransformPhase,
  kind: TKind,
): PolicyTransform<TKind, 'identity'> => ({
  id: buildId('identity'),
  name: 'identity',
  phase,
  supports: [kind],
  metadata: defaultMetadata,
  apply: (input) => input as MeshPayloadFor<TKind>,
});

export const createScaleTransform = <TKind extends MeshSignalKind>(
  phase: TransformPhase,
  kind: TKind,
  multiplier: number,
): PolicyTransform<TKind, 'scale'> => ({
  id: buildId('scale'),
  name: 'scale',
  phase,
  supports: [kind],
  metadata: { ...defaultMetadata, multiplier },
  apply: (input) => {
    if (kind === 'pulse') {
      return {
        kind: 'pulse',
        payload: {
          value: (input.payload as { readonly value: number }).value * Math.max(0, multiplier),
        },
      } as MeshPayloadFor<TKind>;
    }

    if (kind === 'telemetry') {
      const payload = input.payload as { readonly metrics: Record<string, number> };
      return {
        kind: 'telemetry',
        payload: {
          metrics: Object.fromEntries(
            Object.entries(payload.metrics).map(([key, value]) => [
              key,
              value * Math.max(0, multiplier),
            ]),
          ) as Record<string, number>,
        },
      } as MeshPayloadFor<TKind>;
    }

    return input as MeshPayloadFor<TKind>;
  },
});

export const createFilterTransform = <TKind extends MeshSignalKind>(
  phase: TransformPhase,
  kind: TKind,
  threshold: number,
): PolicyTransform<TKind, 'filter'> => ({
  id: buildId('filter'),
  name: 'filter',
  phase,
  supports: [kind],
  metadata: { ...defaultMetadata, threshold },
  apply: (input) => {
    if (kind === 'alert' && (input.payload as { readonly severity: 'critical' | 'high' | 'low' | 'normal' }).severity === 'critical' && threshold <= 0) {
      return input as MeshPayloadFor<TKind>;
    }
    if (kind === 'snapshot' && threshold > 0) {
      return {
        kind: 'snapshot',
        payload: input.payload,
      } as MeshPayloadFor<TKind>;
    }
    return input as MeshPayloadFor<TKind>;
  },
});

export const createEnrichTransform = <TKind extends MeshSignalKind>(
  phase: TransformPhase,
  kind: TKind,
): PolicyTransform<TKind, 'enrich'> => ({
  id: buildId('enrich'),
  name: 'enrich',
  phase,
  supports: [kind],
  metadata: defaultMetadata,
  apply: (input) => ({
    ...input,
    payload: {
      ...(typeof input.payload === 'object' ? (input.payload as Record<string, unknown>) : {}),
      enrichedAt: Date.now(),
    },
  } as unknown as MeshPayloadFor<TKind>),
});

export const createProjectTransform = <TKind extends MeshSignalKind>(
  phase: TransformPhase,
  kind: TKind,
  fields: readonly string[],
): PolicyTransform<TKind, 'project'> => ({
  id: buildId('project'),
  name: 'project',
  phase,
  supports: [kind],
  metadata: { ...defaultMetadata, fields: [...fields] },
  apply: (input) => {
    if (typeof input.payload !== 'object' || input.payload === null) {
      return input as MeshPayloadFor<TKind>;
    }

    const projected = Object.fromEntries(
      fields
        .map((field) => [field, (input.payload as Record<string, unknown>)[field]])
        .filter((entry): entry is [string, unknown] => entry[1] !== undefined),
    );

    return {
      ...input,
      payload: projected as Record<string, unknown>,
    } as MeshPayloadFor<TKind>;
  },
});

export const buildTransformChain = <
  const TTransforms extends readonly PolicyTransform[],
  TSuppports extends readonly MeshSignalKind[],
>(
  id: string,
  transforms: TTransforms,
  supports: TSuppports,
) => {
  const chain = {
    id: withBrand(`transform-chain-${id}`, 'mesh-transform-chain'),
    path: [...defaultChainPath],
    transforms: transforms as readonly PolicyTransform[],
    createdAt: Date.now(),
  } satisfies TransformChain<TTransforms>;

  const supportMap = emptyWrappedPayload(supports);
  const map = new Map<TransformPath, PolicyTransform>();

  for (const transform of chain.transforms) {
    const key = toKindPath(transform.supports[0] as MeshSignalKind);
    const mapped = (supportMap as Record<string, MeshPayloadFor<MeshSignalKind>>)[key];
    map.set(key, transform);
    void mapped;
  }

  return {
    chain,
    supports: supportMap,
  };
};

const emptyWrappedPayload = <TSignals extends readonly MeshSignalKind[]>(
  signals: NoInfer<TSignals>,
): WrappedPayload<TSignals> => {
  const out = {} as Record<string, { kind: MeshSignalKind; payload: unknown }>;
  for (const signal of signals) {
    if (signal === 'pulse') {
      out[`in:${signal}`] = {
        kind: signal,
        payload: { value: 0 },
      };
    } else if (signal === 'snapshot') {
      out[`in:${signal}`] = {
        kind: signal,
        payload: { nodes: [], links: [], id: 'seed', name: 'seed', version: '1.0.0', createdAt: Date.now() },
      };
    } else if (signal === 'alert') {
      out[`in:${signal}`] = {
        kind: signal,
        payload: { severity: 'low', reason: 'seed' },
      };
    } else {
      out[`in:${signal}`] = {
        kind: signal,
        payload: { metrics: { seed: 0 } },
      };
    }
  }

  return out as WrappedPayload<TSignals>;
};

export interface TransformExecutionOutput<TTransforms extends readonly PolicyTransform[]> {
  readonly chainId: TransformChain<TTransforms>['id'];
  readonly outputs: readonly TransformResult<PolicyTransform>[];
  readonly phaseBuckets: MapTransformsByPhase<TTransforms>;
  readonly path: readonly TransformPath[];
}

export const executeTransforms = <TTransforms extends readonly PolicyTransform[], TSignal extends MeshSignalKind>(
  chain: TransformChain<TTransforms>,
  kind: TSignal,
  signal: MeshPayloadFor<TSignal>,
) => {
  const phaseBuckets = chain.transforms.reduce((acc, transform) => {
    const phase = transform.phase;
    acc[phase].push(transform);
    return acc;
  }, {
    pre: [],
    core: [],
    post: [],
  } as MapTransformsByPhase<TTransforms>);

  const outputs = chain.transforms.map((transform) => {
    const current = transform.apply(signal as never) as MeshPayloadFor<TSignal>;
    return {
      transform: transform.name,
      kind: current.kind,
      payload: current,
    } as unknown as TransformResult<PolicyTransform>;
  });

  return {
    chainId: chain.id,
    outputs: outputs as readonly TransformResult<PolicyTransform>[],
    phaseBuckets,
    path: chain.path,
  } satisfies TransformExecutionOutput<TTransforms>;
};

export const mergeChainPayload = <TTransforms extends readonly PolicyTransform[], TInput extends MeshPayloadFor<MeshSignalKind>>(
  chain: TransformChain<TTransforms>,
  input: NoInfer<TInput>,
  meta: TransformInput<TInput['payload']>,
): TransformExecutionOutput<TTransforms> => {
  const seed = executeTransforms(chain, input.kind as MeshSignalKind, input) as TransformExecutionOutput<TTransforms>;
  return {
    ...seed,
    path: [...seed.path, ...meta.trace.map((entry) => `merge.${entry}`)] as readonly TransformPath[],
  };
};

export const appendTransform = <TTransforms extends readonly PolicyTransform[]>(
  chain: TransformChain<TTransforms>,
  transform: PolicyTransform,
) =>
  ({
    ...chain,
    transforms: [...chain.transforms, transform] as readonly PolicyTransform[],
    path: [...chain.path, toKindPath(transform.supports[0] ?? 'pulse')] as readonly TransformPath[],
  }) as unknown as TransformChain<OutputTuple<[...TTransforms, PolicyTransform]>>;
