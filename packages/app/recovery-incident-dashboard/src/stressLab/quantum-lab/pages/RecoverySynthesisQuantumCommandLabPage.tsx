import { useCallback, useMemo, useState } from 'react';
import { useQuantumSynthesisAnalytics } from '../hooks/useQuantumSynthesisAnalytics';
import { useQuantumSynthesisWorkspace } from '../hooks/useQuantumSynthesisWorkspace';
import { QuantumSynthesisCommandCanvas } from '../components/QuantumSynthesisCommandCanvas';
import { QuantumSynthesisProfileInspector } from '../components/QuantumSynthesisProfileInspector';
import { QuantumSynthesisSignalMatrix } from '../components/QuantumSynthesisSignalMatrix';
import { buildDefaultPlaybookInput, type PlaybookPolicyHint, createRunToken } from '@service/recovery-synthesis-orchestrator/quantum-playbook';
import { useMemo as useMemoHook } from 'react';
import { QuantumSynthesisControlPanel } from '../components/QuantumSynthesisControlPanel';

const toHint = (tenant: string, index: number): PlaybookPolicyHint => ({
  incidentSeverity: index % 2 === 0 ? 'critical' : 'high',
  tenant,
  region: index % 2 === 0 ? 'us-east-1' : 'eu-west-1',
  services: ['synthesis', 'sre-console', tenant],
});

export const RecoverySynthesisQuantumCommandLabPage = () => {
  const { actions, ...workspace } = useQuantumSynthesisWorkspace();
  const analytics = useQuantumSynthesisAnalytics(
    workspace.envelope?.model ? (workspace.envelope?.model as never) : undefined,
  );
  const [lastRunToken, setLastRunToken] = useState('');
  const hints = useMemo(
    () => [
      toHint('core', 0),
      toHint('edge', 1),
    ],
    [],
  );

  const runPlaybook = useCallback(async () => {
    const runSeed = createRunToken(`quantum-playbook-${Date.now()}`).replace('run.', 'playbook.');
    const input = buildDefaultPlaybookInput(runSeed);
    setLastRunToken(runSeed);

    const workspaceEnvelope = await fetch('/api/quantum/playbook', {
      method: 'POST',
      body: JSON.stringify({
        blueprintId: input.blueprint.scenarioId,
        hints,
      }),
      headers: {
        'content-type': 'application/json',
      },
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error(`playbook api status=${res.status}`);
      }
      return res.json() as Promise<{ runId: string }>;
    });

    console.info('playbook trigger', workspaceEnvelope.runId, input.blueprint.scenarioId);
  }, [hints]);

  const runActions = useMemoHook(
    () => ({
      ...actions,
      runPlaybook,
    }),
    [actions, runPlaybook],
  );

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <header>
        <h1>Recovery Synthesis Quantum Command Lab</h1>
        <p>Canvas-driven orchestration with profile analytics and playbook execution.</p>
      </header>

      <QuantumSynthesisControlPanel
        runId={workspace.runId}
        loading={workspace.loading}
        mode={workspace.mode}
        onRun={runActions.runScenario}
        onSimulate={runActions.simulate}
        onApprove={runActions.publish}
        onReset={runActions.reset}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <button type="button" onClick={runPlaybook}>
            Run playbook
          </button>
          <p style={{ margin: '8px 0 0' }}>last run: {lastRunToken || 'idle'}</p>
          <QuantumSynthesisSignalMatrix signals={workspace.blueprint.signals} />
        </div>
        <QuantumSynthesisProfileInspector
          profile={workspace.envelope?.model?.blueprint ? workspace.envelope.model.blueprint.policies[0] as never : ({} as never)}
          onCopy={navigator.clipboard.writeText}
        />
      </div>

      <QuantumSynthesisCommandCanvas
        blueprint={workspace.blueprint}
        selectedCommand={workspace.selectedCommandId}
        onSelect={actions.selectCommand}
      />

      <section style={{ border: '1px solid #d0d0d0', borderRadius: 12, padding: 12 }}>
        <h3>Workspace telemetry</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Stat label="runtimeId" value={analytics.runtimeId ?? 'none'} />
          <Stat label="runs" value={String(analytics.runCount)} />
          <Stat label="commandDensity" value={analytics.commandDensity.toFixed(3)} />
          <Stat label="affinity" value={analytics.affinity.toFixed(2)} />
        </div>
        <ul>
          {analytics.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <p style={{ opacity: 0.7 }}>{analytics.snapshotLabel}</p>
      </section>
    </main>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
    <div style={{ fontSize: 12, opacity: 0.65 }}>{label}</div>
    <strong style={{ fontSize: 20 }}>{value}</strong>
  </article>
);
