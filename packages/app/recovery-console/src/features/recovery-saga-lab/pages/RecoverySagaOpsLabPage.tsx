import { useMemo } from 'react';
import { SagaWorkspaceHeader } from '../components/SagaWorkspaceHeader';
import { SagaRuntimeSummary } from '../components/SagaRuntimeSummary';
import { SagaPolicyTable } from '../components/SagaPolicyTable';
import { SagaEventTicker } from '../components/SagaEventTicker';
import { SagaNodeCard } from '../components/SagaNodeCard';
import { useSagaOrchestrator } from '../hooks/useSagaOrchestrator';
import type { ReactElement } from 'react';

export const RecoverySagaOpsLabPage = (): ReactElement => {
  const { state, hydrate, selectTab, pluginFlip, refresh, derived } = useSagaOrchestrator();

  const summary = useMemo(() => {
    const count = state.pluginStatus.length;
    const warning = state.error ? 'error' : 'ok';
    return `${count} plugin(s), ${warning}, ${derived.statusText}`;
  }, [derived.statusText, state.error, state.pluginStatus.length]);

  return (
    <main className="recovery-saga-ops-lab">
      <SagaWorkspaceHeader state={state} summary={summary} onRefresh={refresh} onTab={selectTab} />
      <section className="recovery-saga-content">
        <div className="plugin-switches">
          {state.pluginStatus.map((plugin) => (
            <button
              key={plugin.plugin}
              type="button"
              onClick={() => pluginFlip(plugin.plugin)}
              className={plugin.enabled ? 'on' : 'off'}
            >
              {plugin.plugin} ({plugin.status})
            </button>
          ))}
          <button type="button" onClick={() => void hydrate()}>
            hydrate
          </button>
        </div>

        <SagaRuntimeSummary state={state} />

        <section className="tab-content">
          {state.selectedTab === 'timeline' && state.run && state.plan ? (
            <SagaNodeCard run={state.run} plan={state.plan} />
          ) : null}
          {state.selectedTab === 'topology' && <p>{`topology nodes: ${state.plan?.steps.length ?? 0}`}</p>}
          {state.selectedTab === 'policies' && <SagaPolicyTable policy={state.policy} />}
          {state.selectedTab === 'events' && <SagaEventTicker snapshot={state.runtime} />}
        </section>
      </section>
      <p>{derived.scenario ? derived.scenario.bundle.run.id : 'no-snapshot'}</p>
    </main>
  );
};
