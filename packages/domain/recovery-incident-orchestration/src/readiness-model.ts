import type { IncidentRecord, IncidentSignal, IncidentId, SeverityBand } from './types';
import type { Merge, Prettify, Brand } from '@shared/type-level';

export type ReadinessState = 'healthy' | 'watch' | 'degraded' | 'critical';

export type DimensionName = 'reliability' | 'speed' | 'data-integrity' | 'resilience';

export interface ReadinessDimension {
  readonly name: DimensionName;
  readonly score: number;
  readonly label: string;
}

export interface ReadinessWindow {
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly label: string;
  readonly reason: string;
}

export interface ReadinessEvidence {
  readonly incidentId: IncidentId;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface ReadinessSnapshot {
  readonly incidentId: IncidentId;
  readonly state: ReadinessState;
  readonly score: number;
  readonly dimensions: readonly ReadinessDimension[];
  readonly windows: readonly ReadinessWindow[];
  readonly evidence: readonly ReadinessEvidence[];
  readonly updatedAt: string;
}

export interface ReadinessProfile {
  readonly tenantId: string;
  readonly region: string;
  readonly severityMode: SeverityBand;
  readonly windowHours: number;
  readonly snapshots: readonly ReadinessSnapshot[];
  readonly summary: {
    readonly healthy: number;
    readonly watch: number;
    readonly degraded: number;
    readonly critical: number;
  };
}

export interface ReadinessInputs {
  readonly incidents: readonly IncidentRecord[];
  readonly now: string;
  readonly lookbackMinutes: number;
  readonly minimumSignals: number;
}

export type ReadinessReport<TWindow extends Readonly<{ readonly start: string; readonly end: string }>> =
  Prettify<
    ReadinessProfile & {
      readonly window: TWindow;
      readonly options: Merge<{ readonly minimumSignals: number }, { readonly lookbackMinutes: number }>;
    }
  >;

type DimScore = Omit<ReadinessDimension, 'name'> & Brand<string, 'dimension-score'>;

type SignalGrade = {
  readonly reliability: number;
  readonly speed: number;
  readonly dataIntegrity: number;
  readonly resilience: number;
};

const clamp = (value: number): number => {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const scoreFromSignals = (signals: readonly IncidentSignal[], minimumSignals: number): SignalGrade => {
  const count = signals.length;
  const normalized = count < minimumSignals ? count / minimumSignals : 1;
  const severityBoost = count === 0 ? 0 : (count % 7) / 100;

  const errorRate = signals.find((signal) => signal.name.includes('error'))?.value ?? 0;
  const latency = signals.find((signal) => signal.name.includes('latency'))?.value ?? 0;
  const latencySignal = signals.find((signal) => signal.name.includes('timeout'))?.value ?? 0;
  const consistency = signals.find((signal) => signal.name.includes('drift'))?.value ?? 0;
  const saturation = signals.find((signal) => signal.name.includes('saturation'))?.value ?? 0;
  const recoveries = signals.find((signal) => signal.name.includes('recovery'))?.value ?? 0;

  return {
    reliability: clamp(1 - Math.min(1, (errorRate / 100) + (recoveries / 1000))) * normalized,
    speed: clamp(1 - Math.min(1, (latency / 1000) + (latencySignal / 2000))) * normalized,
    dataIntegrity: clamp(1 - Math.min(1, (consistency / 100) + (saturation / 1000))) * normalized,
    resilience: clamp(1 - Math.min(1, (recoveries / 1000) - severityBoost)) * normalized,
  };
};

const buildDimension = (name: DimensionName, score: number): ReadinessDimension => ({
  name,
  score: Number((clamp(score) * 100).toFixed(2)),
  label: `${name}: ${Math.round(clamp(score) * 100)}%`,
});

const inferState = (score: number, minDimension: number): ReadinessState => {
  if (score >= 0.85 && minDimension >= 0.75) {
    return 'healthy';
  }
  if (score >= 0.7 && minDimension >= 0.55) {
    return 'watch';
  }
  if (score >= 0.45) {
    return 'degraded';
  }
  return 'critical';
};

const severityMode = (incident: IncidentRecord): SeverityBand =>
  incident.labels.includes('panic') ? 'extreme' :
  incident.labels.includes('critical') ? 'critical' :
  incident.labels.includes('high') ? 'high' : incident.severity;

const buildEvidence = (incident: IncidentRecord): ReadinessEvidence => {
  const highestSignal = incident.signals.reduce((top, signal) => {
    const ratio = signal.threshold <= 0 ? 0 : signal.value / signal.threshold;
    const topRatio = top.threshold <= 0 ? 0 : top.value / top.threshold;
    return ratio >= topRatio ? signal : top;
  }, incident.signals[0]);

  const reasons = [
    `tenant=${incident.scope.tenantId}`,
    `service=${incident.scope.serviceName}`,
    `top=${highestSignal.name}`,
  ];

  const confidence = clamp(incident.signals.length / 10);
  return {
    incidentId: incident.id,
    confidence,
    reasons,
  };
};

const latestWindow = (base: string, minutes: number): ReadinessWindow[] => {
  if (minutes <= 0) {
    return [
      {
        startedAt: base,
        label: 'live',
        reason: 'No minimum lookback configured',
      },
    ];
  }
  const start = new Date(Date.parse(base) - minutes * 60_000).toISOString();
  return [{
    startedAt: start,
    endedAt: base,
    label: `lookback-${minutes}m`,
    reason: 'Time-windowed readiness snapshot',
  }];
};

export const buildReadinessSnapshot = (
  incident: IncidentRecord,
  options: ReadinessInputs,
): ReadinessSnapshot => {
  const scoreBySignal = scoreFromSignals(incident.signals, options.minimumSignals);
  const dimensions = [
    buildDimension('reliability', scoreBySignal.reliability),
    buildDimension('speed', scoreBySignal.speed),
    buildDimension('data-integrity', scoreBySignal.dataIntegrity),
    buildDimension('resilience', scoreBySignal.resilience),
  ];
  const score = dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length / 100;
  const minDimension = Math.min(...dimensions.map((dimension) => dimension.score / 100));
  const state = inferState(score, minDimension);
  const windows = latestWindow(options.now, options.lookbackMinutes);

  return {
    incidentId: incident.id,
    state,
    score: Number(score.toFixed(4)),
    dimensions,
    windows,
    evidence: [buildEvidence(incident)],
    updatedAt: options.now,
  };
};

export const composeReadinessProfile = (
  incidents: readonly IncidentRecord[],
  options: ReadinessInputs,
): ReadinessProfile => {
  const targetTenant = incidents[0]?.scope.tenantId ?? 'unknown';
  const targetRegion = incidents[0]?.scope.region ?? 'unknown';
  const snapshots = incidents.map((incident) => buildReadinessSnapshot(incident, options));
  const summary = {
    healthy: snapshots.filter((entry) => entry.state === 'healthy').length,
    watch: snapshots.filter((entry) => entry.state === 'watch').length,
    degraded: snapshots.filter((entry) => entry.state === 'degraded').length,
    critical: snapshots.filter((entry) => entry.state === 'critical').length,
  };

  return {
    tenantId: targetTenant,
    region: targetRegion,
    severityMode: severityMode(incidents[0]),
    windowHours: options.lookbackMinutes / 60,
    snapshots,
    summary,
  };
};

export const mergeReadinessProfiles = (
  left: ReadinessProfile,
  right: ReadinessProfile,
): ReadinessProfile => {
  const snapshotByIncident = new Map<string, ReadinessSnapshot>();
  for (const snapshot of [...left.snapshots, ...right.snapshots]) {
    snapshotByIncident.set(String(snapshot.incidentId), snapshot);
  }
  const snapshots = [...snapshotByIncident.values()];

  return {
    tenantId: left.tenantId,
    region: left.region,
    severityMode: right.severityMode,
    windowHours: Math.max(left.windowHours, right.windowHours),
    snapshots,
    summary: {
      healthy: snapshots.filter((entry) => entry.state === 'healthy').length,
      watch: snapshots.filter((entry) => entry.state === 'watch').length,
      degraded: snapshots.filter((entry) => entry.state === 'degraded').length,
      critical: snapshots.filter((entry) => entry.state === 'critical').length,
    },
  };
};

export const buildReadinessReport = <TWindow extends Readonly<{ readonly start: string; readonly end: string }>>(
  incidents: readonly IncidentRecord[],
  window: TWindow,
  options: Omit<ReadinessInputs, 'incidents'> & { readonly lookbackMinutes?: number },
): ReadinessReport<TWindow> => {
  const now = new Date().toISOString();
  const lookbackMinutes = options.lookbackMinutes ?? 45;
  const inputs: ReadinessInputs = {
    incidents,
    now,
    lookbackMinutes,
    minimumSignals: 3,
  };
  const profile = composeReadinessProfile(incidents, inputs);
  const optionsMerge: Merge<{ readonly minimumSignals: number }, { readonly lookbackMinutes: number }> = {
    minimumSignals: inputs.minimumSignals,
    lookbackMinutes,
  };

  return {
    ...profile,
    window,
    options: optionsMerge,
  };
};

export const scoreToGrade = (score: DimScore): ReadinessState =>
  score.score >= 80 ? 'healthy' : score.score >= 60 ? 'watch' : score.score >= 40 ? 'degraded' : 'critical';

export const pickWorstDimension = (snapshot: ReadinessSnapshot): ReadinessDimension => {
  return snapshot.dimensions.reduce((worst, current) => {
    if (current.score < worst.score) {
      return current;
    }
    return worst;
  }, snapshot.dimensions[0]);
};

export const summarizeReadinessSignals = (snapshots: readonly ReadinessSnapshot[]): string[] =>
  snapshots.flatMap((snapshot) => snapshot.evidence.flatMap((entry) => entry.reasons)).filter((reason) => reason.length > 0).slice(0, 12);
