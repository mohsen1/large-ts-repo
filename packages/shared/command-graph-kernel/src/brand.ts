export const brandSymbol = Symbol.for('command-graph-kernel/brand') as unknown as {
  readonly brand: unique symbol;
};

export type Brand<TValue, TTag extends string> = TValue & {
  readonly [brandSymbol.brand]: TTag;
};

export const brandValue = <TTag extends string, TValue extends string>(tag: TTag, value: TValue): Brand<TValue, TTag> =>
  `${tag}:${value}` as Brand<TValue, TTag>;

export const isBranded = <TTag extends string, TValue extends string>(
  value: string,
  tag: TTag,
): value is Brand<TValue, TTag> => value.startsWith(`${tag}:`);

export type BrandedValues<TValues extends readonly string[], TPrefix extends string> = {
  [Index in keyof TValues]: Brand<TValues[Index], `${TPrefix}:${Index & string}`>;
};

export const mapBrandedTuple = <
  const TPrefix extends string,
  const TValues extends readonly string[],
>(
  prefix: TPrefix,
  values: TValues,
): BrandedValues<TValues, TPrefix> =>
  values.map((value, index) => brandValue(`${prefix}:${index}`, value)) as BrandedValues<TValues, TPrefix>;
