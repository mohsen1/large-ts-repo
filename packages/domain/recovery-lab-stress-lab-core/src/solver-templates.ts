import type { Brand, NoInfer } from '@shared/type-level';

export type TemplateMode = 'alpha' | 'beta' | 'gamma' | 'omega';
export type TemplateId = Brand<string, 'TemplateId'>;
export type TemplateKey = `${TemplateMode}:${string}`;
export type TemplateTag = `tag:${string}`;

export interface TemplateInput<TMode extends TemplateMode = TemplateMode> {
  readonly mode: TMode;
  readonly id: TemplateId;
  readonly key: TemplateKey;
  readonly tag: TemplateTag;
  readonly weights: readonly number[];
}

export interface TemplateOutput<TMode extends TemplateMode = TemplateMode> {
  readonly mode: TMode;
  readonly id: TemplateId;
  readonly checksum: Brand<string, 'TemplateChecksum'>;
  readonly steps: ReadonlyArray<`step:${string}`>;
  readonly payload: Readonly<Record<string, number>>;
}

export type TemplateMap<TInput extends readonly TemplateInput[]> = {
  [K in TInput[number] as K['key'] & string]: {
    readonly mode: K['mode'];
    readonly id: K['id'];
  };
};

export type ExpandTemplate<TInput extends TemplateInput> =
  TInput['key'] extends `${infer Prefix}:${infer Tail}`
    ? { readonly prefix: Prefix; readonly tail: Tail }
    : never;

export type MutateTemplate<
  TInput extends Record<string, unknown>,
  TPaths extends readonly string[],
  TAcc = { readonly [key: string]: string },
> = TPaths extends readonly [infer Head, ...infer Tail]
  ? Head extends keyof TInput
    ? MutateTemplate<TInput, Extract<Tail, readonly string[]>, TAcc & { [K in Extract<Head, string>]: `${K}:${string}` }>
    : MutateTemplate<TInput, Extract<Tail, readonly string[]>, TAcc>
  : TAcc;

export type BuildTemplateObject<
  TItems extends readonly string[],
  TAcc extends Record<string, string> = {},
> = TItems extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? BuildTemplateObject<Extract<Tail, readonly string[]>, TAcc & { readonly [K in Head]: `value:${K}` }>
    : TAcc
  : TAcc;

export interface TemplateAccumulator<TValue> {
  readonly raw: TValue;
  readonly checks: number;
}

export type TemplateUnion<TInput extends string[]> = TInput[number] | `${TInput[number]}:${TInput[number]}`;
export type TemplateIntersection<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head & TemplateIntersection<Tail>
  : {};

export type ConstraintPair<TA, TB> = TA extends TB ? true : false;

export type SolverTemplatePair<
  A extends TemplateInput,
  B extends TemplateInput,
> = ConstraintPair<A['mode'], B['mode']> extends true
  ? {
      readonly primary: A;
      readonly secondary: B;
      readonly bridge: `${A['mode']}-${B['mode']}`;
    }
  : never;

const templateBase = (mode: TemplateMode): TemplateId => `template:${mode}:${Date.now()}` as TemplateId;
const templateTag = (index: number): TemplateTag => `tag:${String(index).padStart(4, '0')}` as TemplateTag;

export const templateInputs = [
  { mode: 'alpha', id: templateBase('alpha'), key: 'alpha:route', tag: templateTag(0), weights: [1, 2, 3] },
  { mode: 'beta', id: templateBase('beta'), key: 'beta:mesh', tag: templateTag(1), weights: [2, 3, 5, 8] },
  { mode: 'gamma', id: templateBase('gamma'), key: 'gamma:lane', tag: templateTag(2), weights: [5, 8, 13] },
  { mode: 'omega', id: templateBase('omega'), key: 'omega:chain', tag: templateTag(3), weights: [13, 21, 34] },
] as const satisfies readonly TemplateInput[];

const templateMap = templateInputs.reduce<Record<string, TemplateInput>>((acc, input) => {
  acc[input.key] = input;
  return acc;
}, {});

export const templateMapLookup = (key: TemplateKey): TemplateInput | undefined => templateMap[key];

export const mapTemplate = <T extends readonly TemplateInput[]>(
  inputs: T,
): TemplateMap<T> => {
  const output = {} as {
    [K in T[number] as K['key'] & string]: {
      readonly mode: K['mode'];
      readonly id: K['id'];
    };
  };
  for (const input of inputs) {
    (output as Record<string, { readonly mode: TemplateMode; readonly id: TemplateId }>)[input.key] = {
      mode: input.mode,
      id: input.id,
    };
  }
  return output as TemplateMap<T>;
};

export const computeTemplateSteps = (input: TemplateInput, fallback: readonly string[] = []): ReadonlyArray<`step:${string}`> => {
  const steps = [`step:${input.mode}:${input.id}`, ...input.weights.map((value) => `step:${value}`)] as const;
  return [...steps, ...fallback] as ReadonlyArray<`step:${string}`>;
};

export const resolveTemplateOutput = <TInput extends TemplateInput>(
  input: TInput,
): TemplateOutput<TInput['mode']> => {
  const payload = input.weights.reduce<Record<string, number>>((acc, current, index) => {
    acc[`weight-${index}`] = current;
    return acc;
  }, {});
  return {
    mode: input.mode,
    id: input.id,
    checksum: `${input.key}:${input.weights.length}` as Brand<string, 'TemplateChecksum'>,
    steps: computeTemplateSteps(input),
    payload,
  };
};

export const resolveTemplates = (inputs: ReadonlyArray<TemplateInput>): ReadonlyArray<TemplateOutput> => {
  const map = mapTemplate(inputs as TemplateInput[]);
  const routes = Object.keys(map).length + inputs.length;
  const weighted = inputs.map((input) => {
    const output = resolveTemplateOutput(input);
    const checksumLength = output.checksum.length + routes;
    return {
      ...output,
      payload: {
        ...output.payload,
        total: checksumLength,
      },
    } as TemplateOutput;
  });
  return weighted;
};

export const combineTemplates = (
  first: NoInfer<TemplateInput>,
  second: NoInfer<TemplateInput>,
): SolverTemplatePair<TemplateInput, TemplateInput> => {
  return {
    primary: first,
    secondary: second,
    bridge: `${first.mode}-${second.mode}`,
  };
};

export const evaluateTemplates = (
  values: ReadonlyArray<TemplateInput>,
  mode?: TemplateMode,
): ReadonlyArray<TemplateAccumulator<number>> => {
  const prepared = mode ? values.filter((entry) => entry.mode === mode) : values;
  return prepared.map((entry, index) => ({
    raw: index * entry.weights.length,
    checks: index + entry.key.length,
  }));
};

export const buildTemplateIntersection = <T extends readonly TemplateInput[]>(inputs: T): TemplateIntersection<T> => {
  const output = inputs.reduce((acc, input) => {
    return {
      ...acc,
      [input.key]: input.id,
    };
  }, {}) as unknown as TemplateIntersection<T>;
  return output;
};
