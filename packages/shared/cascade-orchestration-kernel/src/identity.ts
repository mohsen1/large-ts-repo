import { Brand } from '@shared/core';

export type CascadeScope = 'plan' | 'stage' | 'policy' | 'resource';

export type BrandByScope<S extends CascadeScope> = Brand<string, `Cascade${Capitalize<S>}Id`>;

export type PlanId = BrandByScope<'plan'>;
export type StageId = BrandByScope<'stage'>;
export type PolicyId = BrandByScope<'policy'>;
export type ResourceId = BrandByScope<'resource'>;

export type CascadeEventTag =
  | 'cascade:plugin-started'
  | 'cascade:run-complete'
  | `cascade:plugin:${string}`;

export type NamespacePrefix<T extends string> = `edge.${T}`;

export interface CascadeIdentity {
  readonly scope: CascadeScope;
  readonly raw: string;
}

export const makeCascadeId = <S extends CascadeScope>(scope: S, raw: string): Brand<string, `Cascade${Capitalize<S>}Id`> => {
  return `${scope}:${raw}` as Brand<string, `Cascade${Capitalize<S>}Id`>;
};

export const asCascadeScope = <S extends CascadeScope>(value: S): CascadeScope => value;

export type StageLabel<T extends string = string> = Brand<string, `StageLabel:${T}`>;
export const makeStageLabel = <T extends string>(value: T): StageLabel<T> => `stage:${value}` as StageLabel<T>;

export type PolicyCode<S extends string = string> = Brand<string, `PolicyCode:${S}`>;

export interface CascadeRef<TScope extends CascadeScope = CascadeScope, TId extends string = string> {
  readonly scope: TScope;
  readonly id: TId & Brand<string, `Cascade${Capitalize<TScope>}Id`>;
}

export interface CascadeGraphVertex {
  readonly id: PlanId;
  readonly label: StageLabel;
  readonly scope: CascadeScope;
}

export type ScopeToBrand = {
  plan: PlanId;
  stage: StageId;
  policy: PolicyId;
  resource: ResourceId;
};

export const asTypedRef = <S extends CascadeScope>(scope: S, id: string): CascadeRef<S, string> => ({
  scope,
  id: id as string & Brand<string, `Cascade${Capitalize<S>}Id`>,
});

export type RecursiveTuple<T, L extends number> =
  L extends 0
    ? []
    : [T, ...RecursiveTuple<T, Decrement<L>>];

type Decrement<T extends number> = T extends 0
  ? never
  : T extends 1
    ? 0
    : T extends 2
      ? 1
      : T extends 3
        ? 2
        : T extends 4
          ? 3
          : T extends 5
            ? 4
            : never;

export type ExpandRecursively<T> = T extends readonly [infer H, ...infer R]
  ? [H, ...ExpandRecursively<R>]
  : T extends object
    ? { [K in keyof T]: ExpandRecursively<T[K]> }
    : T;

export const identityEnvelope = {
  version: '1' as const,
  type: 'identity.event' as const,
  payload: {
    tenant: 'tenant-core',
    generatedAt: new Date().toISOString(),
  },
} satisfies {
  version: '1';
  type: 'identity.event';
  payload: {
    tenant: string;
    generatedAt: string;
  };
};

export type EventKind =
  | CascadeEventTag
  | `${CascadeEventTag}:started`
  | `${CascadeEventTag}:completed`
  | `${CascadeEventTag}:failed`;

export type EventRecord<S extends CascadeScope = CascadeScope, K extends EventKind = EventKind> = {
  readonly kind: K;
  readonly scope: S;
  readonly scopeId: Brand<string, `Cascade${Capitalize<S>}Id`>;
  readonly ref?: CascadeRef<S>;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: string;
};

export type EventTag = `${CascadeEventTag}`;
export type CascadeLabelPath<T extends string> = `${T}:${string}`;
export type NamespacedLabel<T extends string> = NamespacePrefix<T> | CascadeLabelPath<T>;

export const makeEventRecord = <S extends CascadeScope, K extends EventKind>(
  kind: K,
  scope: S,
  scopeId: Brand<string, `Cascade${Capitalize<S>}Id`>,
  metadata: Record<string, unknown>,
): EventRecord<S, K> => ({
  kind,
  scope,
  scopeId,
  metadata,
  occurredAt: new Date().toISOString(),
});
