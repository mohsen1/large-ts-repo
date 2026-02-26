import { useMemo } from 'react';
import { executeFlow, runFlowGraph } from '@domain/recovery-lab-stress-lab-core/src/flow-control-graph';
import { useStressControlStudio } from '../hooks/useStressControlStudio';
import { StressControlStudioBoard } from '../components/StressControlStudioBoard';
import type { StressPanelMode, StressSection } from '../types';
import { defaultStressPanelConfig } from '../types';

const sectionSeed = (mode: StressPanelMode): StressSection[] => {
  if (mode === 'dashboard') {
    return [
      { kind: 'summary', value: 100 },
      { kind: 'warning', reason: 'high load' },
      { kind: 'warning', reason: 'latency spikes in continuity' },
    ];
  }
  if (mode === 'planner') {
    return [
      { kind: 'summary', value: 75 },
      { kind: 'warning', reason: 'plan horizon drift' },
      { kind: 'summary', value: 92 },
    ];
  }
  if (mode === 'inspector') {
    return [
      { kind: 'summary', value: 42 },
      { kind: 'error', code: 'insp-001' },
      { kind: 'warning', reason: 'non-empty orphan traces' },
    ];
  }
  if (mode === 'audit') {
    return [
      { kind: 'summary', value: 88 },
      { kind: 'summary', value: 77 },
      { kind: 'warning', reason: 'audit queue backlog' },
    ];
  }
  return [
    { kind: 'summary', value: 31 },
    { kind: 'warning', reason: 'trace path unstable' },
  ];
};

export const RecoveryStressControlStudioPage = () => {
  const tenant = 'tenant-stress-control';
  const initial = 'dashboard' as const;
  const { state, setMode, refresh, run, config, buckets } = useStressControlStudio(tenant, initial);
  const sections = useMemo(() => sectionSeed(state.mode), [state.mode]);

  const lattice = state.lattice;
  const execution = runFlowGraph(state.commands.map((command) => ({
    commandId: command.id,
    phase: state.mode === 'dashboard' ? 'init' : state.mode === 'planner' ? 'dispatch' : state.mode === 'inspector' ? 'validate' : 'coordinate',
    domain: command.id.includes('1') ? 'fabric' : command.id.includes('2') ? 'timeline' : 'ops',
    domainIndex: command.id.length,
    severity: command.severity,
  })));

  const score = executeFlow(state.commands.map((command) => ({
    commandId: command.id,
    phase: command.severity > 5 ? 'execute' : 'dispatch',
    domain: command.id.length % 2 === 0 ? 'signal' : 'cadence',
    domainIndex: command.id.length + command.severity,
    severity: command.severity,
  })));

  const bucketSummary = useMemo(() => {
    const active = buckets.low_bucket.length + buckets.medium_bucket.length + buckets.high_bucket.length;
    return {
      low: buckets.low_bucket.length,
      medium: buckets.medium_bucket.length,
      high: buckets.high_bucket.length,
      active,
      configBatch: config.batchSize,
      includeSimulation: config.includeSimulation,
      includeAudit: config.includeAudit,
    };
  }, [buckets.high_bucket.length, buckets.low_bucket.length, buckets.medium_bucket.length, config.batchSize, config.includeAudit, config.includeSimulation]);

  const fallbackConfig = defaultStressPanelConfig(tenant);
  const modeOptions: readonly StressPanelMode[] = ['dashboard', 'planner', 'inspector', 'audit', 'trace'];
  return (
    <main>
      <h1>Recovery Stress Control Studio</h1>
      <section>
        <label>
          Mode
          <select value={state.mode} onChange={(event) => setMode(event.target.value as StressPanelMode)}>
            {modeOptions.map((modeOption) => (
              <option key={modeOption} value={modeOption}>
                {modeOption}
              </option>
            ))}
          </select>
        </label>
        <p>Execution score: {score}</p>
        <p>Bucket active: {bucketSummary.active}</p>
        <p>Default batch: {fallbackConfig.batchSize}</p>
      </section>
      <section>
        <h3>Bucket summary</h3>
        <ul>
          <li>Low: {bucketSummary.low}</li>
          <li>Medium: {bucketSummary.medium}</li>
          <li>High: {bucketSummary.high}</li>
          <li>includeSimulation: {String(bucketSummary.includeSimulation)}</li>
          <li>includeAudit: {String(bucketSummary.includeAudit)}</li>
        </ul>
      </section>
      <StressControlStudioBoard
        state={state}
        lattice={lattice}
        execution={execution}
        sections={sections}
        onRun={run}
        onRefresh={refresh}
      />
    </main>
  );
};
