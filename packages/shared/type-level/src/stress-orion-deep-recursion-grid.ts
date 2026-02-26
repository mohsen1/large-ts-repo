export type BuildTuple<N extends number, Seed extends unknown[] = []> = Seed['length'] extends N
  ? Seed
  : BuildTuple<N, [...Seed, Seed['length']]>;

export type Decrement<N extends number> = BuildTuple<N> extends [unknown, ...infer Rest] ? Rest['length'] : 0;
export type Increment<N extends number> = [...BuildTuple<N>, unknown]['length'];

export interface GridCell<TKind extends string = string, TWeight extends number = number> {
  readonly key: string;
  readonly kind: TKind;
  readonly weight: TWeight;
}

export interface GridAxis<TLabel extends string = string> {
  readonly axis: TLabel;
  readonly slots: number;
}

export type GridValue<TLabel extends string, TDepth extends number = 12> = {
  readonly label: TLabel;
  readonly depth: TDepth;
  readonly values: BuildTuple<TDepth>;
};

export type RecursiveGrid<
  TLabel extends string,
  TDepth extends number,
  TAcc extends unknown[] = [],
> = TDepth extends 0
  ? TAcc
  : RecursiveGrid<TLabel, Decrement<TDepth>, [{ readonly label: TLabel; readonly rank: TAcc['length'] }, ...TAcc]>;

export type NormalizeGrid<T extends readonly unknown[]> = {
  readonly length: T['length'];
  readonly last: T extends readonly [...unknown[], infer Last] ? Last : never;
};

export type BuildMatrix<
  TWidth extends number,
  THeight extends number,
  TRow extends unknown[] = [],
  TCells extends unknown[] = [],
> = TRow['length'] extends THeight
  ? TCells
  : BuildMatrix<
      TWidth,
      THeight,
      [...TRow, unknown],
      [...TCells, { readonly row: TRow['length']; readonly columns: BuildTuple<TWidth> }]
    >;

export type FlattenMatrix<T extends readonly unknown[]> = T extends readonly [
  infer H,
  ...infer R,
]
  ? readonly [H, ...FlattenMatrix<R>]
  : readonly [];

export type FoldGrid<TMatrix, TAcc extends string[] = []> = TMatrix extends readonly [infer Row, ...infer Rest]
  ? Row extends { readonly row: infer R; readonly columns: readonly unknown[] }
    ? FoldGrid<Rest, [...TAcc, `${string & R}:${Row['columns']['length']}`]>
    : FoldGrid<Rest, TAcc>
  : TAcc;

export type DeepMap<T, TDepth extends number> = TDepth extends 0
  ? T
  : T extends readonly [infer H, ...infer R]
    ? readonly [DeepMap<H, Decrement<TDepth>>, ...DeepMap<R, Decrement<TDepth>>]
    : T;

export type ResolveDepth<T extends number, L extends unknown[] = []> = T extends L['length']
  ? T
  : ResolveDepth<T, [...L, unknown]>;

export type GridLookup<
  T extends readonly { readonly key: string; readonly value: number }[],
  K extends string,
> = T extends readonly [infer Head, ...infer Rest]
  ? Head extends { readonly key: K; readonly value: infer Value }
    ? Value | GridLookup<Rest & readonly { readonly key: string; readonly value: number }[], K>
    : GridLookup<Rest & readonly { readonly key: string; readonly value: number }[], K>
  : never;

export type ConstrainDepth<T extends number> = ResolveDepth<T> extends number ? ResolveDepth<T> : never;

export interface GridBuilderConfig<
  TDomain extends string,
  TWidth extends number,
  THeight extends number,
> {
  readonly domain: TDomain;
  readonly width: TWidth;
  readonly height: THeight;
  readonly seed: number;
}

export interface GridEnvelope<TDomain extends string = string> {
  readonly domain: TDomain;
  readonly rowCount: number;
  readonly colCount: number;
  readonly rows: ReadonlyArray<{ row: number; size: number; values: readonly number[] }>;
}

export const buildMatrixRows = (width: number, height: number): ReadonlyArray<readonly number[]> => {
  const rows: number[][] = [];
  let row = 0;
  while (row < height) {
    const values: number[] = [];
    let col = 0;
    while (col < width) {
      values.push((row + col) % (width + 1));
      col += 1;
    }
    rows.push(values);
    row += 1;
  }
  return rows;
};

export const buildMatrix = <TDomain extends string, TWidth extends number, THeight extends number>(
  config: GridBuilderConfig<TDomain, TWidth, THeight>,
): GridEnvelope<TDomain> => {
  const rows = buildMatrixRows(config.width, config.height);
  const rowCount = rows.length;
  const colCount = rows[0]?.length ?? 0;
  return {
    domain: config.domain,
    rowCount,
    colCount,
    rows: rows.map((values, index) => ({ row: index, size: values.length, values })),
  };
};

export const mergeRows = (rows: ReadonlyArray<{ row: number; size: number; values: readonly number[] }>): number => {
  return rows.reduce((sum, row) => sum + row.values.reduce((seed, value) => seed + value, 0) + row.size, 0);
};

export const gridAccumulator = <TDepth extends number>(depth: TDepth, width: number) => {
  const matrix = buildMatrixRows(width, depth as number);
  const score = mergeRows(buildMatrixRows(width, depth as number).map((row, index) => ({ row: index, size: row.length, values: row })));
  return {
    score,
    matrix,
    width,
    depth,
  };
};

export const recursiveGridProbe = (depth: number, width: number): ReadonlyArray<number> => {
  const cursor: number[] = [];
  const rows = buildMatrixRows(width, depth);
  for (const row of rows) {
    const rowProbe = row.map((value, index) => value + index);
    cursor.push(...rowProbe);
  }
  return cursor;
};

export const nestedGrid = (levels: 8): ReadonlyArray<readonly number[]> => {
  return buildMatrixRows(levels + 2, levels);
};

export type RouteMap<T extends number, S extends number = 0> = {
  readonly matrix: BuildMatrix<T, S>;
  readonly score: FoldGrid<BuildMatrix<T, S>>;
  readonly size: ResolveDepth<S>;
};

export const matrixPlan = (width = 8, height = 7): RouteMap<8, 7> => {
  return {
    matrix: [] as unknown as BuildMatrix<8, 7>,
    score: ['seed'] as unknown as FoldGrid<BuildMatrix<8, 7>>,
    size: 7 as ConstrainDepth<7>,
  };
};
