import { FC, Fragment, useCallback, useMemo, useReducer } from 'react';
import {
  createTenantId,
  createWorkloadId,
  type RouteTemplate,
  type SeverityBand,
  type TenantId,
  type WorkloadTopology,
} from '@domain/recovery-stress-lab';
import { type SignalOrchestratorOutput } from '@service/recovery-stress-lab-orchestrator';
import { StressLabSignalDeck } from '../components/stresslab/StressLabSignalDeck';
import { useStressLabOrchestrationDeck } from '../hooks/useStressLabOrchestrationDeck';

type DeckMode = 'compact' | 'expanded';

type DeckPresetId = `deck:${string}`;

type DeckPreset = {
  readonly id: DeckPresetId;
  readonly tenantId: TenantId;
  readonly displayName: string;
  readonly runbooks: readonly string[];
  readonly severityBand: SeverityBand;
  readonly topology: WorkloadTopology;
};

type DeckUiState = {
  readonly selectedPresetId: DeckPresetId;
  readonly showWarnOnly: boolean;
  readonly mode: DeckMode;
  readonly minTraceCount: number;
};

type DeckUiAction =
  | { readonly type: 'setPreset'; readonly presetId: DeckPresetId }
  | { readonly type: 'toggleWarningsOnly' }
  | { readonly type: 'setMode'; readonly mode: DeckMode }
  | { readonly type: 'raiseThreshold'; readonly next: number }
  | { readonly type: 'reduceThreshold'; readonly next: number };

type DeckTraceBucket = {
  readonly title: string;
  readonly severity: SeverityBand;
  readonly count: number;
};

const severityOrder = ['low', 'medium', 'high', 'critical'] as const satisfies readonly SeverityBand[];

const bucketTone = (severity: SeverityBand): string => {
  if (severity === 'critical') return '#dc2626';
  if (severity === 'high') return '#ea580c';
  if (severity === 'medium') return '#2563eb';
  return '#16a34a';
};

const hasWarnStatus = (bucket: DeckTraceBucket): boolean => bucket.severity === 'high';

const routeForPreset = (tenantId: DeckPreset['tenantId'], mode: DeckMode): RouteTemplate =>
  `${tenantId}::stress-lab::${mode}` as RouteTemplate;

const deriveBuckets = (outputs: readonly SignalOrchestratorOutput[]): readonly DeckTraceBucket[] =>
  outputs
    .flatMap((output) => output.chain.events)
    .filter((event): event is typeof event & { status: 'ok' | 'warn' } =>
      event.status === 'ok' || event.status === 'warn',
    )
    .map((event) => ({
      title: `${event.plugin}`,
      severity:
        event.status === 'warn' ? ('high' as const) : ('low' as const),
      count: 1,
    }))
    .reduce<readonly DeckTraceBucket[]>((acc, bucket) => {
      const existing = acc.findIndex((entry) => entry.title === bucket.title && entry.severity === bucket.severity);
      if (existing === -1) {
        return [...acc, bucket];
      }

      const merged = { ...acc[existing], count: acc[existing].count + bucket.count };
      return acc.map((entry, index) => (index === existing ? merged : entry));
    }, []);

const deckPresets = [
  {
    id: 'deck:stability',
    tenantId: createTenantId('tenant:recovery:stress:stability'),
    displayName: 'Stability Sweep',
    runbooks: ['runbook:orchestrate-cache', 'runbook:rollback'],
    severityBand: 'high' as const,
    topology: {
      tenantId: createTenantId('tenant:recovery:stress:stability'),
      nodes: [
        {
          id: createWorkloadId('edge'),
          name: 'Edge API',
          ownerTeam: 'platform',
          criticality: 4,
          active: true,
        },
        {
          id: createWorkloadId('cache'),
          name: 'Cache',
          ownerTeam: 'platform',
          criticality: 3,
          active: true,
        },
        {
          id: createWorkloadId('db'),
          name: 'Primary DB',
          ownerTeam: 'data',
          criticality: 5,
          active: false,
        },
      ],
      edges: [
        {
          from: createWorkloadId('edge'),
          to: createWorkloadId('cache'),
          coupling: 0.58,
          reason: 'api path',
        },
        {
          from: createWorkloadId('cache'),
          to: createWorkloadId('db'),
          coupling: 0.91,
          reason: 'query dependence',
        },
      ],
    } satisfies WorkloadTopology,
  },
  {
    id: 'deck:resilience',
    tenantId: createTenantId('tenant:recovery:stress:resilience'),
    displayName: 'Resilience Drill',
    runbooks: ['runbook:drain-fallback', 'runbook:orchestrate-cache'],
    severityBand: 'critical' as const,
    topology: {
      tenantId: createTenantId('tenant:recovery:stress:resilience'),
      nodes: [
        {
          id: createWorkloadId('front-door'),
          name: 'Front Door',
          ownerTeam: 'platform',
          criticality: 3,
          active: true,
        },
        {
          id: createWorkloadId('api'),
          name: 'API Gateway',
          ownerTeam: 'platform',
          criticality: 4,
          active: true,
        },
        {
          id: createWorkloadId('auth'),
          name: 'Auth Service',
          ownerTeam: 'identity',
          criticality: 5,
          active: true,
        },
      ],
      edges: [
        {
          from: createWorkloadId('front-door'),
          to: createWorkloadId('api'),
          coupling: 0.77,
          reason: 'traffic path',
        },
        {
          from: createWorkloadId('api'),
          to: createWorkloadId('auth'),
          coupling: 0.64,
          reason: 'session exchange',
        },
      ],
    } satisfies WorkloadTopology,
  },
  {
    id: 'deck:capacity',
    tenantId: createTenantId('tenant:recovery:stress:capacity'),
    displayName: 'Capacity Saturation',
    runbooks: ['runbook:rollback', 'runbook:drain-fallback'],
    severityBand: 'medium' as const,
    topology: {
      tenantId: createTenantId('tenant:recovery:stress:capacity'),
      nodes: [
        {
          id: createWorkloadId('api'),
          name: 'Core API',
          ownerTeam: 'platform',
          criticality: 4,
          active: true,
        },
        {
          id: createWorkloadId('stream'),
          name: 'Streaming Mesh',
          ownerTeam: 'platform',
          criticality: 2,
          active: true,
        },
        {
          id: createWorkloadId('store'),
          name: 'State Store',
          ownerTeam: 'data',
          criticality: 5,
          active: true,
        },
      ],
      edges: [
        {
          from: createWorkloadId('api'),
          to: createWorkloadId('stream'),
          coupling: 0.46,
          reason: 'write path',
        },
        {
          from: createWorkloadId('stream'),
          to: createWorkloadId('store'),
          coupling: 0.99,
          reason: 'durability',
        },
      ],
    } satisfies WorkloadTopology,
  },
] as const satisfies readonly DeckPreset[];

const resolvePreset = (presetId: string): DeckPreset =>
  deckPresets.find((preset) => preset.id === presetId) ?? deckPresets[0];

const uiReducer = (state: DeckUiState, action: DeckUiAction): DeckUiState => {
  switch (action.type) {
    case 'setPreset':
      return { ...state, selectedPresetId: action.presetId };
    case 'toggleWarningsOnly':
      return { ...state, showWarnOnly: !state.showWarnOnly };
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'raiseThreshold':
      return { ...state, minTraceCount: action.next };
    case 'reduceThreshold':
      return { ...state, minTraceCount: Math.max(1, action.next) };
    default:
      return state;
  }
};

const initialUiState = (): DeckUiState => ({
  selectedPresetId: deckPresets[0].id,
  showWarnOnly: false,
  mode: 'expanded',
  minTraceCount: 1,
});

export const RecoveryCockpitStressLabDeckOpsPage: FC = () => {
  const [uiState, dispatch] = useReducer(uiReducer, undefined, initialUiState);

  const selectedPreset = useMemo(() => resolvePreset(uiState.selectedPresetId), [uiState.selectedPresetId]);
  const { state, run, rerun, toggleRunbook, setBand } = useStressLabOrchestrationDeck({
    tenantId: selectedPreset.tenantId,
    topology: selectedPreset.topology,
    initialRunbooks: selectedPreset.runbooks,
    band: selectedPreset.severityBand,
  });

  const derivedBuckets = useMemo(
    () => deriveBuckets(state.outputs),
    [state.outputs],
  ) as readonly DeckTraceBucket[];

  const orderedBuckets = useMemo(
    () =>
      [...derivedBuckets]
        .filter((bucket) => bucket.count >= uiState.minTraceCount)
        .filter((bucket) => (uiState.showWarnOnly ? hasWarnStatus(bucket) : true))
        .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)),
    [derivedBuckets, uiState.minTraceCount, uiState.showWarnOnly],
  );

  const runSummary = useMemo(
    () =>
      state.outputs.reduce<
        Readonly<Record<'lastRunId', string>> &
          Readonly<Record<'status', 'ok' | 'warn'>> &
          Readonly<{ count: number; warnTraceCount: number; okTraceCount: number }>
      >(
        (acc, output) => {
          const warnCount = output.chain.events.filter((event) => event.status === 'warn').length;
          const status = warnCount > 1 ? ('warn' as const) : ('ok' as const);
          return {
            lastRunId: output.tenantId,
            status,
            count: acc.count + 1,
            warnTraceCount: acc.warnTraceCount + warnCount,
            okTraceCount: acc.okTraceCount + (output.chain.events.length - warnCount),
          };
        },
        { count: 0, warnTraceCount: 0, okTraceCount: 0, lastRunId: '', status: 'ok' },
      ),
    [state.outputs],
  );

  const isReadyToReplay = state.outputs.length > 0;

  const onReplay = useCallback(async () => {
    await rerun();
  }, [rerun]);

  const onRun = useCallback(async () => {
    const payloadPreset = selectedPreset;
    setBand(payloadPreset.severityBand);
    await run();
  }, [run, selectedPreset, setBand]);

  const onPreset = useCallback((presetId: DeckPresetId) => {
    dispatch({ type: 'setPreset', presetId });
  }, []);

  const onToggleRunbook = useCallback((runbookId: string) => {
    toggleRunbook(runbookId);
  }, [toggleRunbook]);

  return (
    <main style={{ minHeight: '100vh', padding: 20, display: 'grid', gap: 16, background: 'linear-gradient(135deg, #f8fafc, #eef2ff)' }}>
      <section
        style={{
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: 16,
          display: 'grid',
          gap: 12,
          background: 'rgba(255,255,255,0.82)',
        }}
      >
        <header style={{ display: 'grid', gap: 6 }}>
          <h1 style={{ margin: 0 }}>Stress Lab Deck Operations</h1>
          <p style={{ margin: 0, color: '#475569' }}>
            A typed deck-based control plane for running and replaying stress-orchestration scenarios.
          </p>
        </header>

        <fieldset
          style={{
            display: 'grid',
            gap: 10,
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 12,
            background: '#ffffff',
          }}
        >
          <legend style={{ fontWeight: 700 }}>Active deck profile</legend>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Preset</span>
            <select
              value={selectedPreset.id}
              onChange={(event) => onPreset(event.target.value as DeckPresetId)}
              style={{ maxWidth: 360 }}
            >
              {deckPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.displayName}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Mode</span>
            <select
              value={uiState.mode}
              onChange={(event) =>
                dispatch({ type: 'setMode', mode: event.target.value === 'compact' ? 'compact' : 'expanded' })
              }
            >
              <option value="expanded">Expanded</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span>Minimum event count</span>
            <input
              type="range"
              min={1}
              max={8}
              value={uiState.minTraceCount}
              onChange={(event) => dispatch({ type: 'raiseThreshold', next: Number(event.target.value) })}
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={uiState.showWarnOnly}
              onChange={() => dispatch({ type: 'toggleWarningsOnly' })}
            />
            <span>Show warning-heavy buckets only</span>
          </label>
        </fieldset>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onRun} style={{ padding: '8px 12px', borderRadius: 10 }}>
            Run scenario
          </button>
          <button
            type="button"
            disabled={!isReadyToReplay}
            onClick={onReplay}
            style={{ padding: '8px 12px', borderRadius: 10 }}
          >
            Replay latest
          </button>
          <button type="button" onClick={() => dispatch({ type: 'reduceThreshold', next: uiState.minTraceCount - 1 })}>
            Lower threshold
          </button>
        </div>

        <section style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Runbook selection</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {state.runbooks.map((runbook) => (
              <label key={runbook.id} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={runbook.selected}
                  onChange={() => onToggleRunbook(runbook.id)}
                />
                <span>{runbook.id}</span>
              </label>
            ))}
          </div>
        </section>
      </section>

      <section
        style={{
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: 12,
          background: 'rgba(255,255,255,0.82)',
          display: 'grid',
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0 }}>{selectedPreset.displayName}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(['tenant', 'runbooks', 'signals'] as const).map((label) => {
            const value =
              label === 'tenant'
                ? selectedPreset.tenantId
                : label === 'runbooks'
                  ? `${selectedPreset.runbooks.length}`
                  : `${state.signals.length}`;
            return (
              <div
                key={label}
                style={{
                  borderRadius: 10,
                  border: '1px dashed #94a3b8',
                  padding: 8,
                  minWidth: 160,
                }}
              >
                <div style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{value}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        style={{
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: 12,
          background: 'rgba(255,255,255,0.82)',
          display: 'grid',
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0 }}>Execution summary</h2>
        <div style={{ display: 'grid', gap: 6 }}>
          <code>runs: {runSummary.count}</code>
          <code>warn events: {runSummary.warnTraceCount}</code>
          <code>ok events: {runSummary.okTraceCount}</code>
          <code>status: {runSummary.status}</code>
          <code>route: {routeForPreset(selectedPreset.tenantId, uiState.mode)}</code>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Output buckets</h2>
        {orderedBuckets.length === 0 ? (
          <p>No buckets exceed the selected threshold.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {orderedBuckets.map((bucket) => {
              const styleColor = bucketTone(bucket.severity);
              return (
                <article
                  key={`${bucket.title}:${bucket.severity}`}
                  style={{
                    border: `1px solid ${styleColor}`,
                    borderRadius: 12,
                    padding: 12,
                    background: `${styleColor}10`,
                  }}
                >
                  <header>
                    <div style={{ fontWeight: 700, color: styleColor }}>{bucket.title}</div>
                    <small style={{ color: '#334155' }}>{bucket.severity}</small>
                  </header>
                  <p style={{ marginTop: 8 }}>{bucket.count} events</p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <StressLabSignalDeck
        tenantId={selectedPreset.tenantId}
        route={routeForPreset(selectedPreset.tenantId, uiState.mode)}
        planName={`${selectedPreset.displayName} · ${selectedPreset.severityBand}`}
        buckets={orderedBuckets.map(({ title, severity, count }) => ({ title, severity, count }))}
        outputs={state.outputs}
        traces={state.outputs.length === 0 ? [] : state.traces}
        onReplay={() => {
          void onReplay();
        }}
      />

      <section
        style={{
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: 12,
          background: 'rgba(255,255,255,0.82)',
        }}
      >
        <h3>Trace feed</h3>
        <div style={{ display: 'grid', gap: 6 }}>
          {state.traces.length === 0 ? (
            <p style={{ margin: 0, color: '#64748b' }}>No traces yet. Run a scenario to start.</p>
          ) : (
            state.traces.map((trace) => (
              <Fragment key={`${trace.when}-${trace.plugin}`}>
                <div
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${trace.status === 'warn' ? '#f59e0b' : '#0ea5e9'}`,
                    padding: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span>{trace.when}</span>
                  <span>{trace.plugin}</span>
                  <span>{trace.status}</span>
                </div>
              </Fragment>
            ))
          )}
        </div>
      </section>
    </main>
  );
};
