import { useMemo } from 'react';
import { usePolicyLabWorkspace } from '../hooks/usePolicyLabWorkspace';
import { collectStoreTelemetry } from '@data/policy-orchestration-store/stream-analytics';
import { PolicyPolicyArtifact } from '@service/policy-orchestration-engine/lab-orchestrator';
import { InMemoryPolicyStore } from '@data/policy-orchestration-store';

const store = new InMemoryPolicyStore();

export function PolicyLabRunInspectorPage() {
  const { state } = usePolicyLabWorkspace();

  const payload = useMemo(() => {
    const entries = state.templates.map((template) => ({
      template,
      selected: state.selectedTemplates.includes(template),
    }));
    return entries;
  }, [state.templates, state.selectedTemplates]);

  const score = payload.reduce((acc, entry) => (entry.selected ? acc + 1 : acc), 0);

  return (
    <main>
      <h1>Policy Lab Inspector</h1>
      <p>Selections: {score}</p>
      <ul>
        {payload.map((entry) => (
          <li key={entry.template}>{entry.selected ? '[x]' : '[ ]'} {entry.template}</li>
        ))}
      </ul>
      <RuntimeSnapshot />
    </main>
  );
}

const RuntimeSnapshot = () => {
  const snapshot: readonly PolicyPolicyArtifact[] = [];
  const metrics = collectStoreTelemetry(store, 'policy-lab-console-orchestrator');
  void metrics.then(() => {});

  return (
    <section>
      <h3>Runtime Snapshot</h3>
      <pre>{JSON.stringify(snapshot, null, 2)}</pre>
      <p>Telemetry summary pipeline configured</p>
    </section>
  );
};
