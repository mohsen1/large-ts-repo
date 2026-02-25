import type { AdaptiveSimulationRequest } from '../../services/adaptiveSimulationService';

interface SimulationControlBarProps {
  readonly request: AdaptiveSimulationRequest;
  readonly loading: boolean;
  readonly onTenant: (tenant: string) => void;
  readonly onWorkspace: (workspace: string) => void;
  readonly onScenario: (scenario: string) => void;
  readonly onTopology: (topology: AdaptiveSimulationRequest['topology']) => void;
  readonly onStart: () => void;
  readonly onQueue: () => void;
}

const topologies: readonly AdaptiveSimulationRequest['topology'][] = ['grid', 'mesh', 'chain', 'ring'];

const toTopologyLabel = (topology: AdaptiveSimulationRequest['topology']): string =>
  topology === 'chain' ? 'chain' : topology;

export const SimulationControlBar = ({
  request,
  loading,
  onTenant,
  onWorkspace,
  onScenario,
  onTopology,
  onStart,
  onQueue,
}: SimulationControlBarProps): React.JSX.Element => {
  return (
    <section style={{ border: '1px solid #1e293b', borderRadius: 12, padding: 16 }}>
      <h3>Adaptive Simulation Control</h3>
      <form>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label>
            Tenant
            <input
              style={{ width: '100%' }}
              value={request.tenant}
              onChange={(event) => onTenant(event.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Workspace
            <input
              style={{ width: '100%' }}
              value={request.workspace}
              onChange={(event) => onWorkspace(event.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Scenario
            <input
              style={{ width: '100%' }}
              value={request.scenario}
              onChange={(event) => onScenario(event.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Topology
            <select value={request.topology} onChange={(event) => onTopology(event.target.value as AdaptiveSimulationRequest['topology'])}>
              {topologies.map((topology) => (
                <option key={topology} value={topology}>
                  {toTopologyLabel(topology)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="button" disabled={loading} onClick={onStart}>
            {loading ? 'running' : 'run'}
          </button>
          <button type="button" disabled={loading} onClick={onQueue}>
            queue
          </button>
        </div>
      </form>
    </section>
  );
};
