import { type ReactNode } from 'react';
import type { DriftObservation } from '@domain/recovery-command-network';

interface PolicyDriftBannerProps {
  readonly drifts: readonly DriftObservation[];
  readonly maxItems?: number;
}

const severityClass = (drift: DriftObservation['drift']): string => {
  switch (drift) {
    case 'improving':
      return 'drift-good';
    case 'degrading':
      return 'drift-bad';
    default:
      return 'drift-neutral';
  }
};

const itemLabel = (drift: DriftObservation): ReactNode => {
  const sign = drift.scoreDelta > 0 ? '+' : '';
  return (
    <>
      <strong>{drift.drift}</strong>
      <span> at {new Date(drift.at).toLocaleTimeString()} score {sign}{drift.scoreDelta.toFixed(2)}</span>
      <span> • policy {drift.policyId}</span>
    </>
  );
};

export const PolicyDriftBanner = ({ drifts, maxItems = 6 }: PolicyDriftBannerProps) => {
  const items = drifts.slice(0, maxItems);

  if (drifts.length === 0) {
    return <section className="policy-drift-banner policy-drift-banner--empty">No drift events</section>;
  }

  return (
    <section className="policy-drift-banner">
      <h3>Policy drift feed</h3>
      <ol>
        {items.map((drift) => (
          <li key={`${drift.at}-${drift.policyId}`} className={severityClass(drift.drift)}>
            {itemLabel(drift)}
            <p>{drift.reason}</p>
          </li>
        ))}
      </ol>
      {drifts.length > maxItems ? <p>{drifts.length - maxItems} more drift events hidden</p> : null}
    </section>
  );
};
