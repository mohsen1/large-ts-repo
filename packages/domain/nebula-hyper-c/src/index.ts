export interface NebulaHyperCCell {
  readonly key: string;
  readonly weight: number;
}

export interface NebulaHyperCMatrix {
  readonly id: string;
  readonly cells: ReadonlyArray<NebulaHyperCCell>;
}

export const createMatrix = (id: string, cells: ReadonlyArray<NebulaHyperCCell>): NebulaHyperCMatrix => ({
  id,
  cells,
});
