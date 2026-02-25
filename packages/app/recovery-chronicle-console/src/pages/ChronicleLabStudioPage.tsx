import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  asChronicleRoute,
  asChronicleTenantId,
  asChronicleTag,
  asChroniclePluginId,
  asChronicleStepId,
  asChronicleTag as brandTag,
  type ChroniclePluginDescriptor,
  type ChroniclePluginId,
  type ChronicleStatus,
  type ChroniclePhase,
} from '@shared/chronicle-orchestration-protocol';
import { buildTimeline } from '@shared/chronicle-orchestration-protocol';
import { createLabAdapter, describeSimulation, type InsightRecord } from '@domain/recovery-chronicle-lab-core';
import { ChronicleLabControl } from '../components/ChronicleLabControl';
import { ChronicleLabMetrics } from '../components/ChronicleLabMetrics';
import { ChronicleLabTimeline, ChronicleLabTimelineStrip } from '../components/ChronicleLabTimeline';
import { useChronicleLabCatalog } from '../hooks/useChronicleLabCatalog';
import type { SimulationInput } from '@domain/recovery-chronicle-lab-core';
import { useChronicleLabSession } from '../hooks/useChronicleLabSession';

const demoPlugins: ChroniclePluginDescriptor[] = [
  {
    id: asChroniclePluginId('bootstrap-core'),
    name: 'Bootstrap Core',
    version: '1.0.0',
    supports: ['phase:boot'] as ChroniclePhase[],
    state: {
      version: '1.0.0',
      active: true,
      retries: 2,
      latencyBudgetMs: 250,
      labels: [asChronicleTag('bootstrap'), asChronicleTag('primary')],
      config: {
        maxParallelism: 3,
        timeoutMs: 2_000,
        tags: [asChronicleTag('bootstrap')],
      },
    },
    process: async () => ({
      stepId: asChronicleStepId('bootstrap-step'),
      status: 'succeeded',
      latencyMs: 32,
      score: 100,
      payload: {
        stage: 'bootstrap',
        ready: true,
      },
    }),
  },
  {
    id: asChroniclePluginId('observe-coverage'),
    name: 'Observe Coverage',
    version: '1.2.0',
    supports: ['phase:signal'] as ChroniclePhase[],
    state: {
      version: '1.0.0',
      active: true,
      retries: 1,
      latencyBudgetMs: 500,
      labels: [asChronicleTag('observe'), asChronicleTag('signal')],
      config: {
        maxParallelism: 2,
        timeoutMs: 2_500,
        tags: [asChronicleTag('observe')],
      },
    },
    process: async () => ({
      stepId: asChronicleStepId('observe-step'),
      status: 'running',
      latencyMs: 88,
      score: 82,
      payload: {
        stage: 'signal',
        sampleSize: 300,
      },
    }),
  },
  {
    id: asChroniclePluginId('policy-gate'),
    name: 'Policy Gate',
    version: '1.1.0',
    supports: ['phase:policy'] as ChroniclePhase[],
    state: {
      version: '1.0.0',
      active: true,
      retries: 1,
      latencyBudgetMs: 300,
      labels: [asChronicleTag('policy')],
      config: {
        maxParallelism: 2,
        timeoutMs: 3_000,
        tags: [asChronicleTag('policy')],
      },
    },
    process: async () => ({
      stepId: asChronicleStepId('policy-step'),
      status: 'queued',
      latencyMs: 72,
      score: 94,
      payload: {
        stage: 'policy',
        ruleSet: 'default',
      },
    }),
  },
  {
    id: asChroniclePluginId('verify-final'),
    name: 'Verifier',
    version: '2.0.0',
    supports: ['phase:verify'] as ChroniclePhase[],
    state: {
      version: '2.0.0',
      active: true,
      retries: 3,
      latencyBudgetMs: 420,
      labels: [asChronicleTag('verify'), asChronicleTag('final')],
      config: {
        maxParallelism: 4,
        timeoutMs: 1_500,
        tags: [asChronicleTag('verify')],
      },
    },
    process: async () => ({
      stepId: asChronicleStepId('verify-step'),
      status: 'succeeded',
      latencyMs: 40,
      score: 78,
      payload: {
        stage: 'verify',
        checks: ['consistency', 'durability'],
      },
    }),
  },
  {
    id: asChroniclePluginId('finalize-report'),
    name: 'Finalize Report',
    version: '0.9.0',
    supports: ['phase:finalize'] as ChroniclePhase[],
    state: {
      version: '3.0.0',
      active: true,
      retries: 1,
      latencyBudgetMs: 200,
      labels: [asChronicleTag('report'), asChronicleTag('finalize')],
      config: {
        maxParallelism: 1,
        timeoutMs: 1_000,
        tags: [asChronicleTag('report')],
      },
    },
    process: async () => ({
      stepId: asChronicleStepId('finalize-step'),
      status: 'succeeded',
      latencyMs: 24,
      score: 91,
      payload: {
        stage: 'finalize',
        complete: true,
      },
    }),
  },
];

const metricsByStatus = (status: ChronicleStatus) => {
  switch (status) {
    case 'succeeded':
      return [
        { axis: 'Throughput', score: 92, trend: 'up' as const },
        { axis: 'Coverage', score: 84, trend: 'up' as const },
        { axis: 'Latency', score: 45, trend: 'flat' as const },
      ];
    case 'degraded':
      return [
        { axis: 'Throughput', score: 54, trend: 'down' as const },
        { axis: 'Coverage', score: 65, trend: 'flat' as const },
        { axis: 'Latency', score: 76, trend: 'up' as const },
      ];
    case 'failed':
      return [
        { axis: 'Throughput', score: 20, trend: 'down' as const },
        { axis: 'Coverage', score: 10, trend: 'down' as const },
        { axis: 'Latency', score: 95, trend: 'up' as const },
      ];
    default:
      return [
        { axis: 'Throughput', score: 0, trend: 'flat' as const },
        { axis: 'Coverage', score: 0, trend: 'flat' as const },
        { axis: 'Latency', score: 0, trend: 'flat' as const },
      ];
  }
};

const buildSummary = (status: ChronicleStatus, score: number): string => {
  const state = status === 'succeeded' ? 'healthy' : status === 'degraded' ? 'attention' : status === 'failed' ? 'incident' : 'idle';
  const trendText = score > 80 ? 'high' : score > 60 ? 'moderate' : 'low';
  return `${state} / ${trendText} (${score.toFixed(1)}).`;
};

const buildSimulationInput = (tenant: string, route: string): SimulationInput => ({
  tenant: asChronicleTenantId(tenant),
  route: asChronicleRoute(route),
  goal: {
    kind: 'reduce-rto',
    target: 60,
  },
  limit: 6,
});

const pluginById = (plugins: readonly ChroniclePluginDescriptor[], ids: readonly ChroniclePluginId[]) =>
  ids
    .map((pluginId) => plugins.find((plugin) => plugin.id === pluginId))
    .filter((plugin): plugin is ChroniclePluginDescriptor => plugin !== undefined);

const buildPlanRoute = (route: string) => {
  const routeObj = asChronicleRoute(route);
  const topology = buildTimeline(routeObj, [
    { phase: 'phase:boot', weight: 1 },
    { phase: 'phase:signal', weight: 3 },
    { phase: 'phase:policy', weight: 4 },
    { phase: 'phase:verify', weight: 6 },
    { phase: 'phase:finalize', weight: 1 },
  ]);
  return {
    route: routeObj,
    nodes: topology.nodes.length,
    edges: topology.edges.length,
  };
};

export const ChronicleLabStudioPage = ({ tenant, route }: { tenant: string; route: string }): ReactElement => {
  const catalog = useChronicleLabCatalog(tenant, demoPlugins);
  const session = useChronicleLabSession(tenant, route, demoPlugins);
  const [selectedAxis, setSelectedAxis] = useState('Coverage');
  const [history, setHistory] = useState<readonly string[]>([]);
  const [selectedPlugins, setSelectedPlugins] = useState<readonly ChroniclePluginId[]>([
    asChroniclePluginId('bootstrap-core'),
    asChroniclePluginId('observe-coverage'),
  ]);

  const input = useMemo(() => buildSimulationInput(tenant, route), [route, tenant]);
  const adapter = useMemo(() => createLabAdapter(tenant), [tenant]);
  const summary = buildSummary(session.status, session.score);

  const routePlan = useMemo(() => buildPlanRoute(route), [route]);
  const selected = useMemo(() => pluginById(demoPlugins, selectedPlugins), [selectedPlugins]);
  const metricRows = useMemo(() => metricsByStatus(session.status), [session.status]);

  const onSelectAxis = (axis: string) => {
    setSelectedAxis(axis);
  };

  const handleRun = async () => {
    const lines = await adapter.runSimulationLog(input, selected);
    setHistory(lines);
  };

  const selectedReport = useMemo(() => {
    if (history.length === 0) {
      return 'No runs yet';
    }

    const selectedHistory = history.filter((line) => line.includes(selectedAxis));
    return selectedHistory.length === 0 ? history.join('\n') : selectedHistory.join('\n');
  }, [history, selectedAxis]);

  const canLaunch = selected.length > 0 && session.status !== 'running';

  return (
    <main>
      <header>
        <h1>Chronicle Lab Studio</h1>
        <p>Tenant: {tenant}</p>
        <p>
          Route plan: {routePlan.nodes} nodes / {routePlan.edges} edges
        </p>
      </header>

      <section>
        <ChronicleLabControl tenant={tenant} route={route} plugins={demoPlugins} onStatus={(status) => setSelectedAxis(`${status}`)} />
      </section>

      <ChronicleLabMetrics
        axisRows={metricRows}
        status={session.status}
        summary={summary}
        onAxisSelected={(axis) => setSelectedAxis(axis)}
      />

      <section>
        <h2>Plugin Catalog</h2>
        <p>Total plugins: {catalog.totalPlugins}</p>
        <ul>
          {catalog.pluginRows.map((plugin) => (
            <li key={plugin.id}>
              <strong>{plugin.name}</strong> supports {plugin.supportCount} phases ({plugin.version})
              <small> scoreHint {plugin.scoreHint}</small>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Plugin controls</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {demoPlugins.map((plugin) => (
            <button
              key={plugin.id}
              type="button"
              onClick={() => {
                const pluginId = plugin.id as ChroniclePluginId;
                setSelectedPlugins((current) =>
                  current.includes(pluginId) ? current.filter((id) => id !== pluginId) : [...current, pluginId],
                );
              }}
            >
              {String(plugin.id)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Topology route</h2>
        <p>{asChronicleRoute(route).toString()}</p>
        <ChronicleLabTimelineStrip events={[...session.events, ...catalog.pluginRows.map((entry) => entry.name)]} />
      </section>

      <section>
        <ChronicleLabTimeline
          title="Timeline"
          events={session.events}
          onSelectEvent={(index, event) => {
            setSelectedAxis(`${selectedAxis}|${index}`);
            void event;
          }}
        />
      </section>

      <section>
        <h2>Run history</h2>
        <button type="button" onClick={handleRun} disabled={!canLaunch}>
          Run current selection
        </button>
        <pre style={{ maxHeight: 250, overflow: 'auto' }}>{selectedReport}</pre>
      </section>

      <section>
        <h2>Adapter probe</h2>
        <button
          type="button"
          onClick={async () => {
            const logs = await adapter.runSimulation(input, selected);
            setHistory((current) => [
              `run=${logs.runId} status=${logs.status} score=${logs.metrics['metric:score']}`,
              ...current,
            ]);
          }}
        >
          Probe adapter once
        </button>
      </section>

      <section>
        <h2>Plan snapshot</h2>
        <ul>
          {catalog.phases.map((phase) => (
            <li key={phase}>{phase}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
