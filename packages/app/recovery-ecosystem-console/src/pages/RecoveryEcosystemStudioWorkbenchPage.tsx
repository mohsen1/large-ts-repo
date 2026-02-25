import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useEcosystemPluginWorkbench } from '../hooks/useEcosystemPluginWorkbench';
import { StudioTopologyGraph } from '../components/StudioTopologyGraph';
import { StudioRunJournal } from '../components/StudioRunJournal';

const availableKinds = ['normalize', 'evaluate', 'publish', 'inspect', 'telemetry', 'plan', 'policy'] as const;

const normalizeSeed = (seed: string): string => seed.toLowerCase().replace(/[^a-z0-9._-]/gi, '-');
const uniqueValues = <T extends string>(values: readonly T[]): readonly T[] =>
  [...new Set(values)] as readonly T[];

const toSignalKind = (kind: string, index: number): `signal:${string}` =>
  `signal:${normalizeSeed(`${kind}-${index}`)}` as `signal:${string}`;

const buildSignalKinds = (seed: string): readonly `signal:${string}`[] =>
  uniqueValues(availableKinds).map((kind, index) => toSignalKind(kind, index + seed.length));

const describe = (values: readonly string[]): string => values.join(',');

export const RecoveryEcosystemStudioWorkbenchPage = ({
  tenantId = 'tenant:default',
  namespace = 'namespace:recovery-ecosystem',
}: {
  readonly tenantId?: string;
  readonly namespace?: string;
}): ReactElement => {
  const [selected, setSelected] = useState<string>('');
  const [seed, setSeed] = useState<string>('recover');
  const { state, pluginNodes, actions, renderSummary } = useEcosystemPluginWorkbench({
    tenantId,
    namespace,
  });

  const planSignals = useMemo(() => buildSignalKinds(seed), [seed]);
  const diagnosticsSummary = useMemo(() => describe(planSignals), [planSignals]);

  const seedSignals = useCallback(() => {
    for (const kind of planSignals) {
      actions.addSignal(kind);
    }
  }, [actions, planSignals]);

  const run = useCallback(async () => {
    await actions.run();
  }, [actions]);

  const runScenario = useCallback(async () => {
    await actions.runScenario();
  }, [actions]);

  const clear = useCallback(() => {
    actions.clear();
    setSelected('');
  }, [actions]);

  return (
    <main>
      <h2>Recovery Ecosystem Studio Workbench</h2>
      <p>{tenantId}</p>
      <p>{namespace}</p>
      <section>
        <input
          type="text"
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
          placeholder="seed"
        />
        <button type="button" onClick={() => void seedSignals()}>
          seed
        </button>
        <button type="button" onClick={() => void run()}>
          run
        </button>
        <button type="button" onClick={() => void runScenario()}>
          scenario
        </button>
        <button type="button" onClick={() => void actions.refreshCatalog()}>
          refresh-catalog
        </button>
        <button type="button" onClick={clear}>
          clear
        </button>
      </section>
      <section>
        <button type="button" onClick={() => void actions.addSignal('normalize')} disabled={!seed}>add normalize</button>
        <button type="button" onClick={() => void actions.addSignal('evaluate')} disabled={!seed}>add evaluate</button>
        <button type="button" onClick={() => void actions.addSignal('publish')} disabled={!seed}>add publish</button>
      </section>
      <section>
        <h3>Signals</h3>
        <p>{diagnosticsSummary}</p>
      </section>
      <StudioTopologyGraph
        plugins={pluginNodes}
        selected={selected}
        onSelect={setSelected}
      />
      <StudioRunJournal results={state.results} running={state.loading} />
      {renderSummary()}
      <section>
        <h4>State</h4>
        <pre>{JSON.stringify({
          phase: state.phase,
          status: state.status,
          signals: state.signals.length,
          catalog: state.catalog.length,
          count: state.results.length,
        }, null, 2)}
        </pre>
      </section>
    </main>
  );
};
