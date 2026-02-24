import { useMemo } from 'react';
import { useIntelligenceSignals, type SignalSample } from '../hooks/useIntelligenceSignals';
import type { OrchestrationMode, OrchestrationLane } from '@domain/recovery-lab-intelligence-core';

interface SignalInsightsPanelProps {
  readonly tenant: string;
  readonly scenario: string;
  readonly mode: OrchestrationMode;
  readonly lane: OrchestrationLane;
}

interface BucketRow {
  readonly mode: string;
  readonly lane: string;
  readonly score: number;
  readonly events: number;
}

export const SignalInsightsPanel = ({ tenant, scenario, mode, lane }: SignalInsightsPanelProps): React.JSX.Element => {
  const { loading, samples, labels, refresh, clear, aggregate } = useIntelligenceSignals();

  const buckets = useMemo(() => {
    const result: BucketRow[] = [];
    const modeLabel = `${mode}-${lane}`;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      if (!sample) {
        continue;
      }
      result.push({
        mode: `${modeLabel}#${index}`,
        lane,
        score: sample.score,
        events: sample.eventCount,
      });
    }
    return result.toSorted((left, right) => right.score - left.score);
  }, [samples, mode, lane]);

  const lines = useMemo(() => {
    const all = [...samples].toSorted((left, right) => right.score - left.score);
    return all.map((sample, index) => `${index} ${sample.label} score=${sample.score.toFixed(4)} events=${sample.eventCount}`);
  }, [samples]);

  return (
    <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
      <h3>Signal insights</h3>
      <p>{`tenant=${tenant} scenario=${scenario}`}</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => {
            void refresh({ tenant, scenario, mode, lane, repeats: 4 });
          }}
          disabled={loading}
        >
          {loading ? 'loading...' : 'refresh'}
        </button>
        <button type="button" onClick={clear}>
          clear
        </button>
      </div>

      <section>
        <h4>Aggregate</h4>
        <p>peak score: {aggregate.peak.toFixed(4)}</p>
        <p>events total: {aggregate.totalEvents}</p>
      </section>

      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>mode</th>
            <th>lane</th>
            <th>score</th>
            <th>events</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={`${bucket.mode}-${bucket.lane}`}>
              <td>{bucket.mode}</td>
              <td>{bucket.lane}</td>
              <td>{bucket.score.toFixed(4)}</td>
              <td>{bucket.events}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Latest lines</h4>
      <ul>
        {labels.map((label, index) => (
          <li key={`${label}-${index}`}>{label}</li>
        ))}
      </ul>

      <pre style={{ whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</pre>
    </section>
  );
};
