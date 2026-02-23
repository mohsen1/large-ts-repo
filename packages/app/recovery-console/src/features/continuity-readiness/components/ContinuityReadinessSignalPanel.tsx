import { useMemo, type ReactElement } from 'react';
import type { ContinuityReadinessEnvelope } from '@domain/recovery-continuity-readiness';

interface Props {
  readonly title: string;
  readonly envelope: ContinuityReadinessEnvelope | null;
}

export const ContinuityReadinessSignalPanel = ({ title, envelope }: Props): ReactElement => {
  const projection = envelope?.projection;
  const signals = envelope?.surface.signals ?? [];
  const riskBuckets = useMemo(() => {
    const result: Record<string, number> = {};
    for (const signal of signals) {
      const band = signal.severity >= 75 ? 'high' : signal.severity >= 50 ? 'medium' : 'low';
      result[band] = (result[band] ?? 0) + 1;
    }
    return result;
  }, [signals]);

  return (
    <section>
      <h3>{title}</h3>
      <p>{`signals=${signals.length}`}</p>
      <p>{`trend=${projection?.trend ?? 'n/a'} confidence=${projection?.confidence ?? 'n/a'}`}</p>
      <p>{`low=${riskBuckets.low ?? 0} medium=${riskBuckets.medium ?? 0} high=${riskBuckets.high ?? 0}`}</p>
      <ul>
        {signals.slice(0, 12).map((signal) => (
          <li key={signal.id}>{`${signal.title} source=${signal.source} severity=${signal.severity}`}</li>
        ))}
      </ul>
    </section>
  );
};
