import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { useAdvancedCockpitOrchestration } from '../../hooks/useAdvancedCockpitOrchestration';

interface RunbookSelection {
  readonly planId: string;
  readonly enabled: boolean;
}

interface OrchestrationRunbookConsoleProps {
  readonly workspaceId: string;
  readonly plans: readonly RecoveryPlan[];
}

export const OrchestrationRunbookConsole = ({ workspaceId, plans }: OrchestrationRunbookConsoleProps) => {
  const [query, setQuery] = useState('');
  const [enabled, setEnabled] = useState<RunbookSelection[]>(
    plans.map((plan) => ({ planId: plan.planId, enabled: true })),
  );

  const filtered = useMemo(
    () =>
      plans
        .filter((plan) => plan.labels.short.toLowerCase().includes(query.toLowerCase()))
        .map((plan) => plan)
        .filter((plan) => enabled.find((item) => item.planId === plan.planId)?.enabled ?? true),
    [plans, query, enabled],
  );

  const orchestration = useAdvancedCockpitOrchestration({
    workspaceId,
    plans: filtered,
    autoStart: false,
  });

  const onSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);

  const onToggle = useCallback((planId: string) => {
    setEnabled((prev) =>
      prev.map((entry) =>
        entry.planId === planId ? { ...entry, enabled: !entry.enabled } : entry,
      ),
    );
  }, []);

  return (
    <section style={{ border: '1px solid #d4d4d8', borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Runbook console</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <input
          value={query}
          onChange={onSearch}
          placeholder="search runbook"
          style={{ flex: 1, borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 12px' }}
        />
        <button
          type="button"
          onClick={() => void orchestration.runOrchestration()}
          style={{
            borderRadius: 8,
            border: 'none',
            background: '#0f172a',
            color: '#f8fafc',
            fontWeight: 600,
            padding: '8px 16px',
          }}
        >
          Run selected
        </button>
        <button
          type="button"
          onClick={orchestration.reset}
          style={{
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#0f172a',
            fontWeight: 600,
            padding: '8px 16px',
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ marginTop: 12, maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Runbook</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Enabled</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((plan) => {
              const summary = orchestration.snapshots
                .filter((snapshot) => snapshot.phase === 'plan')
                .filter((snapshot) => snapshot.namespace === (plan.planId as unknown as string))
                .length;
              return (
                <tr key={plan.planId}>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>{plan.labels.short}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
                    <input
                      type="checkbox"
                      checked={enabled.find((entry) => entry.planId === plan.planId)?.enabled ?? false}
                      onChange={() => onToggle(plan.planId)}
                    />
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', color: summary > 0 ? '#166534' : '#334155' }}>
                    {summary > 0 ? `history:${summary}` : 'idle'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', color: '#334155', fontSize: 12 }}>
        <div>
          Health: {orchestration.health} | Artifacts: {orchestration.artifactSummary}
        </div>
        <div>
          Phase count: {orchestration.metrics?.phases.length ?? 0} | Score: {orchestration.metrics?.score ?? 0}
        </div>
      </div>
    </section>
  );
};
