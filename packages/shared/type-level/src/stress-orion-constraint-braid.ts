export type ConstraintState = 'idle' | 'pending' | 'active' | 'resolved' | 'error';
export type ConstraintVerb = 'ingest' | 'normalize' | 'compose' | 'resolve' | 'finalize' | 'archive';
export type ConstraintPhase = 'seed' | 'bind' | 'validate' | 'deploy' | 'complete';

export interface ConstraintInput<
  TDomain extends string = string,
  TAction extends string = string,
  TMode extends string = string,
> {
  readonly domain: TDomain;
  readonly action: TAction;
  readonly mode: TMode;
  readonly fingerprint: `${TDomain}:${TAction}:${TMode}`;
}

export interface ConstraintOutput<
  TDomain extends string = string,
  TAction extends string = string,
  TMode extends string = string,
  TResult extends string = string,
> {
  readonly domain: TDomain;
  readonly action: TAction;
  readonly mode: TMode;
  readonly result: TResult;
  readonly state: ConstraintState;
}

export type ConstraintMatrix<
  A extends string,
  B extends string,
  C extends string,
> = {
  readonly domain: A;
  readonly action: B;
  readonly mode: C;
  readonly fingerprint: `${A}:${B}:${C}`;
};

export type ConstraintConflict<
  A extends string,
  B extends string,
  C extends string,
> = A extends B ? true : B extends C ? true : false;

export type ResolveConstraint<T extends ConstraintInput> = T extends {
  domain: infer D extends string;
  action: infer A extends string;
  mode: infer M extends string;
}
  ? ConstraintOutput<D, A, M, `${D}/${A}/${M}`>
  : never;

export type ConstraintBinder<
  TDomain extends string,
  TAction extends string,
  TMode extends string,
> = TDomain extends TAction
  ? {
      readonly same: true;
      readonly link: `${TDomain}-${TAction}-${TMode}`;
    }
  : {
      readonly same: false;
      readonly link: `${TMode}-${TAction}-${TDomain}`;
    };

export type ConstraintChain<
  T extends ConstraintInput,
  N extends number = 12,
> = N extends 0
  ? [ResolveConstraint<T>]
  : [ResolveConstraint<T>, ...ConstraintChain<T, Decrement<N>>];

export type Decrement<T extends number> = [
  never,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  50,
][T];

export type ConstrainedMap<T extends readonly ConstraintInput[]> = {
  readonly [K in keyof T]: {
    readonly input: T[K];
    readonly output: ResolveConstraint<T[K]>;
    readonly binder: ConstraintBinder<T[K]['domain'], T[K]['action'], T[K]['mode']>;
  };
};

export const createConstraint = <
  TDomain extends string,
  TAction extends string,
  TMode extends string,
>(
  domain: TDomain,
  action: TAction,
  mode: TMode,
): ConstraintInput<TDomain, TAction, TMode> => ({
  domain,
  action,
  mode,
  fingerprint: `${domain}:${action}:${mode}`,
});

export const materializeOutput = <T extends ConstraintInput>(
  input: T,
): ConstraintOutput<T['domain'], T['action'], T['mode'], `${T['domain']}/${T['action']}/${T['mode']}`> => ({
  domain: input.domain,
  action: input.action,
  mode: input.mode,
  result: `${input.domain}/${input.action}/${input.mode}`,
  state: 'resolved',
});

export const isConflicting = <TInput extends ConstraintInput>(
  left: TInput,
  right: TInput,
): boolean => {
  return left.domain === right.action || left.action === right.mode || left.mode === right.domain;
};

export const filterConflicts = <T extends readonly ConstraintInput[]>(
  inputs: T,
): {
  readonly constraints: ConstrainedMap<T>;
  readonly conflicts: boolean;
  readonly links: readonly string[];
} => {
  const links: string[] = [];
  let conflicts = false;

  for (const current of inputs) {
    for (const probe of inputs) {
      if (current === probe) {
        continue;
      }
      if (isConflicting(current, probe)) {
        conflicts = true;
        links.push(`${current.fingerprint}::${probe.fingerprint}`);
      }
    }
  }

  return {
    constraints: inputs.map((input) => ({
      input,
      output: materializeOutput(input),
      binder: (input.domain === input.action
        ? { same: true, link: `${input.domain}-${input.action}-${input.mode}` }
        : { same: false, link: `${input.mode}-${input.action}-${input.domain}` }) as unknown as ConstraintBinder<
        typeof input.domain,
        typeof input.action,
        typeof input.mode
      >,
    })) as ConstrainedMap<T>,
    conflicts,
    links,
  };
};

export const braid = <T extends ConstraintInput[]>(
  ...inputs: T
): {
  readonly matrix: ConstraintChain<ConstraintInput>;
  readonly byPhase: ReadonlyMap<ConstraintPhase, ConstraintInput[]>;
} => {
  const map = new Map<ConstraintPhase, ConstraintInput[]>();
  const phases: ConstraintPhase[] = ['seed', 'bind', 'validate', 'deploy', 'complete'];
  for (const phase of phases) {
    map.set(phase, []);
  }

  for (const input of inputs) {
    if (input.action.includes('ing')) {
      map.get('seed')?.push(input);
      map.get('bind')?.push(input);
    } else if (input.action.includes('norm')) {
      map.get('validate')?.push(input);
    } else if (input.action.includes('comp')) {
      map.get('deploy')?.push(input);
    } else {
      map.get('complete')?.push(input);
    }
  }

  return {
    matrix: [] as unknown as ConstraintChain<ConstraintInput>,
    byPhase: map,
  };
  };

export type ConstraintBundle<T extends ConstraintInput[]> = {
  readonly origin: ConstraintInput;
  readonly linked: ConstrainedMap<T>;
  readonly resolved: ConstraintOutput<T[number]['domain'], T[number]['action'], T[number]['mode'], `${T[number]['domain']}/${T[number]['action']}/${T[number]['mode']}`>;
};

export const compileBundle = <T extends ConstraintInput[]>(inputs: T): ConstraintBundle<T> => {
  const linked = filterConflicts(inputs).constraints;
  const origin = inputs[0]!;
  const resolved = materializeOutput(origin);
  return {
    origin,
    linked,
    resolved,
  };
};
