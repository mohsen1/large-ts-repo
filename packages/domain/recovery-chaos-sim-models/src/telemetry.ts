import type { Brand } from '@shared/type-level';
import { type SignalEnvelope } from './identity';
import { connectedComponents, type TopologyEdge, type TopologyNode } from './topology';

export type TelemetryChannel = Brand<string, 'TelemetryChannel'>;
export type TelemetryState = 'idle' | 'streaming' | 'throttling' | 'faulted';

export interface TelemetrySnapshot<TPayload = unknown> {
  readonly channel: TelemetryChannel;
  readonly namespace: string;
  readonly emitted: number;
  readonly state: TelemetryState;
  readonly payloads: readonly SignalEnvelope<TPayload>[];
}

export type TelemetrySignal<T extends string = string> = {
  readonly channel: TelemetryChannel;
  readonly kind: `telemetry.${T}`;
  readonly ts: number;
  readonly severity: number;
};

export interface TelemetryWindow {
  readonly channel: TelemetryChannel;
  readonly from: number;
  readonly to: number;
  readonly windowSeconds: number;
}

export interface TelemetryRecord<T = unknown> {
  readonly channel: TelemetryChannel;
  readonly payload: T;
  readonly at: number;
}

export function computeHealthScore(records: readonly TelemetryRecord[]): number {
  if (records.length === 0) {
    return 1;
  }
  const score = records.reduce((acc, record) => {
    const severity = (record.payload as { severity?: number }).severity;
    const normalized = typeof severity === 'number' ? 1 - severity / 100 : 1;
    return acc + Math.max(0, Math.min(1, normalized));
  }, 0);
  return score / records.length;
}

export function summarizeSignals<T>(signals: readonly SignalEnvelope<T>[]): {
  readonly count: number;
  readonly firstAt: number;
  readonly lastAt: number;
  readonly namespaceByCount: ReadonlyRecord<string, number>;
} {
  const namespaceByCount: Record<string, number> = {};
  for (const signal of signals) {
    namespaceByCount[signal.namespace] = (namespaceByCount[signal.namespace] ?? 0) + 1;
  }
  const atTimes = signals.map((signal) => signal.at).map((value) => Number(value));
  return {
    count: signals.length,
    firstAt: atTimes[0] ?? 0,
    lastAt: atTimes.at(-1) ?? 0,
    namespaceByCount: namespaceByCount as ReadonlyRecord<string, number>
  };
}

export type ReadonlyRecord<K extends string, V> = Readonly<Record<K, V>>;

export function partitionTopology<T extends string>(
  nodes: readonly TopologyNode<T>[],
  edges: readonly TopologyEdge[]
): readonly (readonly TopologyNode<T>[])[] {
  const components = connectedComponents(nodes as never, edges);
  return components.map((component) =>
    nodes.filter((node) => (component as readonly TopologyNode<T>['id'][]).includes(node.id)) as readonly TopologyNode<T>[]
  );
}

export function telemetryWindow<T>(
  records: readonly TelemetryRecord<T>[],
  windowMs: number
): readonly TelemetryWindow[] {
  if (records.length === 0) {
    return [];
  }

  const byChannel = new Map<TelemetryChannel, TelemetryRecord<T>[]>();
  for (const record of records) {
    const list = byChannel.get(record.channel as TelemetryChannel) ?? [];
    list.push(record);
    byChannel.set(record.channel as TelemetryChannel, list);
  }

  const snapshots: TelemetryWindow[] = [];
  for (const [channel, channelRecords] of byChannel) {
    const sorted = [...channelRecords].toSorted((lhs, rhs) => lhs.at - rhs.at);
    const first = sorted[0];
    const last = sorted.at(-1);
    const from = first?.at ?? 0;
    const to = last?.at ?? 0;
    snapshots.push({
      channel,
      from,
      to,
      windowSeconds: Math.max(1, Math.round((to - from) / 1000 / windowMs))
    });
  }
  return snapshots;
}
