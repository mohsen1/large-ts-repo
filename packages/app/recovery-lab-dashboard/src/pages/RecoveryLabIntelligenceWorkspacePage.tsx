import { useMemo } from 'react';
import { IntelligenceCommandPanel } from '../components/IntelligenceCommandPanel';
import { IntelligenceTopologyPanel } from '../components/IntelligenceTopologyPanel';
import { SignalInsightsPanel } from '../components/SignalInsightsPanel';
import { useIntelligenceWorkspace } from '../hooks/useIntelligenceWorkspace';

const summarizeRuns = (timeline: readonly string[]): readonly {
  readonly latest: string;
  readonly history: readonly string[];
}[] => {
  const map = new Map<string, { readonly latest: string; readonly history: readonly string[] }>();
  for (const entry of timeline) {
    const [date, mode, severity] = entry.split(':');
    const existing = map.get(mode) ?? { latest: date, history: [] };
    map.set(mode, {
      latest: date,
      history: [...existing.history, `${mode}:${severity}`],
    });
  }
  return [...map.entries()]
    .map(([mode, payload]) => ({ latest: payload.latest, history: payload.history }))
    .sort((left, right) => right.latest.localeCompare(left.latest));
};

const laneSummary = (timeline: readonly string[]): number => {
  const groups = summarizeRuns(timeline);
  return groups.length;
};

const toMetricRows = (timeline: readonly string[]): readonly { readonly label: string; readonly count: number }[] => {
  const counts = new Map<string, number>();
  for (const entry of timeline) {
    const label = entry.split(':')[0] ?? 'unknown';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
};

const renderRows = (rows: readonly { readonly label: string; readonly count: number }[]) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead>
      <tr>
        <th style={{ textAlign: 'left' }}>bucket</th>
        <th style={{ textAlign: 'left' }}>count</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.label}>
          <td>{row.label}</td>
          <td>{row.count}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const RecoveryLabIntelligenceWorkspacePage = (): React.JSX.Element => {
  const {
    tenant,
    scenario,
    loading,
    mode,
    lane,
    seedHistory,
    timeline,
    eventCount,
    registryCount,
    registryRoute,
    planSummary,
    outputScore,
    laneLabel,
    modeLabel,
    runId,
    summary,
    start,
    setTenant,
    setScenario,
    setMode,
    setLane,
  } = useIntelligenceWorkspace();

  const metricRows = useMemo(() => toMetricRows(timeline), [timeline]);
  const grouped = useMemo(() => summarizeRuns(timeline), [timeline]);
  const laneCount = laneSummary(timeline);

  const summaryText = useMemo(
    () => `avg=${summary.avgScore.toFixed(3)} maxEvents=${summary.maxEvents} minEvents=${summary.minEvents}`,
    [summary],
  );

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <h1>Recovery Lab Intelligence Workspace</h1>

      <IntelligenceCommandPanel
        tenant={tenant}
        scenario={scenario}
        mode={mode}
        lane={lane}
        loading={loading}
        disabled={timeline.length > 0}
        onModeChange={setMode}
        onLaneChange={setLane}
        onTenantChange={setTenant}
        onScenarioChange={setScenario}
        onStart={start}
      />

      <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
        <h2>Run envelope</h2>
        <p>{`runId=${runId}`}</p>
        <p>{`modeLabel=${modeLabel} laneLabel=${laneLabel}`}</p>
        <p>{`events=${eventCount} registries=${registryCount}`}</p>
        <p>{`score=${outputScore.toFixed(3)} plan=${planSummary}`}</p>
        <p>{`registryRoute=${registryRoute}`}</p>
        <p>{summaryText}</p>
      </section>

      <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
        <h2>Lane summary</h2>
        <p>{`lane groups: ${laneCount}`}</p>
        {renderRows(metricRows)}
      </section>

      <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
        <h2>Recent timeline groups</h2>
        <ul>
          {grouped.map((entry) => (
            <li key={`${entry.latest}`}>
              {`${entry.latest} · ${entry.history.join(', ')}`}
            </li>
          ))}
        </ul>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <SignalInsightsPanel tenant={tenant} scenario={scenario} mode={mode} lane={lane} />
        <IntelligenceTopologyPanel workspace={tenant} tenant={tenant} mode={mode} />
      </div>

      <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
        <h2>Seed history</h2>
        <ul>
          {seedHistory.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
