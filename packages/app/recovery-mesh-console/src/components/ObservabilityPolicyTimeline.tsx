import { useMemo } from 'react';
import { type MeshPayloadFor, type MeshSignalKind } from '@domain/recovery-ops-mesh';

interface PolicySpan<TKind extends MeshSignalKind = MeshSignalKind> {
  readonly kind: TKind;
  readonly index: number;
  readonly trace: number;
}

export interface ObservabilityPolicyTimelineProps {
  readonly policySignals: readonly MeshPayloadFor<MeshSignalKind>[];
  readonly baseline: readonly string[];
  readonly onInspect?: (signal: MeshPayloadFor<MeshSignalKind>, rank: number) => void;
}

type PulseSignal = Extract<MeshPayloadFor<MeshSignalKind>, { readonly kind: 'pulse' }>;
type AlertSignal = Extract<MeshPayloadFor<MeshSignalKind>, { readonly kind: 'alert' }>;
type SnapshotSignal = Extract<MeshPayloadFor<MeshSignalKind>, { readonly kind: 'snapshot' }>;
type TelemetrySignal = Extract<MeshPayloadFor<MeshSignalKind>, { readonly kind: 'telemetry' }>;

const isPulseSignal = (signal: MeshPayloadFor<MeshSignalKind>): signal is PulseSignal =>
  signal.kind === 'pulse';
const isAlertSignal = (signal: MeshPayloadFor<MeshSignalKind>): signal is AlertSignal =>
  signal.kind === 'alert';
const isSnapshotSignal = (signal: MeshPayloadFor<MeshSignalKind>): signal is SnapshotSignal =>
  signal.kind === 'snapshot';
const isTelemetrySignal = (signal: MeshPayloadFor<MeshSignalKind>): signal is TelemetrySignal =>
  signal.kind === 'telemetry';

const scoreFor = (signal: MeshPayloadFor<MeshSignalKind>): number => {
  if (isPulseSignal(signal)) {
    return signal.payload.value;
  }
  if (isAlertSignal(signal)) {
    return signal.payload.severity === 'critical' ? 100 : 20;
  }
  if (isSnapshotSignal(signal)) {
    return signal.payload.name.length;
  }
  if (isTelemetrySignal(signal)) {
    return Object.keys(signal.payload.metrics).reduce((acc, key) => acc + key.length, 0);
  }
  return 0;
};

export const ObservabilityPolicyTimeline = ({
  policySignals,
  baseline,
  onInspect,
}: ObservabilityPolicyTimelineProps) => {
  const spans = useMemo(
    () => buildTimeline(policySignals).toSorted((left, right) => right.trace - left.trace),
    [policySignals],
  );

  return (
    <section>
      <h3>Policy Timeline</h3>
      <p>{`baseline entries: ${baseline.length}`}</p>
      <ol>
        {spans.map((span) => (
          <li key={`${span.kind}:${span.index}`}>
            <button
              type="button"
              onClick={() => onInspect?.(policySignals[span.index], span.index)}
            >
              {span.kind}:{span.trace}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};

const buildTimeline = <TSignals extends readonly MeshPayloadFor<MeshSignalKind>[]>(
  policySignals: TSignals,
): readonly PolicySpan<MeshSignalKind>[] =>
  policySignals
    .map((signal, index) => ({
      kind: signal.kind,
      index,
      trace: scoreFor(signal),
    }))
    .filter((entry): entry is PolicySpan<MeshSignalKind> =>
      Number.isFinite(entry.trace),
    );
