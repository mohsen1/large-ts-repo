import { randomUUID } from 'node:crypto';
import { normalizeLimit, withBrand } from '@shared/core';
import { NoInfer, type Merge } from '@shared/type-level';
import {
  type MeshEngineAdapter,
  type MeshPayloadFor,
  type MeshRuntimeCommand,
  type MeshSignalKind,
  type EngineAdapterId,
} from './types';

export type FleetMode = 'hot' | 'warm' | 'cold';

export interface FleetAdapter<TSignal extends MeshSignalKind = MeshSignalKind> {
  readonly adapter: MeshEngineAdapter;
  readonly alias: string;
  readonly affinity: readonly TSignal[];
  readonly mode: FleetMode;
  readonly active: boolean;
}

export interface FleetConfig {
  readonly name: string;
  readonly limit?: number;
}

export interface FleetResult<TSignal extends MeshSignalKind> {
  readonly outputs: readonly unknown[];
  readonly chosen: EngineAdapterId;
  readonly mode: FleetMode;
}

const modePriority = (mode: FleetMode): number => (mode === 'hot' ? 3 : mode === 'warm' ? 2 : 1);

export class MeshAdapterFleet<TSignal extends MeshSignalKind = MeshSignalKind> {
  #adapters: FleetAdapter<TSignal>[];
  #mode: FleetMode;
  #limit: number;

  constructor(config: FleetConfig, mode: FleetMode = 'warm') {
    this.#adapters = [];
    this.#mode = mode;
    this.#limit = normalizeLimit(config.limit);
  }

  get mode() {
    return this.#mode;
  }

  add = (adapter: FleetAdapter<TSignal>): void => {
    if (this.#adapters.length >= this.#limit) {
      return;
    }
    this.#adapters.push(adapter);
  };

  remove = (adapterId: EngineAdapterId): boolean => {
    const previous = this.#adapters.length;
    this.#adapters = this.#adapters.filter((adapter) => adapter.adapter.adapterId !== adapterId);
    return this.#adapters.length !== previous;
  };

  setMode = (mode: FleetMode): void => {
    this.#mode = mode;
  };

  list = (): readonly FleetAdapter<TSignal>[] =>
    this.#adapters
      .toSorted((left, right) => modePriority(right.mode) - modePriority(left.mode))
      .slice(0, this.#limit);

  find = (kind: NoInfer<TSignal>): readonly FleetAdapter<TSignal>[] =>
    this.#adapters.filter((adapter): adapter is FleetAdapter<TSignal> =>
      adapter.affinity.includes(kind as TSignal) && adapter.active,
    );

  run = async <TSignalIn extends TSignal>(
    command: MeshRuntimeCommand<TSignalIn>,
  ): Promise<FleetResult<TSignalIn>> => {
    const candidates = this.find(command.signal.kind);
    const selected = candidates.at(0) ?? this.createFallback(command.signal.kind);

    const output = (await selected.adapter.execute(command)) as unknown as unknown[];
    const fallbackChosen = selected.adapter.adapterId;

    return {
      outputs: output,
      chosen: fallbackChosen,
      mode: selected.mode,
    };
  };

  inspect = (): { readonly total: number; readonly active: number; readonly mode: FleetMode } => {
    const active = this.#adapters.filter((adapter) => adapter.active).length;
    return {
      total: this.#adapters.length,
      active,
      mode: this.#mode,
    };
  };

  report = async (): Promise<string> => {
    const info = this.inspect();
    return `${info.mode}::${info.total}::${info.active}::${this.#limit}`;
  };

  private createFallback(signal: TSignal): FleetAdapter<TSignal> {
    const adapter = {
      adapterId: withBrand(`fallback-${signal}-${randomUUID()}`, 'engine-adapter-id'),
      capabilities: [signal],
      displayName: `fallback-${signal}`,
      connect: async () => undefined,
      disconnect: async () => undefined,
      execute: async (command: any) => [command.signal] as unknown as MeshPayloadFor<any>[],
      [Symbol.asyncDispose]: async () => undefined,
    } as unknown as import('./types').MeshEngineAdapter;

    return {
      adapter,
      alias: `fallback-${signal}`,
      affinity: [signal],
      mode: this.#mode,
      active: true,
    };
  }
}

export const buildFleet = <TSignal extends MeshSignalKind>(
  adapters: ReadonlyArray<FleetAdapter<TSignal>>,
  config: FleetConfig,
): MeshAdapterFleet<TSignal> => {
  const fleet = new MeshAdapterFleet<TSignal>(config);
  adapters
    .toSorted((left, right) => modePriority(right.mode) - modePriority(left.mode))
    .forEach((adapter) => fleet.add(adapter));
  return fleet;
};

export const createFallbackAdapter = <TSignal extends MeshSignalKind>(
  signal: TSignal,
  alias: string,
): FleetAdapter<TSignal> => {
  return {
    adapter: {
      adapterId: withBrand(`fallback-${alias}-${randomUUID()}`, 'engine-adapter-id'),
      capabilities: [signal] as readonly MeshSignalKind[],
      displayName: alias,
      connect: async () => undefined,
      disconnect: async () => undefined,
      execute: async <TSignalLocal extends MeshSignalKind>(
        command: MeshRuntimeCommand<TSignalLocal>,
      ): Promise<MeshPayloadFor<TSignalLocal>[]> =>
        [command.signal as MeshPayloadFor<TSignalLocal>],
      [Symbol.asyncDispose]: async () => undefined,
    },
    alias,
    affinity: [signal],
    mode: 'warm',
    active: true,
  } as FleetAdapter<TSignal>;
};

export const executeFleet = async <TSignal extends MeshSignalKind>(
  fleet: MeshAdapterFleet<TSignal>,
  command: MeshRuntimeCommand<TSignal>,
): Promise<readonly MeshPayloadFor<TSignal>[]> => {
  const result = await fleet.run(command);
  return result.outputs as unknown as readonly MeshPayloadFor<TSignal>[];
};

export const buildFleetReport = (
  fleet: MeshAdapterFleet,
  topologyId: string,
  signals: readonly MeshSignalKind[],
): string => {
  const status = fleet.inspect();
  const score = signals.reduce((acc, signal) => acc + signal.length, 0);
  return `${topologyId}::${status.total}::${status.active}::${status.mode}::${score}`;
};

export const groupByMode = <T extends FleetAdapter>(adapters: readonly T[]): readonly [FleetMode, number][] => {
  const map = new Map<FleetMode, number>();
  for (const adapter of adapters) {
    map.set(adapter.mode, (map.get(adapter.mode) ?? 0) + 1);
  }

  return Array.from(map.entries()).toSorted();
};

export const mergeFleetAdapters = <TSignal extends MeshSignalKind, T extends FleetAdapter<TSignal>>(
  left: readonly T[],
  right: readonly T[],
): Merge<Readonly<typeof left>, Readonly<typeof right>> =>
  [...left, ...right] as Merge<Readonly<typeof left>, Readonly<typeof right>>;
