import { useCallback, useState } from 'react';
import { ControlMode } from '@service/streaming-control';
import { TopologyControlPanel } from '../components/TopologyControlPanel';
import { useStreamingPolicyEngine } from '../hooks/useStreamingPolicyEngine';
import { runDashboardOrchestration } from '../services/streamDashboardService';
import { StreamEventRecord } from '@domain/streaming-observability';

const seedEvents: StreamEventRecord[] = [
  {
    tenant: 'tenant-main',
    streamId: 'command-workbench',
    eventType: 'failure',
    latencyMs: 95,
    sampleAt: new Date().toISOString(),
    metadata: { command: 'seed' },
    severity: 5,
    eventId: 'cmd-workbench-1',
  },
];

export const StreamingCommandWorkbenchPage = () => {
  const tenant = 'tenant-main';
  const streamId = 'command-workbench';
  const [mode, setMode] = useState<ControlMode>('adaptive');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  const { state, runPolicy, runReadOnly, metrics } = useStreamingPolicyEngine({ tenant, streamId }, streamId);

  const executeCommand = useCallback((command: 'start' | 'pause' | 'resume' | 'stop') => {
    setCommandHistory((current) => [...current, `${command}::${Date.now()}`]);
  }, []);

  const run = useCallback(() => {
    void Promise.all([
      runPolicy(seedEvents, mode),
      runDashboardOrchestration({ tenant, streamId }, { streamId, events: seedEvents }),
    ]).catch(() => undefined);
  }, [mode, runPolicy, tenant, streamId]);

  return (
    <main>
      <h1>Streaming Command Workbench</h1>
      <section>
        <button type="button" onClick={() => setMode('adaptive')}>Adaptive</button>
        <button type="button" onClick={() => setMode('conservative')}>Conservative</button>
        <button type="button" onClick={() => setMode('strict')}>Strict</button>
      </section>
      <section>
        <button type="button" onClick={() => executeCommand('start')}>Start</button>
        <button type="button" onClick={() => executeCommand('pause')}>Pause</button>
        <button type="button" onClick={() => executeCommand('resume')}>Resume</button>
        <button type="button" onClick={() => executeCommand('stop')}>Stop</button>
      </section>
      <section>
        <button type="button" onClick={run}>Run policy orchestration</button>
        <button type="button" onClick={runReadOnly}>Baseline</button>
      </section>
      <TopologyControlPanel
        streamId={streamId}
        actions={state.policyActions.map((command, index) => ({
          streamId,
          command,
          level: index % 3 === 0 ? 'critical' : index % 3 === 1 ? 'warn' : 'ok',
        }))}
      />
      <section>
        <p>Policy scale: {state.policyScale}</p>
        <p>Warnings: {state.policyWarnings.length}</p>
        <p>Critical: {String(metrics.isCritical)}</p>
      </section>
      <section>
        <h2>Command History</h2>
        <ul>
          {commandHistory.map((command) => (
            <li key={command}>{command}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
