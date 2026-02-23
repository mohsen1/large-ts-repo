import { FC, useMemo } from 'react';
import { CommandEvent, PlanId, SignalDigest } from '@domain/recovery-cockpit-models';
import { scoreFromSignals } from '@domain/recovery-cockpit-intelligence';
import { CockpitSignal } from '@domain/recovery-cockpit-models';

type SignalBucket = {
  readonly severity: string;
  readonly count: number;
  readonly percent: number;
};

export type PlanSignalInspectorProps = {
  readonly planId: PlanId;
  readonly events: readonly CommandEvent[];
  readonly digest: SignalDigest;
};

const signalLabel = (signal: CockpitSignal): string => {
  if ('code' in signal) {
    return `ops:${signal.code}`;
  }
  if ('signalId' in signal) {
    return `forecast:${signal.signalId}`;
  }
  return `event:${signal.eventId}`;
};

const signalStatus = (signal: CockpitSignal): string => {
  if ('status' in signal) {
    return signal.status;
  }
  if ('severity' in signal) {
    return signal.severity;
  }
  return 'unknown';
};

const signalAt = (signal: CockpitSignal): string => {
  if ('at' in signal) {
    return signal.at;
  }
  if ('seenAt' in signal) {
    return signal.seenAt;
  }
  return signal.expiresAt ?? 'n/a';
};

export const PlanSignalInspector: FC<PlanSignalInspectorProps> = ({ planId, events, digest }) => {
  const buckets = useMemo<SignalBucket[]>(() => {
    const total = Math.max(1, events.length);
    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.status, (counts.get(event.status) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([severity, count]) => ({
        severity,
        count,
        percent: Number(((count / total) * 100).toFixed(2)),
      }))
      .sort((left, right) => right.count - left.count);
  }, [events]);

  const signalScore = useMemo(() => scoreFromSignals(digest.signals), [digest.signals]);

  return (
    <section style={{ border: '1px solid #e2e5ea', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>Signal Inspector</h3>
      <p>Plan: {planId}</p>
      <p>
        Active: {digest.activeCount} | Critical: {digest.criticalCount} | Muted: {digest.mutedCount}
      </p>
      <p>Signal score: {signalScore.toFixed(2)}</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {buckets.map((bucket) => (
          <li key={bucket.severity}>
            {bucket.severity}: {bucket.count} ({bucket.percent}%)
          </li>
        ))}
      </ul>
      <p style={{ marginBottom: 0 }}>Top severity signals:
        {digest.signals.slice(0, 3).map((signal, index) => (
          <span key={`${signalLabel(signal)}-${index}`} style={{ display: 'block' }}>
            {signalLabel(signal)} {signalStatus(signal)} @ {signalAt(signal)}
          </span>
        ))}
      </p>
    </section>
  );
};
