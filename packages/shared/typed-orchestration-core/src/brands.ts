export type Brand<TValue, TMarker extends string = string> = TValue & { readonly __brand: TMarker };

export type BrandMarker<T> = T extends string ? T : T extends number ? T : `marker:${string}`;

export type Nominal<TValue, TMarker extends string> = Brand<TValue, `nominal:${TMarker}`>;

export type Branded<T extends string, TMarker extends string> = Brand<T, TMarker>;

export type NamespaceTag<TPath extends string> = `namespace:${TPath}`;

export type EventName<
  TNamespace extends string,
  TVerb extends string,
> = `${TNamespace}::${TVerb}`;

export type EventTag<TNamespace extends string, TVerb extends string, TChannel extends string> =
  `${EventName<TNamespace, TVerb>}/${TChannel}`;

export type BrandFromTemplate<TPrefix extends string, TName extends string> = Brand<
  `${TPrefix}:${TName}`,
  `branded:${TPrefix}`
>;

export type OptionalKeyMap<T, TKey extends string> = {
  [K in keyof T as K extends string ? `${TKey}_${K}` : never]: T[K];
};

export type InferBrand<T> = T extends Brand<infer TValue, infer TBrand>
  ? { readonly value: TValue; readonly brand: TBrand }
  : never;

export type EnsureBrand<T, TBrand extends string> = T extends Brand<infer TValue, infer CurrentBrand>
  ? CurrentBrand extends TBrand
    ? Brand<TValue, CurrentBrand>
    : never
  : never;

export type RecursiveJsonPath<
  T,
  TPrefix extends string = '',
> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]:
        T[K] extends Record<string, unknown>
          ? `${TPrefix}${K}` | `${TPrefix}${K}.${RecursiveJsonPath<T[K]>}`
          : `${TPrefix}${K}`;
    }[keyof T & string]
  : never;

export type ExpandType<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

export type MergeRecords<
  TLeft extends Record<string, unknown>,
  TRight extends Record<string, unknown>,
> = {
  [K in keyof TLeft | keyof TRight]: K extends keyof TRight
    ? TRight[K]
    : K extends keyof TLeft
      ? TLeft[K]
      : never;
};

export type UnionKeys<T> = T extends any ? keyof T : never;

export type ReplaceKey<
  TObject extends Record<string, unknown>,
  TOldKey extends keyof TObject,
  TNewKey extends string,
> = {
  [K in keyof TObject as K extends TOldKey ? TNewKey : K]: TObject[K];
};

export const asBrand = <T extends string, TMarker extends string>(
  value: T,
  marker: TMarker,
): Brand<T, TMarker> => value as Brand<T, TMarker>;

export const createBrand = asBrand;

export const createNamespaceTag = <TPath extends string>(path: TPath): NamespaceTag<TPath> =>
  `namespace:${path}` as NamespaceTag<TPath>;

export const createNominal = <TValue extends string, TMarker extends string>(
  value: TValue,
  marker: TMarker,
): Nominal<TValue, TMarker> => `${value}::${marker}` as Nominal<TValue, TMarker>;
