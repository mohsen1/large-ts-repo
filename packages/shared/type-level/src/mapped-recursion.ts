export type TemplateShape<T> = T extends string
  ? `shape:${T}`
  : T extends number
    ? `shape:${T & number}`
    : T extends boolean
      ? `shape:${T & boolean & string}`
      : T extends bigint
        ? `shape:${T & bigint & string}`
        : T extends Array<infer U>
          ? `shape:${U extends string ? 'array' : 'list'}`
          : T extends object
            ? 'shape:object'
            : 'shape:unknown';

export type ModifierAware<T> = {
  -readonly [K in keyof T]: T[K];
};

export type PreserveModifiers<T> = {
  [K in keyof T]: K extends never ? never : T[K];
};

export type RemapKeys<T, Prefix extends string> = {
  [K in keyof T as K extends string ? `${Prefix}/${K}` : never]: T[K];
};

export type RenameKeysWithCase<T, Prefix extends string> = {
  [K in keyof T as K extends string ? `${Uppercase<Prefix>}-${Uppercase<K & string>}` : never]: T[K];
};

export type TemplateRemapLeafs<T, Prefix extends string = 'root'> =
  T extends readonly [infer H, ...infer R]
    ? {
        [K in keyof T as K extends `${infer K1}`
          ? `${Prefix}.${K1}`
          : never]: T[K] extends object
          ? TemplateRemapLeafs<T[K], `${Prefix}.${K & string}`>
          : TemplateShape<T[K]>;
      }
    : T extends readonly unknown[]
      ? {
          [K in keyof T as K extends `${infer K1}` ? `${Prefix}.${K1}` : never]: T[K] extends object
            ? TemplateRemapLeafs<T[K], `${Prefix}.${K & string}`>
            : TemplateShape<T[K]>;
        }
      : T extends object
        ? {
            [K in keyof T as K extends string ? `${Prefix}:${K}` : never]: T[K] extends object
              ? TemplateRemapLeafs<T[K], `${Prefix}-${K & string}`>
              : TemplateShape<T[K]>;
          }
        : {};

export type RecursiveMapWithTemplate<T> = T extends Date | ((...args: any[]) => any)
  ? {}
  : T extends readonly [infer H, ...infer R]
    ? {
        [K in keyof T & `${number}` as `tuple.${K}`]: RecursiveMapWithTemplate<T[K]>;
      } & TemplateRemapLeafs<Readonly<T>, 'tuple'>
    : T extends readonly unknown[]
      ? {
          [K in keyof T & `${number}` as `tuple.${K}`]: RecursiveMapWithTemplate<T[K]>;
        } & TemplateRemapLeafs<Readonly<T>, 'tuple'>
      : T extends Record<string, unknown>
        ? {
            [K in keyof T & string as `${K}`]: T[K] extends Record<string, unknown>
              ? RecursiveMapWithTemplate<T[K]>
              : TemplateShape<T[K]>;
          } & RemapKeys<T, 'base'> & PreserveModifiers<T>
        : { readonly leaf: TemplateShape<T> };

export type DeepTemplateTransform<T> =
  T extends Record<string, unknown>
    ? RecursiveMapWithTemplate<T>
    : T extends readonly unknown[]
      ? RecursiveMapWithTemplate<T>
      : {
          readonly terminal: TemplateShape<T>;
          readonly value: T;
        };

export type MergeTemplateMaps<T extends readonly Record<string, unknown>[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends Record<string, unknown>
      ? Tail extends readonly Record<string, unknown>[]
        ? DeepTemplateTransform<Head> & MergeTemplateMaps<Tail>
        : never
      : never
    : unknown;

export type ExpandTemplateMap<T extends Record<string, unknown>> = {
  [K in keyof T & string as `v1/${K}`]: T[K] extends Record<string, unknown>
    ? {
        [R in keyof T[K] & string as `v2/${R}`]: T[K][R];
      }
    : T[K];
};

export type MappedNestedTemplateMap<T extends Record<string, unknown>> =
  & { readonly [K in keyof T as `root.${Extract<K, string>}`]: T[K] }
  & {
    [K in keyof T & string as `meta.${K}`]: T[K] extends Record<string, unknown>
      ? ExpandTemplateMap<T[K]>
      : T[K];
  };

export const mapRecordTemplate = <T extends Record<string, unknown>>(input: T): MappedNestedTemplateMap<T> => {
  const entries = Object.entries(input) as Array<[string, unknown]>;
  const output = {} as Record<string, unknown>;

  for (const [key, value] of entries) {
    output[`root.${key}`] = value;
    output[`meta.${key}`] = value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of Object.keys(nested)) {
        output[`meta.${key}`] = {
          ...((output[`meta.${key}`] as Record<string, unknown>) ?? {}),
          [`v2/${nestedKey}`]: nested[nestedKey],
        };
      }
    }
  }

  return output as MappedNestedTemplateMap<T>;
};
