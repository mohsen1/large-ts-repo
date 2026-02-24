import { useMemo } from 'react';
import { StressLabControlPanel } from '../components/StressLabControlPanel';
import { StressLabSignalLedger } from '../components/StressLabSignalLedger';
import { useStressLabPlugins } from '../hooks/useStressLabPlugins';

const topSignals = [
  {
    id: 'seed-event-0',
    class: 'availability',
    severity: 'high',
    title: 'control-plane high-latency',
    createdAt: new Date().toISOString(),
    metadata: { source: 'seed', confidence: 0.93 },
  },
  {
    id: 'seed-event-1',
    class: 'performance',
    severity: 'medium',
    title: 'cache miss spike',
    createdAt: new Date(Date.now() - 1_000).toISOString(),
    metadata: { source: 'seed', confidence: 0.8 },
  },
];

export const StreamingStressLabControlPage = () => {
  const tenantId = 'tenant-main';
  const plugins = useStressLabPlugins(tenantId);

  const pluginDigest = useMemo(() => {
    return plugins.summary
      ? plugins.summary
          .split('|')
          .map((part) => part.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
  }, [plugins.summary]);

  return (
    <main>
      <h1>Streaming Stress Lab Control</h1>
      <p>
        Plugin stage: <strong>{plugins.stage}</strong>
      </p>
      <p>Entries: {plugins.summaryCount}</p>
      <p>Registry state: {plugins.ready ? 'ready' : 'loading'}</p>

      <section>
        <h2>Digest</h2>
        <ul>
          {pluginDigest.map((entry) => (
            <li key={`${tenantId}-${entry}`}>{entry}</li>
          ))}
        </ul>
      </section>

      <StressLabControlPanel
        tenantId={tenantId}
        runbookCount={3}
        onRunComplete={(runId) => {
          console.log('runId', runId);
        }}
      />

      <StressLabSignalLedger events={topSignals} />

      <button type="button" onClick={plugins.refresh}>
        Refresh registry snapshot
      </button>
      <button type="button" onClick={plugins.reset}>
        Reset registry snapshot
      </button>
    </main>
  );
};
