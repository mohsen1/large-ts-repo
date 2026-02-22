export interface NebulaHyperBToken {
  readonly code: string;
  readonly value: number;
}

export interface NebulaHyperBState {
  readonly streamId: string;
  readonly tokens: ReadonlyArray<NebulaHyperBToken>;
}

export const buildState = (streamId: string, tokens: ReadonlyArray<NebulaHyperBToken>): NebulaHyperBState => ({
  streamId,
  tokens,
});
