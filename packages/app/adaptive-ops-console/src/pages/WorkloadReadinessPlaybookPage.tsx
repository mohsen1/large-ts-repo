import { useCallback, useMemo, useState } from 'react';
import { useWorkloadForecast } from '../hooks/useWorkloadForecast';
import { buildDependencySeed } from '@data/recovery-workload-store';
import { WorkloadForecastSummary } from '../components/workload/WorkloadForecastSummary';
import { WorkloadTopologyPanel } from '../components/workload/WorkloadTopologyPanel';

export const WorkloadReadinessPlaybookPage = () => {
  const [selectedTeam, setSelectedTeam] = useState('all');
  const {
    workspace,
    summary,
    coverage,
    setTenant,
    setSamples,
    setCriticalOnly,
    setLookback,
    refresh,
  } = useWorkloadForecast();

  const graph = buildDependencySeed(workspace.tenantId, workspace.samples);
  const topRiskMessage = useMemo(() => {
    const top = summary.topNodes.at(-1);
    if (!top) {
      return 'No critical nodes';
    }
    return `Top risk node: ${top}`;
  }, [summary.topNodes]);

  const filteredNodes = graph.nodes
    .filter((node) => selectedTeam === 'all' || node.team === selectedTeam)
    .sort((left, right) => right.criticality - left.criticality || left.name.localeCompare(right.name));

  const onTeamChange = useCallback((value: string) => {
    setSelectedTeam(value);
  }, []);

  return (
    <main className="workload-readiness-playbook">
      <header>
        <h1>Workload Readiness Playbook</h1>
      </header>
      <section>
        <label>
          Tenant
          <input value={workspace.tenantId} onChange={(event) => setTenant(event.target.value)} />
        </label>
        <label>
          Sample count
          <input
            type="number"
            min={4}
            max={50}
            value={workspace.samples}
            onChange={(event) => setSamples(Number(event.target.value))}
          />
        </label>
        <label>
          Lookback days
          <input
            type="number"
            min={1}
            max={90}
            value={workspace.lookbackDays}
            onChange={(event) => setLookback(Number(event.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={workspace.criticalOnly}
            onChange={(event) => setCriticalOnly(event.target.checked)}
          />
          show critical only
        </label>
        <select value={selectedTeam} onChange={(event) => onTeamChange(event.target.value)}>
          <option value="all">All teams</option>
          <option value="team-0">team-0</option>
          <option value="team-1">team-1</option>
          <option value="team-2">team-2</option>
          <option value="team-3">team-3</option>
        </select>
        <button onClick={() => { void refresh(); }}>Regenerate</button>
      </section>
      <section>
        <h3>Readiness score</h3>
        <p>{(coverage * 100).toFixed(2)} %</p>
        <p>Topology depth: {summary.topologyDepth}</p>
        <p>Window count: {summary.windowCount}</p>
        <p>Alert count: {summary.alertCount}</p>
        <p>{topRiskMessage}</p>
        <p>Criticality mean risk: {(summary.risk * 100).toFixed(1)}%</p>
      </section>
      <WorkloadForecastSummary
        tenantId={workspace.tenantId}
        plans={summary.windowCount}
        warnings={summary.topNodes.map((node) => `risk-priority:${node}`)}
        coverage={coverage}
        queue={summary.topNodes}
        onRunAgain={() => {
          void refresh();
        }}
      />
      <WorkloadTopologyPanel graph={{
        ...graph,
        nodes: filteredNodes,
      }} />
      <section>
        <h3>Prepared playbook steps</h3>
        <ul>
          <li>Collect dependency deltas for `{workspace.tenantId}`</li>
          <li>Confirm control mode and freeze windows</li>
          <li>Run forecast with `{workspace.samples}` samples and `{workspace.lookbackDays}` lookback</li>
          <li>Review queue before execute</li>
        </ul>
      </section>
    </main>
  );
};
