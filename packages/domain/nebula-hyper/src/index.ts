export interface NebulaHyperUnit {
  readonly id: string;
  readonly slot: number;
  readonly active: boolean;
  readonly rank: number;
  readonly tags: ReadonlyArray<string>;
}

export interface NebulaHyperCode {
  readonly unitId: string;
  readonly marker: number;
}

export interface NebulaHyperStream {
  readonly head: NebulaHyperCode;
  readonly rest: ReadonlyArray<NebulaHyperCode>;
  readonly score: number;
}

export const toCode = (unit: NebulaHyperUnit, marker: number): NebulaHyperCode => ({
  unitId: unit.id,
  marker,
});

export const scoreStream = (stream: NebulaHyperStream): number => stream.score;
