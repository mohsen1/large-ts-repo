import { useMemo } from 'react';
import { useScenarioRunbook } from '../../hooks/useScenarioRunbook';
import type { ResourceLease } from '@shared/stress-lab-runtime/async-resource-stack';
import { useAdvancedScenarioPlan } from '../../hooks/useAdvancedScenarioPlan';

interface RunbookExecutionPanelProps {
  readonly tenantId: string;
  readonly lease: ResourceLease | null;
}

export const RunbookExecutionPanel = ({ tenantId, lease }: RunbookExecutionPanelProps) => {
  const scenario = useScenarioRunbook(tenantId);
  const advanced = useAdvancedScenarioPlan(tenantId, 2);

  const status = useMemo(() => {
    if (!scenario.hasOutput && !advanced.isReady) {
      return 'cold';
    }
    if (scenario.hasOutput && advanced.lease?.token) {
      return 'active';
    }
    if (scenario.output && !advanced.error) {
      return 'ready';
    }
    return 'idle';
  }, [scenario.hasOutput, scenario.output, advanced.lease?.token, advanced.isReady, advanced.error]);

  return (
    <section style={{ border: '1px solid #fecaca', borderRadius: 12, padding: 12, background: '#fff1f2' }}>
      <h3 style={{ margin: 0, marginBottom: 8 }}>Runbook Execution</h3>
      <p><strong>Tenant:</strong> {tenantId}</p>
      <p><strong>Status:</strong> {status}</p>
      <p><strong>Template:</strong> {scenario.template.scenarioId}</p>
      <p><strong>Lease token:</strong> {lease?.token ?? 'none'}</p>
      <p><strong>Namespace:</strong> {scenario.namespace}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <button type="button" onClick={() => void scenario.runbookExecution()} style={{ padding: '6px 10px', borderRadius: 8 }}>
          execute runbook
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={async () => {
            await advanced.runPlan();
          }}
        >
          execute advanced plan
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <strong>Output</strong>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{scenario.output ?? 'No output yet'}</pre>
      </div>
      <div style={{ marginTop: 8 }}>
        <strong>Steps ({scenario.steps.length})</strong>
        <ul>
          {scenario.steps.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </div>
      {scenario.errors.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <strong>Errors</strong>
          <ul>
            {scenario.errors.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
