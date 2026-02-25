import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { PluginNode, PluginRunInput, PluginRunResult } from '@domain/recovery-ecosystem-analytics';
import { useEcosystemPluginStudio } from '../hooks/useEcosystemPluginStudio';
import { PluginStudioCanvas } from '../components/PluginStudioCanvas';
import { PluginSignalFlow } from '../components/PluginSignalFlow';
import { PluginSignalMetrics } from '../components/PluginSignalMetrics';
import { buildStudioPlan, usePluginStudioService } from '../services/ecosystemPluginStudioService';
import { useEcosystemAnalytics } from '../hooks/useEcosystemAnalytics';
import { asRun } from '@domain/recovery-ecosystem-analytics';

const availableKinds = ['normalize', 'score', 'evaluate', 'publish', 'policy', 'telemetry', 'topology'] as const;

const toPayload = (seed: string) => ({
  source: 'recovery-ecosystem-console',
  seed,
  values: seed.split('').map((entry, index) => index + entry.charCodeAt(0)),
});

const seedToNode = (entry: string, index: number, namespace: string, tenantId: string): PluginNode => ({
  name: `plugin:${entry}`,
  namespace: `namespace:${namespace}`,
  kind: 'plugin:runtime' as `plugin:${string}`,
  dependsOn: [],
  inputKinds: ['in:runtime'],
  outputKinds: ['out:runtime'],
  weight: index + 1,
  signature: `${tenantId}:${entry}`,
  version: 'v1',
  metadata: {
    owner: tenantId,
    domain: namespace,
    createdAt: new Date().toISOString(),
    tags: ['studio'],
  },
  run: async (input: PluginRunInput): Promise<PluginRunResult> => ({
    plugin: `plugin:${entry}` as const,
    accepted: true,
    signalCount: Math.max(1, input.value),
    payload: { ...toPayload(input.kind), node: entry, at: input.at },
    diagnostics: [{ step: input.kind, latencyMs: 2 }],
  }),
});

export const RecoveryEcosystemPluginStudioPage = ({
  tenantId = 'tenant:default',
  namespace = 'namespace:recovery-ecosystem',
}: {
  tenantId?: string;
  namespace?: string;
}): ReactElement => {
  const { state, setSignal, clearSignals, refreshCatalog, run, runScenario, digest } = useEcosystemPluginStudio({
    tenantId,
    namespace,
  });
  const [selected, setSelected] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const service = usePluginStudioService(tenantId, namespace);
  const analytics = useEcosystemAnalytics(tenantId, namespace);
  const [status, setStatus] = useState<string>('ready');

  const pluginNodes = useMemo<readonly PluginNode[]>(
    () => state.catalog.map((entry, index) => seedToNode(entry, index, namespace, tenantId)),
    [state.catalog, namespace, tenantId],
  );
  const studioResults: readonly PluginRunResult[] = state.results;
  const catalogSummary = useMemo(() => state.catalog.join('|'), [state.catalog]);

  const addSignal = async (kind: string) => {
    const next = {
      kind,
      value: Math.max(1, query.length || 1),
      payload: toPayload(`${kind}:${query}:${Date.now()}`),
    };
    setSignal(next);
    await service.loadCatalog();
    const plan = buildStudioPlan([next]);
    if (plan.route.length === 0) {
      setStatus('empty-plan');
      return;
    }
    const result = await run();
    if (!result.ok) {
      setStatus('run-failed');
      return;
    }
    await analytics.run({
      tenant: tenantId,
      namespace,
      signalKinds: availableKinds,
    });
    setStatus(`run:${result.value.runId}`);
  };

  const prune = (plugin: string) => {
    clearSignals();
    if (plugin.length > 0) {
      setStatus(`pruned:${plugin}`);
    }
  };

  const runDiagnostics = async () => {
    const result = await run();
    if (!result.ok) {
      setStatus('run-failed');
      return;
    }
    const diagnostics = await service.diagnostics(result.value.runId);
    if (diagnostics.ok) {
      setStatus(`diagnostics:${diagnostics.value.length}`);
    }
    const runId = asRun(result.value.runId);
    return runId;
  };

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  return (
    <main>
      <header>
        <h1>Recovery Ecosystem Plugin Studio</h1>
        <p>{tenantId} · {namespace}</p>
      </header>
      <section>
        <button type="button" onClick={() => void refreshCatalog()} disabled={state.loading}>
          refresh
        </button>
        <button type="button" onClick={() => void run()} disabled={state.signals.length === 0 || state.loading}>
          run studio
        </button>
        <button type="button" onClick={runScenario} disabled={state.loading}>
          run scenario
        </button>
        <button type="button" onClick={() => void runDiagnostics()}>
          diagnostics
        </button>
        <button type="button" onClick={clearSignals}>
          clear
        </button>
      </section>
      <section>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="seed text" />
        {availableKinds.map((kind) => (
          <button type="button" key={kind} onClick={() => void addSignal(kind)}>
            +{kind}
          </button>
        ))}
      </section>
      <PluginStudioCanvas plugins={pluginNodes} selected={selected} onSelect={setSelected} />
      <PluginSignalFlow results={studioResults} onPrune={prune} />
      <PluginSignalMetrics results={studioResults} />
      <section>
        <h3>Diagnostics</h3>
        {digest}
      </section>
      <section>
        <h3>Workspace</h3>
        <pre>{JSON.stringify(analytics.eventTrace, null, 2)}</pre>
        <pre>{JSON.stringify(studioResults, null, 2)}</pre>
        <p>{catalogSummary}</p>
        <p>{status}</p>
      </section>
    </main>
  );
};
