import { type ReactElement, useState } from 'react';
import {
  asChronicleGraphEdgeId,
  asChronicleGraphNodeId,
  asChronicleGraphTenantId,
  asChronicleGraphRoute,
  asChronicleGraphRunId,
  asChronicleGraphLane,
  type ChronicleGraphBlueprint,
  type ChronicleGraphPhase,
} from '@domain/recovery-chronicle-graph-core';
import { useChronicleGraphWorkspace } from '../hooks/useChronicleGraphStudio';
import { ChronicleGraphAnalyticsPanel } from '../components/chronicle-graph/ChronicleGraphAnalyticsPanel';
import { ChronicleGraphTimelinePanel } from '../components/chronicle-graph/ChronicleGraphTimelinePanel';
import { ChronicleGraphTopology, GraphWorkspaceSummary } from '../components/chronicle-graph/ChronicleGraphTopology';
import { ChronicleGraphToolbar } from '../components/chronicle-graph/ChronicleGraphToolbar';
import { normalizeGraphScenario } from '../components/chronicle-graph/graph-utils';

const defaultPhases: readonly ChronicleGraphPhase<string>[] = [
  'phase:bootstrap',
  'phase:discovery',
  'phase:execution',
  'phase:verification',
] as const;

const tenantId = asChronicleGraphTenantId('tenant:studio');
const defaultRoute = asChronicleGraphRoute('studio');
const scenario = normalizeGraphScenario(tenantId, defaultRoute, defaultPhases).scenario;

const defaultBlueprint: ChronicleGraphBlueprint = {
  id: scenario.id,
  tenant: scenario.tenant,
  route: scenario.route,
  title: 'Studio Graph',
  description: 'default blueprint',
  nodes: [
    {
      id: asChronicleGraphNodeId('bootstrap'),
      name: 'bootstrap',
      lane: asChronicleGraphLane('control'),
      dependsOn: [],
      labels: { lane: 'control' },
    },
    {
      id: asChronicleGraphNodeId('discovery'),
      name: 'discovery',
      lane: asChronicleGraphLane('signal'),
      dependsOn: [asChronicleGraphNodeId('bootstrap')],
      labels: { lane: 'signal' },
    },
    {
      id: asChronicleGraphNodeId('execution'),
      name: 'execution',
      lane: asChronicleGraphLane('policy'),
      dependsOn: [asChronicleGraphNodeId('discovery')],
      labels: { lane: 'policy' },
    },
  ],
  edges: [
    {
      id: asChronicleGraphEdgeId('studio:bootstrap-discovery'),
      from: asChronicleGraphNodeId('bootstrap'),
      to: asChronicleGraphNodeId('discovery'),
      weight: 0.7,
      predicates: ['start'],
    },
    {
      id: asChronicleGraphEdgeId('studio:discovery-execution'),
      from: asChronicleGraphNodeId('discovery'),
      to: asChronicleGraphNodeId('execution'),
      weight: 0.9,
      predicates: ['discovered'],
    },
  ],
};

export const ChronicleGraphStudioPage = (): ReactElement => {
  const [activeRoute, setActiveRoute] = useState('chronicle-graph://studio');
  const [state, viewModel, actions, routes] = useChronicleGraphWorkspace({
    tenant: tenantId,
    route: activeRoute,
    phases: defaultPhases,
  });

  return (
    <main>
      <h1>Chronicle Graph Studio</h1>
      <ChronicleGraphToolbar
        routes={routes}
        activeRoute={activeRoute}
        onRouteChange={setActiveRoute}
        onClearWarnings={() => null}
      />

      <section>
        <button type="button" onClick={() => void actions.refresh()}>
          Refresh
        </button>
        <button type="button" onClick={() => void actions.run()} disabled={state.status === 'running'}>
          Run
        </button>
        <button type="button" onClick={actions.reset}>
          Reset
        </button>
      </section>

      <ChronicleGraphTopology
        blueprint={defaultBlueprint}
        status={state.status === 'succeeded' ? 'completed' : state.status === 'degraded' ? 'degraded' : 'running'}
      />

      <GraphWorkspaceSummary
        workspaces={
          state.status === 'running'
            ? [
                {
                  runId: asChronicleGraphRunId(tenantId, defaultRoute),
                  status: 'running',
                  route: defaultRoute,
                  score: state.score,
                  pluginCount: defaultPhases.length,
                  phases: defaultPhases,
                  pluginRoutes: [defaultRoute],
                  phaseCount: defaultPhases.length,
                },
              ]
            : []
        }
      />

      <ChronicleGraphTimelinePanel
        status={
          (state.status === 'succeeded' ? 'completed' : state.status === 'running' ? 'running' : 'failed') as 'completed'
            | 'running'
            | 'failed'
        }
      />

      <ChronicleGraphAnalyticsPanel
        states={
          state.status === 'succeeded'
            ? [
                {
                  runId: asChronicleGraphRunId(tenantId, defaultRoute),
                  status: 'completed',
                  route: defaultRoute,
                  score: state.score,
                  pluginCount: defaultPhases.length,
                  phases: defaultPhases,
                  pluginRoutes: [defaultRoute],
                  phaseCount: defaultPhases.length,
                },
              ]
            : []
        }
        policy={{ mode: 'balanced', weight: 3, route: asChronicleGraphRoute('studio'), tenant: tenantId }}
      />

      <p>Route timeline tokens: {viewModel.timeline.join(', ') || 'none'}</p>
      <p>Title: {viewModel.title}</p>
    </main>
  );
};
