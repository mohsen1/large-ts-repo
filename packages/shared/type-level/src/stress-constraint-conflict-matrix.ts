import { Brand, NoInfer } from './patterns';

export type ConstraintTag<T extends string> = Brand<T, 'constraint-tag'>;

export type ConstraintNode<T extends string, U extends `${T}-next`, V extends Record<string, T>> = {
  readonly domain: T;
  readonly bridge: U;
  readonly values: V;
  readonly tag: ConstraintTag<T>;
};

export type ConstraintBundle<
  T extends string,
  U extends `${T}-next`,
  V extends Record<string, T>,
> = {
  readonly alpha: ConstraintNode<T, U, V>;
  readonly beta: ConstraintNode<T, U, V>;
  readonly gamma: ConstraintNode<T, U, V>;
};

export type ConstraintResult<T extends string> = {
  readonly state: 'solved';
  readonly domain: T;
  readonly witness: readonly T[];
  readonly checksum: number;
};

export type ResolveDomain<
  T extends string,
  U extends `${T}-next`,
  V extends Record<string, T>,
> = {
  readonly source: ConstraintBundle<T, U, V>;
  readonly input: {
    readonly domain: T;
    readonly key: keyof V & string;
    readonly payload: Record<keyof V & string, ConstraintTag<T>>;
  };
  readonly tags: readonly ConstraintTag<keyof V & string>[];
};

export const solveConstraint = <T extends string, U extends `${T}-next`, V extends Record<string, T>>(
  config: ResolveDomain<T, U, V>,
  depth: number,
): ConstraintResult<T> => {
  const base: ConstraintResult<T> = {
    state: 'solved',
    domain: config.source.alpha.domain,
    witness: [
      config.source.alpha.domain,
      ...Object.keys(config.source.alpha.values).map((key) => config.source.alpha.values[key as keyof V & string]),
    ] as [T, ...T[]],
    checksum: Object.keys(config.source.alpha.values).length + Object.keys(config.input.payload).length + depth,
  };
  return {
    ...base,
    checksum: base.checksum + (depth > 3 ? 10 : 0),
  };
};

export function inspectConstraint<T extends string, U extends `${T}-next`, V extends Record<string, T>>(
  config: ConstraintBundle<T, U, V>,
  mode: 'strict' | 'loose' = 'strict',
): ConstraintResult<T> {
  const keys = Object.keys(config.alpha.values) as Array<keyof V & string>;
  return {
    state: 'solved',
    domain: config.alpha.domain,
    witness: [config.alpha.domain, ...keys.map((key) => config.alpha.values[key] as T)] as [T, ...T[]],
    checksum: keys.join('|').length + (mode === 'strict' ? 10 : 0),
  };
}

export const routeConstraint = <
  T extends string,
  U extends `${T}-next`,
  V extends Record<string, T>,
  D,
>(
  payload: ConstraintBundle<T, U, V>,
  options: {
    readonly enforce: NoInfer<boolean>;
    readonly depth: NoInfer<number>;
    readonly metadata: D;
  },
): {
  readonly result: ConstraintResult<T>;
  readonly metadata: D;
} => {
  const result = inspectConstraint(payload, options.enforce ? 'strict' : 'loose');
  return {
    result,
    metadata: options.metadata,
  };
};

export const constraintAlpha: ConstraintBundle<'alpha', 'alpha-next', { token: 'alpha' }> = {
  alpha: {
    domain: 'alpha',
    bridge: 'alpha-next',
    values: { token: 'alpha' },
    tag: 'alpha' as ConstraintTag<'alpha'>,
  },
  beta: {
    domain: 'alpha',
    bridge: 'alpha-next',
    values: { token: 'alpha' },
    tag: 'alpha' as ConstraintTag<'alpha'>,
  },
  gamma: {
    domain: 'alpha',
    bridge: 'alpha-next',
    values: { token: 'alpha' },
    tag: 'alpha' as ConstraintTag<'alpha'>,
  },
};

export const constraintBeta: ConstraintBundle<'beta', 'beta-next', { token: 'beta' }> = {
  alpha: {
    domain: 'beta',
    bridge: 'beta-next',
    values: { token: 'beta' },
    tag: 'beta' as ConstraintTag<'beta'>,
  },
  beta: {
    domain: 'beta',
    bridge: 'beta-next',
    values: { token: 'beta' },
    tag: 'beta' as ConstraintTag<'beta'>,
  },
  gamma: {
    domain: 'beta',
    bridge: 'beta-next',
    values: { token: 'beta' },
    tag: 'beta' as ConstraintTag<'beta'>,
  },
};

export const constraintSigma: ConstraintBundle<'sigma', 'sigma-next', { token: 'sigma' }> = {
  alpha: {
    domain: 'sigma',
    bridge: 'sigma-next',
    values: { token: 'sigma' },
    tag: 'sigma' as ConstraintTag<'sigma'>,
  },
  beta: {
    domain: 'sigma',
    bridge: 'sigma-next',
    values: { token: 'sigma' },
    tag: 'sigma' as ConstraintTag<'sigma'>,
  },
  gamma: {
    domain: 'sigma',
    bridge: 'sigma-next',
    values: { token: 'sigma' },
    tag: 'sigma' as ConstraintTag<'sigma'>,
  },
};

export const constraintSuite = [constraintAlpha, constraintBeta, constraintSigma] as const;

export const constraintSolverMatrix = [
  routeConstraint(constraintAlpha, {
    enforce: true,
    depth: 4,
    metadata: {
      suiteSize: 3,
      keys: Object.keys(constraintAlpha.alpha.values),
    },
  }),
  routeConstraint(constraintBeta, {
    enforce: true,
    depth: 4,
    metadata: {
      suiteSize: 3,
      keys: Object.keys(constraintBeta.alpha.values),
    },
  }),
  routeConstraint(constraintSigma, {
    enforce: true,
    depth: 4,
    metadata: {
      suiteSize: 3,
      keys: Object.keys(constraintSigma.alpha.values),
    },
  }),
] as const;

export type ConstraintSolverMatrix = typeof constraintSolverMatrix;

export const constraintGraph: Record<string, string[]> = {
  [constraintAlpha.alpha.domain]: [...inspectConstraint(constraintAlpha).witness],
  [constraintBeta.alpha.domain]: [...inspectConstraint(constraintBeta).witness],
  [constraintSigma.alpha.domain]: [...inspectConstraint(constraintSigma).witness],
};

export const constraintResolution = resolveConstraintGraph('theta', 12);

export function resolveConstraintGraph<T extends string>(domain: T, depth: number) {
  const entries: string[] = [];
  const current: Record<string, true> = { [domain]: true };
  for (let i = 0; i < depth; i += 1) {
    entries.push(`${domain}:${i}`);
  }
  return {
    current,
    entries,
  };
}

export const brandedConstraint = <T extends string>(domain: T, bridge: `${T}-next`) => {
  const token = `${domain}:${bridge}` as ConstraintTag<T>;
  const record: Record<string, ConstraintTag<T>> = { [domain]: token };
  return {
    token,
    record,
  };
};
