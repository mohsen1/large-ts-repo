import { useMemo, type ReactElement, type ReactNode } from 'react';
import { RunCommandPanel } from '../components/RunCommandPanel';
import { PluginRegistryPanel, PluginRegistrySummary, PluginRegistryEmpty } from '../components/PluginRegistryPanel';
import { RunTimeline } from '../components/RunTimeline';
import { useRecoveryEcosystemWorkspace } from '../hooks/useRecoveryEcosystemWorkspace';

type PluginData = {
  readonly name: string;
  readonly stageCount: number;
  readonly latencyMs: number;
  readonly healthy: boolean;
};

const makeTimelineEvents = () =>
  ['boot', 'connect', 'dispatch', 'complete'].map((entry, index) => ({
    at: new Date(Date.now() - index * 1200).toISOString(),
    message: `${entry}-event`,
    severity: index === 2 ? ('warn' as const) : index === 0 ? ('info' as const) : ('ok' as const),
  }));

const registry: readonly PluginData[] = [
  { name: 'baseline', stageCount: 4, latencyMs: 101, healthy: true },
  { name: 'policy', stageCount: 2, latencyMs: 230, healthy: true },
  { name: 'rollback', stageCount: 1, latencyMs: 700, healthy: false },
  { name: 'signal', stageCount: 3, latencyMs: 130, healthy: true },
  { name: 'telemetry', stageCount: 6, latencyMs: 90, healthy: true },
];

const WorkspaceHero = ({ namespace }: { readonly namespace: string }): ReactElement => {
  const signature = useMemo(() => {
    const hash = namespace
      .split('')
      .reduce((acc, value) => (acc * 31 + value.charCodeAt(0)) % 100000, 17);
    return `sig:${hash}`;
  }, [namespace]);

  return (
    <header>
      <h1>Ecosystem Console</h1>
      <p>Namespace signature: {signature}</p>
    </header>
  );
};

export const RecoveryEcosystemConsolePage = ({
  tenantId = 'tenant:default',
  namespace = 'ns:default',
}: {
  tenantId?: string;
  namespace?: string;
}): ReactElement => {
  const workspace = useRecoveryEcosystemWorkspace({ tenantId, namespace });
  const selectedPlugins = registry.filter((entry) => entry.healthy || workspace.workspace?.snapshotCount);
  const events = makeTimelineEvents();

  return (
    <main>
      <WorkspaceHero namespace={namespace} />
      <RunCommandPanel tenantId={tenantId} namespace={namespace} />
      <section>
        <h2>Run Diagnostics</h2>
        <RunTimeline events={events} title="Run trace" />
      </section>
      <section>
        <h2>Plugin status</h2>
        {selectedPlugins.length ? (
          <>
            <PluginRegistrySummary items={selectedPlugins} />
            <PluginRegistryPanel items={selectedPlugins} onRefresh={() => void workspace.refresh()} loading={workspace.running} />
          </>
        ) : (
          <PluginRegistryEmpty />
        )}
      </section>
    </main>
  );
};

export const RecoveryEcosystemSignalsPage = (): ReactElement => {
  const digest = (
    <ul>
      <li>Signals: preflight</li>
      <li>Signals: policy</li>
      <li>Signals: rollback</li>
      <li>Signals: completion</li>
    </ul>
  );
  return (
    <article>
      <h2>Recovery Ecosystem Signals</h2>
      {digest}
    </article>
  );
};

export const renderConsoleHeader = (title: string): ReactNode => <h1>{title}</h1>;
