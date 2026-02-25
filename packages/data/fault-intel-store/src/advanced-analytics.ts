import type { IncidentSignal, Transport, IncidentSignal as IncidentSignalModel } from '@domain/fault-intel-orchestration';
import { createIteratorChain } from '@shared/fault-intel-runtime';

type SignalDimension = IncidentSignal['severity'];
type SeverityScore = 0 | 1 | 2 | 3;

export type Branded<T, Tag extends string> = T & { readonly __brand: `FaultIntel:${Tag}` };
export type SignalByTransport = Record<Transport, readonly IncidentSignal[]>;

export type RecursiveMetrics<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...RecursiveMetrics<Tail>]
  : readonly [];

export type TupleZip<
  TLeft extends readonly unknown[],
  TRight extends readonly unknown[],
> = TLeft extends readonly [infer LHead, ...infer LTail]
  ? TRight extends readonly [infer RHead, ...infer RTail]
    ? readonly [readonly [LHead, RHead], ...TupleZip<LTail, RTail>]
    : readonly []
  : readonly [];

export type SignalPath<T extends readonly string[]> = T extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[]
]
  ? Tail extends readonly []
    ? Head
    : `${Head}/${SignalPath<Tail>}`
  : never;

export type Renamed<TRecord extends Record<string, unknown>, Prefix extends string> = {
  [K in keyof TRecord as `${Prefix}:${K & string}`]: TRecord[K];
};

export interface AdvancedSignalMetrics {
  readonly severityCounts: Renamed<Record<SignalDimension, number>, 'severity'>;
  readonly transportCounts: Renamed<Record<Transport, number>, 'transport'>;
  readonly topTransport: readonly Transport[];
}

export interface SignalEnvelope<TSignal extends IncidentSignal = IncidentSignal> {
  readonly signal: TSignal;
  readonly path: SignalPath<readonly [TSignal['transport'], TSignal['severity']]>;
  readonly score: SeverityScore;
}

export interface CampaignTelemetryWindow {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly transportLoad: SignalByTransport;
}

export interface CampaignIntelligenceProfile<TSignals extends readonly IncidentSignal[] = readonly IncidentSignal[]> {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly totals: {
    signals: number;
    transports: number;
    transportsActive: number;
    maxSeverity: IncidentSignal['severity'];
  };
  readonly metrics: AdvancedSignalMetrics;
  readonly timeline: readonly CampaignTelemetryWindow[];
  readonly signature: Branded<string, 'fault-intel-profile-signature'>;
  readonly orderedSignals: RecursiveMetrics<TSignals>;
}

export interface TransportWindowBuckets {
  readonly transport: Transport;
  readonly buckets: ReadonlyMap<number, readonly IncidentSignal[]>;
}

type SeverityOrdering = readonly [
  IncidentSignal['severity'],
  IncidentSignal['severity'],
  IncidentSignal['severity'],
  IncidentSignal['severity'],
] ;

const severityScore: Record<IncidentSignal['severity'], SeverityScore> = {
  notice: 0,
  advisory: 1,
  warning: 2,
  critical: 3,
} as const;

const transportScoreOrder: readonly Transport[] = ['mesh', 'fabric', 'cockpit', 'orchestration', 'console'] as const satisfies readonly Transport[];
const severityRanking: SeverityOrdering = ['critical', 'warning', 'advisory', 'notice'];

const signalKinds = (signals: readonly IncidentSignal[]) => createIteratorChain(signals).toArray().map((signal) => signal.severity);

const resolveMaxSeverity = (signals: readonly IncidentSignal[]): IncidentSignal['severity'] => {
  for (const severity of severityRanking) {
    if (signals.some((signal) => signal.severity === severity)) {
      return severity;
    }
  }
  return 'notice';
};

const buildSignature = async (input: string): Promise<Branded<string, 'fault-intel-profile-signature'>> => {
  const hashed = await Promise.resolve(input).then((raw) => `sig:${raw.length}:${raw.slice(0, 12)}`);
  return hashed as Branded<string, 'fault-intel-profile-signature'>;
};

const createWindowBuckets = (signals: readonly IncidentSignal[]): TransportWindowBuckets[] => {
  const byTransport: SignalByTransport = {
    mesh: [],
    fabric: [],
    cockpit: [],
    orchestration: [],
    console: [],
  };

  for (const signal of signals) {
    byTransport[signal.transport] = [...byTransport[signal.transport], signal];
  }

  return transportScoreOrder.map((transport) => {
    const now = new Date();
    const buckets = new Map<number, readonly IncidentSignal[]>();
    const grouped = createIteratorChain(byTransport[transport]).toArray();

    for (const signal of grouped) {
      const bucket = new Date(signal.observedAt).getUTCHours();
      const existing = buckets.get(bucket) ?? [];
      buckets.set(bucket, [...existing, signal]);
    }

    return {
      transport,
      buckets,
    };
  });
};

const createTransportLoadTimeline = (normalized: readonly IncidentSignal[]): CampaignTelemetryWindow[] => {
  const buckets = createWindowBuckets(normalized);
  return createIteratorChain(buckets).map((entry) => {
    const now = new Date();
    const active = entry.buckets.get(now.getUTCHours()) ?? [];

    return {
      windowStart: new Date(now).toISOString(),
      windowEnd: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      transportLoad: {
        mesh: active,
        fabric: [],
        cockpit: [],
        orchestration: [],
        console: [],
      } satisfies SignalByTransport,
    };
  }).toArray();
};

const mapSeverityMetrics = (counts: Record<SignalDimension, number>): AdvancedSignalMetrics['severityCounts'] => {
  return {
    'severity:notice': counts.notice,
    'severity:advisory': counts.advisory,
    'severity:warning': counts.warning,
    'severity:critical': counts.critical,
  };
};

const mapTransportMetrics = (counts: Record<Transport, number>): AdvancedSignalMetrics['transportCounts'] => {
  return {
    'transport:mesh': counts.mesh,
    'transport:fabric': counts.fabric,
    'transport:cockpit': counts.cockpit,
    'transport:orchestration': counts.orchestration,
    'transport:console': counts.console,
  };
};

const rankByTransportLoad = (signals: readonly IncidentSignal[]) => {
  const counts = createIteratorChain(signals)
    .toArray()
    .reduce<Record<Transport, number>>((acc, signal) => {
      acc[signal.transport] = (acc[signal.transport] ?? 0) + 1;
      return acc;
    }, {
      mesh: 0,
      fabric: 0,
      cockpit: 0,
      orchestration: 0,
      console: 0,
    });

  return (Object.entries(counts) as [Transport, number][])
    .sort((left, right) => right[1] - left[1])
    .map(([transport]) => transport);
};

const normalizeSignals = (signals: readonly IncidentSignal[]): readonly IncidentSignal[] =>
  createIteratorChain(signals)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
    .toArray()
    .filter((value, index, all) => index === 0 || value.signalId !== all[index - 1].signalId);

export const toSignalEnvelope = <TSignal extends IncidentSignal>(signal: TSignal): SignalEnvelope<TSignal> => ({
  signal,
  path: `${signal.transport}/${signal.severity}` as SignalPath<readonly [TSignal['transport'], TSignal['severity']]>,
  score: severityScore[signal.severity],
});

export const partitionByTransport = (signals: readonly IncidentSignal[]): SignalByTransport => {
  const buckets: SignalByTransport = {
    mesh: [],
    fabric: [],
    cockpit: [],
    orchestration: [],
    console: [],
  };

  for (const signal of signals) {
    buckets[signal.transport] = [...buckets[signal.transport], signal];
  }

  return buckets;
};

export const buildIntelligenceProfile = async (
  tenantId: string,
  workspaceId: string,
  signals: readonly IncidentSignal[],
  windowMinutes = 60,
): Promise<CampaignIntelligenceProfile> => {
  const normalized = normalizeSignals(signals);
  const byTransport = partitionByTransport(normalized);
  const metricsBySeverity = signalKinds(normalized).reduce<Record<SignalDimension, number>>((acc, severity) => {
    acc[severity] = (acc[severity] ?? 0) + 1;
    return acc;
  }, {
    notice: 0,
    advisory: 0,
    warning: 0,
    critical: 0,
  });

  const metricsByTransport = {
    mesh: byTransport.mesh.length,
    fabric: byTransport.fabric.length,
    cockpit: byTransport.cockpit.length,
    orchestration: byTransport.orchestration.length,
    console: byTransport.console.length,
  } as Record<Transport, number>;

  const timeline = createTransportLoadTimeline(normalized);
  const normalizedSignature = await buildSignature(
    `${tenantId}:${workspaceId}:${signalKinds(normalized).join(',')}:${metricsByTransport.mesh + metricsByTransport.fabric}`,
  );

  const activeTransports = transportScoreOrder.filter((transport) => byTransport[transport].length > 0);
  const activeSignals = normalized.reduce<number>((acc, signal) => acc + signal.metrics.length, 0);

  return {
    tenantId,
    workspaceId,
    totals: {
      signals: normalized.length,
      transports: transportScoreOrder.length,
      transportsActive: activeTransports.length,
      maxSeverity: resolveMaxSeverity(normalized),
    },
    metrics: {
      severityCounts: mapSeverityMetrics(metricsBySeverity),
      transportCounts: mapTransportMetrics(metricsByTransport),
      topTransport: rankByTransportLoad(normalized),
    },
    timeline: timeline.map((entry) => ({
      ...entry,
      windowEnd: new Date(
        new Date(entry.windowStart).getTime() + windowMinutes * 60 * 1000,
      ).toISOString(),
    })),
    signature: normalizedSignature,
    orderedSignals: normalized as RecursiveMetrics<typeof normalized>,
  };
};

export const detectAnomalies = (profile: CampaignIntelligenceProfile): readonly SignalEnvelope[] => {
  const ranked = createIteratorChain(profile.orderedSignals as readonly IncidentSignal[])
    .toArray()
    .filter((signal) => signal.severity === 'critical')
    .slice(0, 10);
  return ranked.map((signal) => toSignalEnvelope(signal as IncidentSignalModel));
};

export const estimateProfileDensity = (profile: CampaignIntelligenceProfile): number => {
  const transportLoad = Object.values(profile.metrics.transportCounts).reduce((acc, value) => acc + value, 0);
  const severityLoad = Object.values(profile.metrics.severityCounts).reduce((acc, value) => acc + value, 0);
  return transportLoad === 0 || severityLoad === 0 ? 0 : Number((severityLoad / profile.orderedSignals.length).toFixed(4));
};
