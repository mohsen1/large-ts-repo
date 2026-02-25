import type { WorkspaceSummary } from '../services/intentGraphService';
import type { IntentLabWorkspaceState } from '../types';

interface IntentPolicyPanelProps {
  readonly summary: WorkspaceSummary;
  readonly workspace: IntentLabWorkspaceState;
  readonly pluginNames: readonly string[];
  readonly onToggleDiagnostics: () => void;
  readonly includeDiagnostics: boolean;
}

export const IntentPolicyPanel = ({
  summary,
  workspace,
  pluginNames,
  onToggleDiagnostics,
  includeDiagnostics,
}: IntentPolicyPanelProps) => {
  return (
    <section>
      <h2>Intent policy summary</h2>
      <div>
        <strong>Route:</strong> {summary.route}
      </div>
      <div>
        <strong>Nodes:</strong> {summary.routeNodes}
      </div>
      <div>
        <strong>Edges:</strong> {summary.routeEdges}
      </div>
      <div>
        <strong>Score:</strong> {summary.score.toFixed(1)}
      </div>
      <div>
        <strong>Depth:</strong> {summary.topologicalDepth}
      </div>
      <div>
        <strong>Signals:</strong> {workspace.signalCount}
      </div>
      <div>
        <strong>Plugins:</strong>
        <ul>
          {pluginNames.map((pluginName) => (
            <li key={pluginName}>{pluginName}</li>
          ))}
        </ul>
      </div>
      <button onClick={onToggleDiagnostics} type="button">
        {includeDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
      </button>
      <p>
        Tenant: {workspace.tenant} Workspace: {workspace.workspace}
      </p>
    </section>
  );
};
