import { useRecoveryOrchestrationStudio } from '../hooks/useRecoveryOrchestrationStudio';
import { StudioHeader } from '../components/StudioHeader';
import { PluginRegistryPanel } from '../components/PluginRegistryPanel';
import { PolicyTimeline } from '../components/PolicyTimeline';
import { TopologyDigestCard } from '../components/TopologyDigestCard';
import { RunbookWorkloadPanel } from '../components/RunbookWorkloadPanel';

import {
  type RecoveryRunbook,
  makeScenarioId,
  makeTenantId,
  makeWorkspaceId,
} from '@domain/recovery-orchestration-design';
import { studioDefaultConfig } from '../types';

interface RecoveryOrchestrationStudioPageProps {
  readonly tenant: string;
  readonly workspace: string;
}

const fallbackNodes = [
  {
    id: 'discover',
    title: 'Discover',
    phase: 'discover',
    severity: 'low',
    status: 'pending',
    metrics: { slo: 0.6, capacity: 0.4, compliance: 0.8, security: 0.9 },
    prerequisites: [],
  },
  {
    id: 'stabilize',
    title: 'Stabilize',
    phase: 'stabilize',
    severity: 'medium',
    status: 'pending',
    metrics: { slo: 0.72, capacity: 0.5, compliance: 0.77, security: 0.81 },
    prerequisites: ['discover'],
  },
  {
    id: 'mitigate',
    title: 'Mitigate',
    phase: 'mitigate',
    severity: 'critical',
    status: 'active',
    metrics: { slo: 0.43, capacity: 0.2, compliance: 0.6, security: 0.75 },
    prerequisites: ['stabilize'],
  },
] as const satisfies RecoveryRunbook['nodes'];

const fallbackEdges = [
  { from: 'discover', to: 'stabilize', latencyMs: 15 },
  { from: 'stabilize', to: 'mitigate', latencyMs: 30 },
] as const satisfies RecoveryRunbook['edges'];

const fallbackRunbook = {
  tenant: makeTenantId(studioDefaultConfig.tenant),
  workspace: makeWorkspaceId(studioDefaultConfig.workspace),
  scenarioId: makeScenarioId(makeTenantId(studioDefaultConfig.tenant), 'studio.demo'),
  title: 'Demo orchestration runbook',
  nodes: fallbackNodes,
  edges: fallbackEdges,
  directives: [
    { code: 'policy:stability', command: 'set-read-only', scope: 'tenant', requiredCapabilities: ['policy'], metadata: { priority: 'critical' } },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies RecoveryRunbook;

export const RecoveryOrchestrationStudioPage = ({ tenant, workspace }: RecoveryOrchestrationStudioPageProps) => {
  const { state, start, refresh, config, setConfig, stop } = useRecoveryOrchestrationStudio({
    tenant,
    workspace,
    initialRunbook: fallbackRunbook,
  });

  return (
    <main>
      <StudioHeader tenant={tenant} workspace={workspace} config={config} />
      <section>
        <button onClick={start} type="button">
          Start studio run
        </button>
        <button onClick={stop} type="button">
          Stop studio run
        </button>
        <button onClick={refresh} type="button">
          Refresh
        </button>
      </section>
      <section>
        <h2>Connection</h2>
        <p>{`loaded=${state.loaded}`}</p>
        <p>{`running=${state.isRunning}`}</p>
        <p>{`actions=${state.actions.length}`}</p>
        <ul>
          {state.actions.map((action) => (
            <li key={`${action.id}-${action.at}`}>
              {action.id} @ {action.at}
            </li>
          ))}
        </ul>
      </section>
      {state.runbook ? (
        <>
          <TopologyDigestCard runbook={state.runbook} />
          <RunbookWorkloadPanel result={state.summary ? undefined : undefined} ticks={state.ticks} />
          <PolicyTimeline result={undefined} ticks={state.ticks} />
          <PluginRegistryPanel ticks={state.ticks} />
        </>
      ) : (
        <p>no runbook loaded</p>
      )}
      <section>
        <h2>State Overrides</h2>
        <label>
          Limit (ms):
          <input
            type="number"
            value={config.limitMs}
            onChange={(event) => {
              setConfig({
                ...config,
                limitMs: Number(event.currentTarget.value || 1000),
              });
            }}
          />
        </label>
      </section>
    </main>
  );
};
