import { useMemo } from 'react';
import { bootstrapConfig } from '@domain/recovery-lab-console-labs';
import { useRecoveryLabConsoleOrchestration } from '../hooks/useRecoveryLabConsoleOrchestration';
import {
  type LabPluginCard,
  type PluginRuntimeRow,
  type RuntimeFacadeOptions,
} from '../types';
import { RecoveryLabControlPanel } from '../components/RecoveryLabControlPanel';
import { RecoveryLabPluginRegistryPanel } from '../components/RecoveryLabPluginRegistryPanel';
import { RecoveryLabTimelineChart } from '../components/RecoveryLabTimelineChart';

const seedPlugins = (): readonly LabPluginCard[] => [
  {
    pluginName: 'collect',
    pluginKind: 'collect',
    category: 'telemetry',
    domain: 'topology',
    stage: 'collect',
    dependencyCount: 0,
  },
  {
    pluginName: 'validate',
    pluginKind: 'validate',
    category: 'planner',
    domain: 'policy',
    stage: 'validate',
    dependencyCount: 1,
  },
  {
    pluginName: 'simulate',
    pluginKind: 'simulate',
    category: 'simulator',
    domain: 'incident',
    stage: 'simulate',
    dependencyCount: 1,
  },
  {
    pluginName: 'synthesize',
    pluginKind: 'synthesize',
    category: 'advice',
    domain: 'compliance',
    stage: 'synthesize',
    dependencyCount: 2,
  },
  {
    pluginName: 'audit',
    pluginKind: 'audit',
    category: 'observer',
    domain: 'signal',
    stage: 'audit',
    dependencyCount: 1,
  },
];

const seedRows = (): readonly PluginRuntimeRow[] => [
  {
    pluginName: 'collect',
    topic: 'topology:collect',
    status: 'completed',
    events: 4,
    notes: ['signal', 'context'],
  },
  {
    pluginName: 'validate',
    topic: 'policy:validate',
    status: 'completed',
    events: 2,
    notes: ['policy', 'check'],
  },
  {
    pluginName: 'simulate',
    topic: 'incident:simulate',
    status: 'running',
    events: 3,
    notes: ['run', 'forecast'],
  },
];

export const RecoveryLabConsoleOrchestrationPage = () => {
  const runtimeOptions: RuntimeFacadeOptions = {
    tenantId: 'global',
    workspaceId: 'recovery-lab-console',
    operator: 'ops-console',
    mode: 'simulate',
  };

  const { state, run, setSignal, setMode, reset } = useRecoveryLabConsoleOrchestration(runtimeOptions);
  const plugins = useMemo(seedPlugins, []);
  const rows = useMemo(seedRows, []);

  void bootstrapConfig();

  return (
    <main className="recovery-lab-orchestration-page">
      <header>
        <h1>Recovery Lab Orchestration Control</h1>
        <p>tenant={runtimeOptions.tenantId}</p>
      </header>
      <RecoveryLabControlPanel
        state={state}
        onRun={run}
        onModeChange={setMode}
        onSignalChange={setSignal}
        onReset={reset}
      />
      <RecoveryLabPluginRegistryPanel plugins={plugins} rows={rows} />
      <RecoveryLabTimelineChart points={state.events} />
      <aside>
        <section>
          <h4>Live Summary</h4>
          <ul>
            <li>Tenant: {state.tenantId}</li>
            <li>Workspace: {state.workspaceId}</li>
            <li>Operator: {state.operator}</li>
            <li>Run count: {state.runCount}</li>
            <li>Last run: {state.lastRunId ?? 'n/a'}</li>
          </ul>
        </section>
      </aside>
    </main>
  );
};
