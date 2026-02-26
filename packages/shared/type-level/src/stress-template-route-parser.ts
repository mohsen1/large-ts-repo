export type RouteFamily = 'incident' | 'workflow' | 'saga' | 'policy' | 'fabric' | 'chronicle' | 'audit';
export type RouteAction = 'plan' | 'run' | 'pause' | 'cancel' | 'probe' | 'drill' | 'reconcile' | 'observe' | 'dispatch';
export type RouteId = `rid-${string}`;

export type RouteSignature = `${RouteFamily}/${RouteAction}/${RouteId}`;
export type RouteSignatureCatalog = readonly RouteSignature[];

export type ParseRoute<T extends string> = T extends `${infer F}/${infer A}/${infer I}`
  ? {
      readonly family: F;
      readonly action: A;
      readonly id: I;
    }
  : never;

export type RouteByFamily<T> = T extends `${infer Family}/${string}`
  ? Family
  : never;

export type RouteByAction<T> = T extends `${string}/${infer Action}/${string}`
  ? Action
  : never;

export type RouteById<T> = T extends `${string}/${string}/${infer Id}`
  ? Id
  : never;

export type FilterByFamily<T extends string, Family extends RouteFamily> =
  T extends `${Family}/${string}/${string}` ? T : never;

export type RouteNetwork<T extends readonly string[]> = {
  [K in keyof T]: ParseRoute<T[K] & string>;
};

export type RouteUnionFromTemplate<
  TFam extends readonly RouteFamily[],
  TAct extends readonly RouteAction[],
  TId extends RouteId[],
> = TFam[number] extends infer F
  ? TAct[number] extends infer A
    ? TId[number] extends infer I
      ? F extends string
        ? A extends string
          ? I extends string
            ? `${F}/${A}/${I}`
            : never
          : never
        : never
      : never
    : never
  : never;

export type RouteTemplateBindings<T extends RouteSignatureCatalog> = {
  [K in keyof T]: {
    readonly index: K;
    readonly family: RouteByFamily<T[K]>;
    readonly action: RouteByAction<T[K]>;
    readonly id: RouteById<T[K]>;
    readonly raw: T[K];
  };
};

export type RouteConstraintMatrix<
  TSeed extends RouteSignatureCatalog,
  TFam extends RouteFamily,
  TAct extends RouteAction,
> = {
  [K in keyof TSeed]:
    TSeed[K] extends `${TFam}/${TAct}/${string}`
      ? TSeed[K]
      : never;
};

export type InferTemplate<T extends RouteSignature> = T extends `${infer Family}/${infer Action}/${infer Id}`
  ? {
      readonly entity: Family;
      readonly verb: Action;
      readonly payloadId: Id;
      readonly eventName: `${Family}_${Action}_${Id}`;
    }
  : never;

export type TemplatePipeline<
  TInput extends RouteSignature,
  TDepth extends number,
> = TDepth extends 0
  ? InferTemplate<TInput>
  : TemplatePipeline<TInput, 0>;

export const routeCatalog = [
  'incident/plan/rid-100',
  'incident/run/rid-101',
  'saga/probe/rid-102',
  'audit/pause/rid-103',
  'workflow/dispatch/rid-104',
  'policy/run/rid-105',
  'fabric/reconcile/rid-106',
  'chronicle/observe/rid-107',
] as const satisfies RouteSignatureCatalog;

export const parseRoute = <TRoute extends RouteSignature>(route: TRoute): ParseRoute<TRoute> => {
  const [family, action, id] = route.split('/') as unknown as [RouteFamily, RouteAction, RouteId];
  return {
    family,
    action,
    id,
  } as ParseRoute<TRoute>;
};

export const parseRouteCatalog = <T extends RouteSignatureCatalog>(
  routes: T,
): RouteNetwork<T> => routes.map((route) => parseRoute(route)) as RouteNetwork<T>;

export const projectTemplates = <T extends RouteSignatureCatalog>(routes: T): RouteTemplateBindings<T> => {
  return routes.map((route, index) => {
    const [family, action, id] = route.split('/') as [string, string, string];
    return {
      index,
      family,
      action,
      id,
      raw: route,
    };
  }) as RouteTemplateBindings<T>;
};
