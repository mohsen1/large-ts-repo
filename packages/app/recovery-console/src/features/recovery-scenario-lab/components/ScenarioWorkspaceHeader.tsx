import type { ScenarioLabWorkspace } from '../hooks/useRecoveryScenarioLabWorkspace';

interface ScenarioWorkspaceHeaderProps {
  readonly workspace: ScenarioLabWorkspace;
  readonly onRefresh: () => void;
}

export const ScenarioWorkspaceHeader = ({ workspace, onRefresh }: ScenarioWorkspaceHeaderProps) => {
  const title = `Recovery scenario lab · ${workspace.tenantId}`;

  return (
    <header style={{ display: 'grid', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1>{title}</h1>
        <button type="button" onClick={onRefresh} style={{ borderRadius: 6 }}>
          Reset workspace
        </button>
      </div>
      <p style={{ color: '#94a3b8' }}>
        Incident {workspace.incidentId} · {workspace.candidateCount} scenario candidates · confidence {Math.round(workspace.readiness * 100)}%
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ padding: '0.2rem 0.5rem', border: '1px solid #334155', borderRadius: 12 }}>
          risk {workspace.riskScore}
        </span>
        <span style={{ padding: '0.2rem 0.5rem', border: '1px solid #334155', borderRadius: 12 }}>
          windows {workspace.windows.length}
        </span>
        <span style={{ padding: '0.2rem 0.5rem', border: '1px solid #334155', borderRadius: 12 }}>
          blocked {workspace.constraintCoverage.violated}
        </span>
        <span style={{ padding: '0.2rem 0.5rem', border: '1px solid #334155', borderRadius: 12 }}>
          unknown {workspace.constraintCoverage.unknown}
        </span>
      </div>
    </header>
  );
};
