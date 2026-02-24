import { useMemo, useState } from 'react';
import { useLabWorkspace } from '../hooks/useLabWorkspace';
import type { LabExecution } from '@domain/recovery-simulation-lab-core';

interface LabRunbookPageProps {
  readonly tenant: string;
}

interface RunbookStep {
  readonly action: string;
  readonly required: boolean;
  readonly lane: string;
}

const buildRunbook = (execution: LabExecution | null): readonly RunbookStep[] => {
  if (!execution) {
    return [];
  }

  return execution.pluginIds.map((pluginId, index) => ({
    action: `invoke-${pluginId}`,
    required: index === 0 || index % 2 === 0,
    lane: execution.lane,
  }));
};

const lanePalette: Record<string, string> = {
  ingest: '#0288d1',
  simulate: '#2e7d32',
  verify: '#f57c00',
  restore: '#6a1b9a',
  report: '#455a64',
};

export const LabRunbookPage = ({ tenant }: LabRunbookPageProps) => {
  const workspace = useLabWorkspace(tenant);
  const [selectedExecution, setSelectedExecution] = useState('');

  const execution = useMemo(() => {
    const byId = workspace.executions.find((entry) => entry.executionId === selectedExecution);
    if (byId) {
      return byId;
    }
    return workspace.executions[0] ?? null;
  }, [selectedExecution, workspace.executions]);

  const steps = useMemo(() => buildRunbook(execution), [execution]);
  const grouped = useMemo(() => {
    const result = new Map<string, number>();
    for (const step of steps) {
      result.set(step.lane, (result.get(step.lane) ?? 0) + 1);
    }
    return result;
  }, [steps]);

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Recovery Lab Runbook</h1>
      <section>
        <label htmlFor="execution">Execution</label>
        <select
          id="execution"
          value={selectedExecution}
          onChange={(event) => setSelectedExecution(event.currentTarget.value)}
        >
          {workspace.executions.map((entry) => (
            <option key={entry.executionId} value={entry.executionId}>
              {entry.executionId}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2>Runbook steps</h2>
        <ul>
          {steps.map((step, index) => (
            <li
              key={`${step.action}-${index}`}
              style={{
                borderLeft: `4px solid ${lanePalette[step.lane] ?? '#000'}`,
                marginBottom: 6,
                paddingLeft: 8,
              }}
            >
              {step.action} required={String(step.required)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Lane distribution</h3>
        {[...grouped.entries()].map(([lane, count]) => (
          <div key={lane} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{lane}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </section>

      {workspace.latestResult ? (
        <section>
          <h3>Latest result</h3>
          <pre>{JSON.stringify(workspace.latestResult, null, 2)}</pre>
        </section>
      ) : null}

      <section>
        <h3>Execution timeline</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {steps.map((step) => (
            <code key={step.action}>
              {step.action}
            </code>
          ))}
        </div>
      </section>
    </main>
  );
};
