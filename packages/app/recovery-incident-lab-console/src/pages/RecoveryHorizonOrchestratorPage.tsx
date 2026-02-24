import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { HorizonRunTimeline } from '../components/HorizonRunTimeline';
import { HorizonPolicyMatrix } from '../components/HorizonPolicyMatrix';
import { HorizonMetricPanel } from '../components/HorizonMetricPanel';
import { useRecoveryHorizonOrchestrator } from '../hooks/useRecoveryHorizonOrchestrator';
import { type PluginStage, type HorizonSignal } from '@domain/recovery-horizon-engine';

const defaultPolicies = [
  {
    policy: 'throttle-inbound',
    cells: [
      { stage: 'ingest' as PluginStage, decision: 'allow', confidence: 96 },
      { stage: 'analyze' as PluginStage, decision: 'review', confidence: 55 },
      { stage: 'resolve' as PluginStage, decision: 'allow', confidence: 81 },
    ],
  },
  {
    policy: 'drain-outbound',
    cells: [
      { stage: 'analyze' as PluginStage, decision: 'block', confidence: 72 },
      { stage: 'optimize' as PluginStage, decision: 'allow', confidence: 88 },
    ],
  },
] as const;

export const RecoveryHorizonOrchestratorPage = (): ReactElement => {
  const hook = useRecoveryHorizonOrchestrator('tenant-001');
  const [clipboard, setClipboard] = useState('');
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState<string[]>(['initialized']);

  const metrics = useMemo(
    () => [
      { runId: hook.runId ?? 'none', metric: 'records', value: hook.records.length },
      { runId: hook.runId ?? 'none', metric: 'signals', value: hook.signals.length },
      { runId: hook.runId ?? 'none', metric: 'health', value: hook.health },
    ],
    [hook.runId, hook.records.length, hook.signals.length, hook.health],
  );

  const onApprove = useCallback((policy: string) => {
    setNotes((prev) => [...prev, `approved ${policy}`]);
  }, []);

  const onReject = useCallback((stage: PluginStage, reason: string) => {
    setNotes((prev) => [...prev, `rejected ${stage}: ${reason}`]);
  }, []);

  const onCopy = useCallback((value: string) => {
    setClipboard(value);
    setCopied(true);
    void navigator.clipboard.writeText(value);
    setTimeout(() => setCopied(false), 500);
  }, []);

  const runLabel = hook.health === 'good' ? 'Healthy' : hook.health === 'warning' ? 'Warnings' : 'Degraded';

  return (
    <main className="recovery-horizon-orchestrator-page">
      <header>
        <h1>Recovery Horizon Orchestrator</h1>
        <p>{runLabel}</p>
        <p>{hook.summaryText}</p>
      </header>
      <section>
        <button type="button" onClick={hook.runPlan} disabled={hook.isBusy}>
          Run local session
        </button>
        <button type="button" onClick={hook.launchFromService} disabled={hook.isBusy}>
          Launch service session
        </button>
        <button type="button" onClick={() => void hook.loadWindow(120)} disabled={hook.isBusy}>
          Reload window
        </button>
        <button type="button" onClick={() => void hook.loadWindow(40)}>
          Trim window
        </button>
      </section>

      <section>
        <HorizonMetricPanel
          metrics={metrics}
          windowLabels={['ingest', 'analyze', 'resolve', 'optimize', 'execute']}
          note={`Signals known: ${hook.signals.length}`}
          onCopy={onCopy}
        />
      </section>

      <section>
        <HorizonRunTimeline
          title="Run timeline"
          plan={hook.plan}
          signals={hook.signals}
        />
      </section>

      <section>
        <HorizonPolicyMatrix
          policies={[
            { policy: defaultPolicies[0].policy, cells: [...defaultPolicies[0].cells] },
            { policy: defaultPolicies[1].policy, cells: [...defaultPolicies[1].cells] },
          ]}
          signals={hook.signals as readonly HorizonSignal<PluginStage, unknown>[]}
          onReject={onReject}
          onApprove={onApprove}
        />
      </section>

      <section>
        <h2>Notes</h2>
        <ul>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {copied && <p>Copied snapshot</p>}
        <pre>{clipboard}</pre>
      </section>
    </main>
  );
};

