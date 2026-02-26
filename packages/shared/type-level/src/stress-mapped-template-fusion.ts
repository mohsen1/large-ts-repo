export type PreserveOptional<T> = {
  [K in keyof T as K extends `legacy-${string}` ? never : K]: T[K];
};

export type PreserveReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

export type MappedTemplateRemap<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? `template_${K}` : never]: T[K];
};

export type DeepRemap<T extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof T as K extends string ? `${Prefix}:${K}` : never]:
    T[K] extends Record<string, unknown>
      ? {
          [P in keyof T[K] as P extends string ? `${K & string}.${P}` : never]:
            T[K][P]
        }
      : T[K];
};

export type FlattenTemplate<T extends Record<string, unknown>> = {
  [K in keyof T & string]:
    T[K] extends readonly (infer Item)[]
      ? Item extends Record<string, unknown>
        ? DeepRemap<Item, K>
        : {
            [P in K]: readonly Item[];
          }
      : T[K] extends Record<string, unknown>
        ? DeepRemap<T[K], K>
        : {
            [P in K]: T[K];
          };
}[keyof T & string];

export type PreserveModifierMap<T> = {
  -readonly [K in keyof T as K extends string ? `readonly_${K}` : never]-?: T[K];
};

export type UnionToEventMap<T extends readonly string[]> = {
  [K in T[number] as K extends `${infer Prefix}-${infer Suffix}`
    ? `${Prefix}/${Suffix}` | K
    : K]: {
      readonly code: K;
      readonly normalized: K extends `${infer Prefix}-${infer Suffix}` ? `${Prefix}::${Suffix}` : K;
    };
};

export type EventRouteMap<TRoute extends string> = TRoute extends `${infer Entity}/${infer Action}/${infer Id}`
  ? {
      readonly route: TRoute;
      readonly entity: Entity;
      readonly action: Action;
      readonly id: Id;
    }
  : never;

export type RouteIndex<T extends readonly string[]> = {
  [Route in T[number]]:
    Route extends string
      ? EventRouteMap<Route>
      : never;
};

export type EventRouteByDomain<T extends Record<string, unknown>> = {
  [Domain in keyof T & string]:
    T[Domain] extends readonly string[]
      ? RouteIndex<T[Domain] & readonly string[]>
      : never;
};

export type NormalizeMappedInput<
  TSource extends Record<string, unknown>,
  TDestination extends Record<string, unknown>,
> = {
  [K in keyof TSource as `${Exclude<K, keyof TDestination> & string}`]: K extends keyof TDestination ? never : TSource[K]
} & {
  [K in keyof TDestination]: PreserveModifierMap<{
    [P in K]: TDestination[K];
  }>
}[keyof TDestination];

export const templateRemap = <
  const T extends Record<string, Record<string, unknown>>,
>(input: T): MappedTemplateRemap<T> => {
  return input as unknown as MappedTemplateRemap<T>;
};

type MatrixInputRoute<T extends Record<string, readonly string[]>> =
  T[keyof T] extends infer BucketRoutes
    ? BucketRoutes extends readonly (infer Route)[] 
      ? Route & string
      : never
    : never;

export const buildTemplateMatrix = <
  const T extends Record<string, readonly string[]>,
>(
  input: T,
): readonly EventRouteMap<MatrixInputRoute<T>>[] => {
  const out = [] as string[];
  for (const routes of Object.values(input) as unknown as string[][]) {
    out.push(...routes);
  }
  return out as unknown as readonly EventRouteMap<MatrixInputRoute<T>>[];
};

export const templateIntersection = <T extends Record<string, unknown>>(
  value: T,
): {
  template: MappedTemplateRemap<T>;
  preserved: PreserveReadonly<T>;
  sanitized: PreserveOptional<T>;
} => ({
  template: value as unknown as MappedTemplateRemap<T>,
  preserved: value as unknown as PreserveReadonly<T>,
  sanitized: value as unknown as PreserveOptional<T>,
});
