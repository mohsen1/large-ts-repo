import { useMemo } from 'react';
import { OrchestrationSuiteControl } from '../components/orchestration/OrchestrationSuiteControl';
import { PolicyDeckPanel } from '../components/orchestration/PolicyDeckPanel';
import { ScenarioSignalTimeline } from '../components/orchestration/ScenarioSignalTimeline';
import { useOrchestrationSuite } from '../hooks/useOrchestrationSuite';

const buildModeText = (mode: 'single' | 'batch'): string => {
  if (mode === 'batch') {
    return 'batch orchestration mode';
  }
  return 'single orchestration mode';
};

const formatOutput = (score: number, count: number): string => `score=${score.toFixed(4)} events=${count}`;

export const RecoveryLabOrchestrationSuitePage = (): React.JSX.Element => {
  const {
    mode,
    input,
    loading,
    message,
    outputs,
    lastOutput,
    outputCount,
    runSuite,
    queue,
    setTenant,
    setWorkspace,
    setScenario,
    setRepeats,
    setMode,
  } = useOrchestrationSuite();

  const latestOutput = useMemo(
    () => {
      const status = lastOutput?.result.summary.tenant ?? 'none';
      const eventCount = lastOutput?.result.summary.eventCount ?? 0;
      const score = lastOutput?.result.summary.score ?? 0;
      return {
        status,
        summary: formatOutput(score, eventCount),
      };
    },
    [lastOutput],
  );

  const topTenant = useMemo(() => {
    const countByTenant = new Map<string, number>();
    for (const output of outputs) {
      countByTenant.set(output.result.summary.tenant, (countByTenant.get(output.result.summary.tenant) ?? 0) + 1);
    }
    return [...countByTenant.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'none';
  }, [outputs]);

  const statusCards = useMemo(() => [
    {
      title: 'Mode',
      value: buildModeText(mode),
      description: message,
    },
    {
      title: 'Last output',
      value: latestOutput.status,
      description: latestOutput.summary,
    },
    {
      title: 'Top tenant',
      value: topTenant,
      description: `outputs=${outputCount}`,
    },
  ], [mode, message, latestOutput, outputCount, topTenant]);

  const policySummary = useMemo(() => {
    if (mode === 'single') {
      return ['simulate', 'verify', 'restore'];
    }
    return ['batch-scan', 'batch-drain', 'batch-prove'];
  }, [mode]);

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <h1>Recovery Lab Orchestration Suite</h1>

      <section
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}
      >
        {statusCards.map((card) => (
          <article
            key={`${card.title}-${card.value}`}
            style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}
          >
            <h4>{card.title}</h4>
            <strong>{card.value}</strong>
            <p>{card.description}</p>
          </article>
        ))}
      </section>

      <section style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={() => setMode('single')} disabled={loading}>
          single
        </button>
        <button type="button" onClick={() => setMode('batch')} disabled={loading}>
          batch
        </button>
        <span>{`policy-set=${policySummary.join('|')}`}</span>
      </section>

      <OrchestrationSuiteControl
        input={input}
        loading={loading}
        disabled={loading}
        onTenantChange={setTenant}
        onWorkspaceChange={setWorkspace}
        onScenarioChange={setScenario}
        onRepeatsChange={setRepeats}
        onStart={runSuite}
        onQueue={queue}
      />

      <PolicyDeckPanel outputs={outputs} />
      <ScenarioSignalTimeline outputs={outputs} />

      <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
        <h3>Raw logs</h3>
        <ul>
          {outputs.map((entry) => (
            <li key={`${entry.seed}-${entry.startedAt}`}>
              {`${entry.seed} windows=${entry.result.summary.windowCount} events=${entry.result.summary.eventCount}`}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
