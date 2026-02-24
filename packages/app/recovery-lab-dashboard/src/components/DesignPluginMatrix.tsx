import { useMemo, useState } from 'react';
import { type DesignSignalKind } from '@domain/recovery-orchestration-design';
import { useDesignStudioWorkspace } from '../hooks/useDesignStudioWorkspace';
import { designStudioService } from '../services/designStudioService';

interface PluginCell {
  readonly pluginId: string;
  readonly stage: string;
  readonly metric: DesignSignalKind;
}

interface DesignPluginMatrixProps {
  readonly tenant: string;
  readonly workspace: string;
  readonly planId: string;
}

const metricPalette: Record<DesignSignalKind, string> = {
  health: '#1b5e20',
  capacity: '#0d47a1',
  compliance: '#4a148c',
  cost: '#e65100',
  risk: '#b71c1c',
};

const stages: readonly string[] = ['intake', 'design', 'validate', 'execute', 'safety-check', 'review'];
const signalKinds: readonly DesignSignalKind[] = ['health', 'capacity', 'compliance', 'cost', 'risk'];
const metricKinds = [...signalKinds];

const toCell = (seed: string, stage: string, metric: DesignSignalKind): PluginCell => ({
  pluginId: `plugin:${seed}:${stage}`,
  stage,
  metric,
});

const pluginMatrix = (tenant: string, workspace: string, planId: string): readonly PluginCell[][] => {
  const base = `${tenant}:${workspace}:${planId}`;
  return signalKinds.map((metric) =>
    stages.map((stage, index) =>
      toCell(`${base}:${metric}`, stage, metricKinds[index % signalKinds.length] ?? 'health'),
    ),
  );
};

export const DesignPluginMatrix = ({ tenant, workspace, planId }: DesignPluginMatrixProps) => {
  const workspaceState = useDesignStudioWorkspace({ tenant, workspace });
  const [active, setActive] = useState<string>('');

  const matrix = useMemo(() => {
    const key = String(planId);
    const rows = pluginMatrix(tenant, workspace, key);
    return rows.toSorted((left, right) => right.length - left.length);
  }, [tenant, workspace, planId]);

  const planRows = workspaceState.workspace.scenarios.map((scenario) => ({
    scenarioId: scenario.scenarioId,
    signalCount: scenario.signals.length,
    score: Number((scenario.signals.reduce((acc, signal) => acc + signal.value, 0) / Math.max(1, scenario.signals.length)).toFixed(2)),
  }));

  return (
    <section style={{ border: '1px solid #d6d6d6', borderRadius: 8, padding: 12 }}>
      <h3>Plugin matrix</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>tenant={tenant}</span>
        <span>workspace={workspace}</span>
        <span>plan={planId}</span>
        <strong>{workspaceState.workspace.templates.length} templates</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stages.length}, minmax(140px, 1fr))`, gap: 6 }}>
        {stages.map((stage) => (
          <h4 key={stage} style={{ margin: 0, textTransform: 'capitalize' }}>
            {stage}
          </h4>
        ))}
      </div>

      <div
        style={{
          marginTop: 8,
          display: 'grid',
          gridTemplateColumns: `repeat(${stages.length}, minmax(140px, 1fr))`,
          gap: 6,
        }}
      >
        {matrix.map((row, rowIndex) =>
          row.map((cell) => {
            const activeCell = `${rowIndex}:${cell.pluginId}` === active;
            return (
              <button
                type="button"
                key={cell.pluginId}
                onClick={() => {
                  setActive(activeCell ? '' : `${rowIndex}:${cell.pluginId}`);
                  void designStudioService.recordSignal(tenant, workspace, {
                    metric: cell.metric,
                    stage: (stages[(rowIndex + 1) % stages.length] as
                      | 'intake'
                      | 'design'
                      | 'validate'
                      | 'execute'
                      | 'safety-check'
                      | 'review'),
                    value: rowIndex + 1,
                  });
                }}
                style={{
                  border: activeCell ? '2px solid #222' : '1px solid #bdbdbd',
                  borderRadius: 6,
                  padding: 8,
                  textAlign: 'left',
                  background: activeCell ? '#f3f6ff' : 'white',
                  color: '#111',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: metricPalette[cell.metric], textTransform: 'uppercase' }}>
                  {cell.metric}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{cell.pluginId}</div>
                <div style={{ fontSize: 12 }}>{cell.stage}</div>
              </button>
            );
          }),
        )}
      </div>

      <section style={{ marginTop: 12 }}>
        <h4>Scenario signal coverage</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {planRows.toSorted((left, right) => right.score - left.score).map((plan) => (
            <article key={plan.scenarioId} style={{ border: '1px solid #ececec', borderRadius: 6, padding: 8 }}>
              <div>{plan.scenarioId}</div>
              <div>signals={plan.signalCount}</div>
              <strong>score={plan.score}</strong>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 12 }}>
        <h4>Bootstrap hints</h4>
        <ul>
          {workspaceState.runs.map((runId) => (
            <li key={runId}>{runId}</li>
          ))}
        </ul>
      </section>
    </section>
  );
};
