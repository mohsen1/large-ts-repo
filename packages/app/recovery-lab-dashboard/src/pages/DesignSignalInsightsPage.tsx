import { useState } from 'react';
import { DesignSignalPulsePanel } from '../components/DesignSignalPulsePanel';
import { useDesignSignalStream } from '../hooks/useDesignSignalStream';
import type { DesignSignalKind } from '@domain/recovery-orchestration-design';

interface DesignSignalInsightsPageProps {
  readonly tenant: string;
  readonly workspace: string;
}

const supported: readonly DesignSignalKind[] = ['health', 'capacity', 'compliance', 'cost', 'risk'];

export const DesignSignalInsightsPage = ({ tenant, workspace }: DesignSignalInsightsPageProps) => {
  const [metric, setMetric] = useState<DesignSignalKind>('health');
  const stream = useDesignSignalStream({ tenant, workspace, metric });

  const summary = stream.windows
    .flat()
    .reduce(
      (acc, window, index) => {
        const score = acc.sum + window.count * (index + 1);
        return {
          ...acc,
          sum: score,
        };
      },
      { sum: 0 },
    );

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <h1>Signal insights</h1>
      <section style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label htmlFor="metric-picker">metric</label>
        <select
          id="metric-picker"
          value={metric}
          onChange={(event) => setMetric(event.currentTarget.value as DesignSignalKind)}
        >
          {supported.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void stream.refresh()}>
          refresh
        </button>
      </section>

      <section>
        <p>streaming={stream.loading ? 'loading' : 'ready'} count={stream.signalCount}</p>
        <p>hasData={stream.hasData ? 'yes' : 'no'}</p>
        <p>weighted={summary.sum}</p>
      </section>

      <DesignSignalPulsePanel tenant={tenant} workspace={workspace} metric={metric} />
      <section>
        <h2>Raw diagnostics</h2>
        <ul>
          {stream.diagnostics.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>
      </section>
    </main>
  );
};
