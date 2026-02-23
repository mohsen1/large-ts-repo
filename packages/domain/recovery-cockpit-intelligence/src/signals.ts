import {
  CockpitSignal,
  ForecastSignal,
  OperationalSignal,
  SignalSeverity,
} from '@domain/recovery-cockpit-models';

export type NormalizedSignal = {
  readonly kind: 'forecast' | 'operational';
  readonly severity: SignalSeverity;
  readonly source: string;
  readonly weight: number;
  readonly message: string;
};

type MutableDigest = {
  critical: number;
  warning: number;
  notice: number;
  info: number;
};

export type Digest = {
  readonly critical: number;
  readonly warning: number;
  readonly notice: number;
  readonly info: number;
};

const severityWeight = (severity: SignalSeverity): number => {
  if (severity === 'critical') return 4;
  if (severity === 'warning') return 3;
  if (severity === 'notice') return 2;
  return 1;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const normalizeSignal = (signal: CockpitSignal): NormalizedSignal => {
  if ('code' in signal) {
    const operational = signal as OperationalSignal;
    return {
      kind: 'operational',
      severity: operational.severity,
      source: `ops:${operational.code}`,
      weight: clamp(Math.max(1, operational.message.length), 1, 20),
      message: operational.message,
    };
  }

  const forecast = signal as ForecastSignal;
  return {
    kind: 'forecast',
    severity: forecast.severity,
    source: `forecast:${forecast.source}`,
    weight: clamp(Math.abs(forecast.score), 1, 20),
    message: forecast.title,
  };
};

export const summarize = (signals: readonly CockpitSignal[]): Digest => {
  let digest: MutableDigest = {
    critical: 0,
    warning: 0,
    notice: 0,
    info: 0,
  };

  for (const signal of signals) {
    const normalized = normalizeSignal(signal);
    if (normalized.severity === 'critical') {
      digest = { ...digest, critical: digest.critical + normalized.weight };
    } else if (normalized.severity === 'warning') {
      digest = { ...digest, warning: digest.warning + normalized.weight };
    } else if (normalized.severity === 'notice') {
      digest = { ...digest, notice: digest.notice + normalized.weight };
    } else {
      digest = { ...digest, info: digest.info + normalized.weight };
    }
  }

  return digest;
};

export const scoreFromSignals = (signals: readonly CockpitSignal[]): number => {
  const digest = summarize(signals);
  const weighted =
    digest.critical * severityWeight('critical') +
    digest.warning * severityWeight('warning') +
    digest.notice * severityWeight('notice') +
    digest.info * severityWeight('info');
  return clamp(weighted, 0, 100);
};

export const topSignals = (signals: readonly CockpitSignal[], limit = 3): readonly CockpitSignal[] => {
  return [...signals]
    .sort((left, right) => {
      const leftSeverity = normalizeSignal(left).severity;
      const rightSeverity = normalizeSignal(right).severity;
      return severityWeight(leftSeverity) - severityWeight(rightSeverity);
    })
    .slice(0, limit);
};

export const signature = (signals: readonly CockpitSignal[]): string =>
  [...signals]
    .map((signal) => {
      if ('code' in signal) {
        const operational = signal as OperationalSignal;
        return `${operational.code}:${operational.id}`;
      }
      const forecast = signal as ForecastSignal;
      return `${forecast.source}:${forecast.signalId}`;
    })
    .sort()
    .join('|');
