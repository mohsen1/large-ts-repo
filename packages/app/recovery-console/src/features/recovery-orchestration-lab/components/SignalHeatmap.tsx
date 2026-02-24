import { memo, type ReactElement } from 'react';
import type { IncidentCriticality, RecoverySignal, SignalCategory } from '../domain/models';

export interface SignalHeatmapProps {
  readonly tenant: string;
  readonly signals: readonly RecoverySignal[];
}

type SeverityMap = {
  [K in IncidentCriticality]: {
    readonly hue: number;
    readonly label: string;
  };
};

const severityMap = {
  critical: { hue: 356, label: 'Critical' },
  high: { hue: 24, label: 'High' },
  moderate: { hue: 48, label: 'Moderate' },
  low: { hue: 210, label: 'Low' },
} satisfies SeverityMap;

const categoryLabel = (category: SignalCategory): string => {
  const [domain, subject = 'unknown'] = category.split('/');
  return `${domain} / ${subject}`;
};

export const SignalHeatmap = memo(function SignalHeatmap(props: SignalHeatmapProps): ReactElement {
  return (
    <section className="signal-heatmap">
      <h3>Signal Heatmap — {props.tenant}</h3>
      <div>
        {props.signals.map((signal) => {
          const entry = severityMap[signal.severity];
          const score = Math.min(100, Math.max(4, signal.detail.value * 100));
          return (
            <article
              key={signal.id}
              className="heatmap-row"
              style={{
                background: `linear-gradient(90deg, hsl(${entry.hue}, 68%, 45%) ${score}%, rgba(0, 0, 0, 0.1) ${score + 4}%)`,
              }}
            >
              <header>
                <strong>{categoryLabel(signal.category)}</strong>
                <span>{entry.label}</span>
              </header>
              <p>{signal.detail.code}</p>
              <small>{signal.origin}</small>
              <strong>{signal.detail.value.toFixed(2)}</strong>
            </article>
          );
        })}
      </div>
    </section>
  );
});
