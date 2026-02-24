import type { EngineTick, RuntimePhase, RuntimeStatus } from './types';

export type TelemetryChannel = `studio.${string}`;

export interface TelemetryPoint {
  readonly at: number;
  readonly phase: RuntimePhase;
  readonly status: RuntimeStatus;
  readonly plugin: string;
  readonly details: Record<string, unknown>;
}

export interface TelemetryEnvelope<T = unknown> {
  readonly channel: TelemetryChannel;
  readonly point: T;
}

const phaseOrder: Readonly<Record<RuntimePhase, number>> = {
  boot: 0,
  planning: 1,
  execution: 2,
  observation: 3,
  complete: 4,
  error: 5,
};

export const toTick = (point: TelemetryPoint): EngineTick => ({
  at: new Date(point.at).toISOString(),
  pluginId: point.plugin,
  phase: point.phase,
  status: point.status,
  metadata: point.details,
});

export const toTelemetry = (tick: EngineTick): TelemetryEnvelope => ({
  channel: `studio.${tick.phase}` as TelemetryChannel,
  point: tick,
});

export const sortByPhase = (points: readonly TelemetryPoint[]): readonly TelemetryPoint[] =>
  [...points].toSorted((left, right) => phaseOrder[left.phase] - phaseOrder[right.phase] || right.at - left.at);

export const foldTelemetry = <T>(
  points: readonly TelemetryPoint[],
  transform: (point: TelemetryPoint) => T,
): readonly T[] => points.map(transform);
