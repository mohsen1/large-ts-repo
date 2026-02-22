import { useMemo } from 'react';
import type { CommandWindowSample } from '@domain/recovery-operations-models/command-window-forecast';
import { aggregateWindow } from '@domain/recovery-operations-models/command-window-forecast';

interface CommandWindowTimelineProps {
  readonly title: string;
  readonly samples: readonly CommandWindowSample[];
}

const formatSample = (sample: CommandWindowSample): string => {
  return `${sample.sampleId}: state=${sample.state} started=${sample.startedAt} metrics=${sample.metrics.length}`;
};

const toProgressColor = (value: number): string => {
  if (value >= 0.66) {
    return 'var(--good)';
  }
  if (value >= 0.33) {
    return 'var(--warn)';
  }
  return 'var(--alert)';
};

const buildTrend = (samples: readonly CommandWindowSample[]): string => {
  if (samples.length < 2) {
    return 'insufficient';
  }

  const first = aggregateWindow(samples[0]);
  const last = aggregateWindow(samples[samples.length - 1]);

  if (last.score > first.score) {
    return 'improving';
  }
  if (last.score < first.score) {
    return 'degrading';
  }
  return 'stable';
};

export const CommandWindowTimeline = ({ title, samples }: CommandWindowTimelineProps) => {
  const prepared = useMemo(() => {
    const aggregates = samples.map((sample) => aggregateWindow(sample));
    const trend = buildTrend(samples);
    return {
      aggregates,
      trend,
      meanScore: aggregates.reduce((sum, aggregate) => sum + aggregate.score, 0) / (aggregates.length || 1),
    };
  }, [samples]);

  return (
    <section className="command-window-timeline">
      <header>
        <h3>{title}</h3>
        <p>{`trend=${prepared.trend} score=${prepared.meanScore.toFixed(3)} points=${prepared.aggregates.length}`}</p>
      </header>
      <ul>
        {prepared.aggregates.map((aggregate) => {
          const color = toProgressColor(aggregate.score);
          return (
            <li key={aggregate.windowId}>
              <span>{aggregate.windowId}</span>
              <strong>{aggregate.score.toFixed(3)}</strong>
              <span style={{ color }}>{aggregate.trend}</span>
              <span>{aggregate.confidence.toFixed(2)}</span>
            </li>
          );
        })}
      </ul>
      <pre>{samples.map(formatSample).join('\n')}</pre>
    </section>
  );
};
