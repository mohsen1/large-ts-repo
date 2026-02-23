import { memo, useMemo } from 'react';

import { type SignalPulse } from '@domain/recovery-signal-intelligence';

interface SignalPulseGridProps {
  pulses: SignalPulse[];
  title: string;
}

const confidenceLabel = (value: number) => {
  if (value >= 0.75) {
    return 'high confidence';
  }
  if (value >= 0.5) {
    return 'medium confidence';
  }
  return 'low confidence';
};

const computeDrift = (pulse: SignalPulse): number => {
  const baseline = Math.abs(pulse.baseline || 1);
  return (pulse.value - pulse.baseline) / baseline;
};

const Row = memo(({ pulse, drift }: { pulse: SignalPulse; drift: number }) => {
  return (
    <li>
      <div>
        {pulse.dimension} · {pulse.id}
      </div>
      <div>value {pulse.value.toFixed(2)} / base {pulse.baseline.toFixed(2)}</div>
      <div>drift {drift.toFixed(4)} ({confidenceLabel(pulse.weight)})</div>
    </li>
  );
});

export const SignalPulseGrid = ({ pulses, title }: SignalPulseGridProps) => {
  const ordered = useMemo(() => [...pulses].sort((left, right) => right.value - left.value), [pulses]);

  return (
    <section style={{ border: '1px solid #cfd8dc', borderRadius: 8, padding: 12 }}>
      <h3>{title}</h3>
      <ol>
        {ordered.map((pulse) => {
          const drift = computeDrift(pulse);
          return <Row key={pulse.id} pulse={pulse} drift={drift} />;
        })}
      </ol>
    </section>
  );
};
