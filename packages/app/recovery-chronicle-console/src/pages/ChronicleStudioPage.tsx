import { useMemo } from 'react';
import type { ReactElement } from 'react';
import {
  ChronicleStatus,
  asChroniclePlanId,
  asChroniclePhase,
  asChroniclePluginId,
  asChronicleRunId,
  asChronicleStepId,
  asChronicleTenantId,
  type ChroniclePluginDescriptor,
  type ChroniclePhase,
  type ChronicleRoute,
} from '@domain/recovery-chronicle-core';
import { useChroniclePlugins } from '../hooks/useChroniclePlugins';
import { ChronicleHealthStrip } from '../components/ChronicleHealthStrip';
import { ChroniclePolicyPanel, MetricSummary } from '../components/ChroniclePolicyPanel';
import { ChronicleTopologyPanel, ChronicleTopologyStrip } from '../components/ChronicleTopologyPanel';
import { useChronicleWorkspace } from '../hooks/useChronicleWorkspace';
import { emptyMetric, type TimelinePoint } from '../types';
import { normalize } from '@domain/recovery-chronicle-core';

const pluginCatalog: ChroniclePluginDescriptor[] = [
  {
    id: asChroniclePluginId('bootstrap'),
    name: 'Bootstrap Policy',
    version: '1.0.0',
    supports: ['phase:bootstrap'],
    state: {},
    process: async () => ({
      stepId: asChronicleStepId('bootstrap'),
      runId: asChronicleRunId(asChroniclePlanId(asChronicleTenantId('tenant:studio'), 'chronicle://studio')),
      status: 'running',
      latencyMs: 3,
      score: 12,
      payload: {},
    }),
  },
  {
    id: asChroniclePluginId('verify'),
    name: 'Verification Policy',
    version: '1.0.0',
    supports: ['phase:verification'],
    state: {},
    process: async () => ({
      stepId: asChronicleStepId('verify'),
      runId: asChronicleRunId(asChroniclePlanId(asChronicleTenantId('tenant:studio'), 'chronicle://studio')),
      status: 'running',
      latencyMs: 5,
      score: 6,
      payload: {},
    }),
  },
] as const;

const route: ChronicleRoute = 'chronicle://studio';

const statusForTimeline = (status: ChronicleStatus): ChronicleStatus => status;

export const ChronicleStudioPage = ({
  tenant,
  route,
}: {
  tenant: string;
  route: string;
}): ReactElement => {
  const [state, viewModel, actions] = useChronicleWorkspace(
    tenant,
    route,
    ['phase:bootstrap', 'phase:execution', 'phase:verification'] as readonly ChroniclePhase[],
  );
  const pluginState = useChroniclePlugins(tenant as any, [...pluginCatalog]);

  const metrics = useMemo(
    () => [
      { ...emptyMetric, axis: 'throughput', score: 72, trend: 'up' as const },
      { ...emptyMetric, axis: 'resilience', score: 64, trend: 'flat' as const },
      { ...emptyMetric, axis: 'observability', score: 48, trend: 'down' as const },
      { ...emptyMetric, axis: 'compliance', score: 52, trend: 'up' as const },
    ],
    [],
  );

  const timeline = useMemo(
    () =>
      viewModel.timeline.map((item, index): TimelinePoint => ({
        label: item,
        score: Math.max(10, Math.min(100, 120 - index * 4)),
        status: statusForTimeline(state.status === 'idle' ? 'queued' : state.status),
      })),
    [state.status, viewModel.timeline],
  );

  return (
    <main>
      <header>
        <h1>Chronicle Studio</h1>
        <p>{normalize(`tenant/${viewModel.tenant ?? 'unknown'}`)}</p>
      </header>
      <section>
        <button type="button" onClick={() => void actions.run()} disabled={state.status === 'running'}>
          Run Simulation
        </button>
        <button type="button" onClick={() => void actions.refresh()}>
          Refresh
        </button>
        <button type="button" onClick={actions.reset}>
          Reset
        </button>
      </section>

      <ChronicleHealthStrip plugins={pluginState.plugins} warnings={state.warnings} />

      <section>
        <h2>Run {state.runId ?? 'uninitialized'}</h2>
        <p>Route: {viewModel.route ?? route}</p>
        <p>Status: {state.status}</p>
        <p>Score: {state.score.toFixed(1)}</p>
      </section>

      <ChroniclePolicyPanel
        metrics={metrics}
        onSelect={(axis) => {
          console.log('select', axis);
        }}
      />

      <MetricSummary>
        <ChronicleTopologyPanel title="Timeline" points={timeline} />
        <ChronicleTopologyStrip points={timeline} />
      </MetricSummary>
      <ul>
        {state.errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </main>
  );
};
