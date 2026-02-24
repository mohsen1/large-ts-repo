import { Fragment, type ReactElement, useMemo } from 'react';
import { asChroniclePluginId, asChroniclePhase, asChronicleRunId, asChronicleStepId, asChronicleTenantId, type ChroniclePluginDescriptor } from '@domain/recovery-chronicle-core';
import { useChroniclePlugins } from '../hooks/useChroniclePlugins';
import { useChronicleWorkspace } from '../hooks/useChronicleWorkspace';
import { ChronicleHealthStrip } from '../components/ChronicleHealthStrip';
import { asChroniclePlanId, type ChronicleRoute } from '@domain/recovery-chronicle-core';

const tenantId = asChronicleTenantId('tenant:playground');
const route = 'chronicle://playground' as ChronicleRoute;
const runIdSeed = asChronicleRunId(asChroniclePlanId(tenantId, route));

const plugins: readonly ChroniclePluginDescriptor[] = [
  {
    id: asChroniclePluginId('bootstrap'),
    name: 'Bootstrap',
    version: '1.0.0',
    supports: [asChroniclePhase('bootstrap')],
    state: { enabled: true },
    process: async () => ({
      stepId: asChronicleStepId(`playground.bootstrap:${runIdSeed}`),
      runId: runIdSeed,
      status: 'running',
      latencyMs: 1,
      score: 20,
      payload: { step: 'bootstrap' },
    }),
  },
  {
    id: asChroniclePluginId('execute'),
    name: 'Execution',
    version: '1.0.0',
    supports: [asChroniclePhase('execution')],
    state: { enabled: true },
    process: async () => ({
      stepId: asChronicleStepId(`playground.execute:${runIdSeed}`),
      runId: runIdSeed,
      status: 'running',
      latencyMs: 2,
      score: 40,
      payload: { step: 'execution' },
    }),
  },
  {
    id: asChroniclePluginId('verify'),
    name: 'Verification',
    version: '1.0.0',
    supports: [asChroniclePhase('verification')],
    state: { enabled: true },
    process: async () => ({
      stepId: asChronicleStepId(`playground.verify:${runIdSeed}`),
      runId: runIdSeed,
      status: 'running',
      latencyMs: 5,
      score: 64,
      payload: { step: 'verification' },
    }),
  },
];

export const ChronicleRecoveryPlaygroundPage = (): ReactElement => {
  const tenant = tenantId;
  const discovered = useChroniclePlugins(tenant, [...plugins]);
  const [state, viewModel, actions] = useChronicleWorkspace(
    tenant,
    route,
    ['phase:bootstrap', 'phase:execution', 'phase:cleanup', 'phase:verification'],
  );

  const summary = useMemo(
    () => ({
      hasPlugins: discovered.ready,
      failedPlugins: discovered.hasFailed,
      pluginCount: discovered.plugins.length,
      route: viewModel.route,
      run: state.runId,
      latestStatus: state.status,
      score: state.score,
    }),
    [discovered.failedPlugins, discovered.hasFailed, discovered.plugins.length, discovered.ready, state.runId, state.score, state.status, viewModel.route],
  );

  const pluginCards = useMemo(
    () =>
      discovered.plugins
        .map((item) => `${item.status.toUpperCase()}: ${item.name}`)
        .join('\n'),
    [discovered.plugins],
  );

  return (
    <main>
      <h1>Recovery Playground</h1>
      <ChronicleHealthStrip plugins={discovered.plugins} warnings={state.warnings} />
      <section>
        <h2>Control Plane</h2>
        <button type="button" onClick={() => void actions.run()}>
          Start
        </button>
        <button type="button" onClick={() => void actions.refresh()}>
          Refresh
        </button>
        <button type="button" onClick={() => actions.reset()}>
          Reset
        </button>
      </section>
      <section>
        <h2>Summary</h2>
        <pre>{JSON.stringify(summary, null, 2)}</pre>
      </section>
      <section>
        <h2>Plugin Catalog</h2>
        <pre>{pluginCards}</pre>
      </section>
      <ul>
        {state.errors.map((error) => (
          <li key={error}>
            <Fragment>{error}</Fragment>
          </li>
        ))}
      </ul>
    </main>
  );
};
