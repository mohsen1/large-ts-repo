import { useMemo, useReducer } from 'react';
import type { CampaignRunResult, IncidentSignal } from '@domain/fault-intel-orchestration';
import { toSignalEnvelope } from '@data/fault-intel-store';

type WorkbenchSort = 'risk' | 'severity' | 'time';

type WorkbenchEvent =
  | { readonly kind: 'select'; readonly phase: string }
  | { readonly kind: 'toggle'; readonly signalId: string }
  | { readonly kind: 'sort'; readonly mode: WorkbenchSort };

interface WorkbenchSignalRow {
  readonly signal: IncidentSignal;
  readonly rank: number;
  readonly critical: boolean;
}

interface FaultIntelCampaignWorkbenchProps {
  readonly run?: CampaignRunResult;
  readonly onNavigatePhase: (phase: string) => void;
}

interface WorkbenchState {
  readonly selectedSignals: ReadonlySet<string>;
  readonly sortMode: WorkbenchSort;
}

interface WorkbenchReducer {
  readonly selectedSignals: WorkbenchState['selectedSignals'];
  readonly sortMode: WorkbenchState['sortMode'];
}

const reducer = (state: WorkbenchReducer, event: WorkbenchEvent): WorkbenchReducer => {
  switch (event.kind) {
    case 'select':
      return state;
    case 'toggle':
      return {
        ...state,
        selectedSignals: state.selectedSignals.has(event.signalId)
          ? new Set([...state.selectedSignals].filter((entry) => entry !== event.signalId))
          : new Set([...state.selectedSignals, event.signalId]),
      };
    case 'sort':
      return {
        ...state,
        sortMode: event.mode,
      };
    default:
      return state;
  }
};

const severityWeight = (signal: IncidentSignal): number => {
  switch (signal.severity) {
    case 'critical':
      return 4;
    case 'warning':
      return 3;
    case 'advisory':
      return 2;
    default:
      return 1;
  }
};

export const FaultIntelCampaignWorkbench = ({ run, onNavigatePhase }: FaultIntelCampaignWorkbenchProps) => {
  const [state, dispatch] = useReducer(reducer, {
    selectedSignals: new Set<string>(),
    sortMode: 'time' as const,
  });

  const rows = useMemo(() => {
    const candidates = run ? run.signals : [];
    const payload = candidates
      .map((signal, index) => ({
        signal,
        rank: index + 1,
        critical: signal.severity === 'critical',
      }))
      .sort((left, right) => {
        switch (state.sortMode) {
          case 'risk':
            return severityWeight(right.signal) - severityWeight(left.signal);
          case 'severity':
            return right.signal.severity.localeCompare(left.signal.severity);
          default:
            return right.signal.observedAt.localeCompare(left.signal.observedAt);
        }
      })
      .slice(0, 12);
    return payload as readonly WorkbenchSignalRow[];
  }, [run, state.sortMode]);

  const detail = useMemo(() => {
    if (!run) {
      return {
        label: 'No run selected',
        phase: 'intake',
      } as const;
    }

    const route = run.policy.requiredStages.join(' • ');
    const topTransport = run.signals.reduce<Record<string, number>>((acc, signal) => {
      acc[signal.transport] = (acc[signal.transport] ?? 0) + signal.metrics.length;
      return acc;
    }, {} as Record<string, number>);
    const sorted = Object.entries(topTransport).sort((left, right) => right[1] - left[1]);

    return {
      label: `${run.policy.name} / risk ${run.riskScore.toFixed(2)}`,
      phase: run.policy.requiredTransports.join(' -> '),
      topology: `${route} :: ${sorted[0]?.[0] ?? 'mesh'}`,
    };
  }, [run]);

  const selectedSignalCount = state.selectedSignals.size;

  return (
    <section style={{ border: '1px solid #1d4ed8', borderRadius: 12, padding: 12, background: '#0f172a', color: '#e2e8f0' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Campaign workbench</h3>
        <strong style={{ color: '#a5b4fc' }}>{detail.label}</strong>
      </header>

      <p style={{ marginTop: 0, marginBottom: 8 }}>
        Route: {detail.phase}
        <br />
        Topology: {detail.topology}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['time', 'risk', 'severity'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => dispatch({ kind: 'sort', mode })}
            style={{
              borderRadius: 999,
              padding: '6px 10px',
              border: `1px solid ${state.sortMode === mode ? '#38bdf8' : '#475569'}`,
              background: state.sortMode === mode ? '#0ea5e9' : '#0b1220',
              color: '#f8fafc',
            }}
          >
            sort by {mode}
          </button>
        ))}
      </div>

      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {rows.map((entry) => {
          const envelope = toSignalEnvelope(entry.signal);
          const selected = state.selectedSignals.has(entry.signal.signalId);
          return (
            <li
              key={entry.signal.signalId}
              style={{
                border: `1px solid ${selected ? '#22c55e' : '#334155'}`,
                borderRadius: 10,
                padding: 8,
                background: selected ? 'rgba(34,197,94,0.1)' : 'rgba(15,23,42,0.65)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: entry.critical ? '#fda4af' : '#e2e8f0' }}>
                  {entry.rank}. {entry.signal.title}
                </strong>
                <span>{envelope.score}</span>
              </div>
              <small style={{ color: '#cbd5e1' }}>
                {entry.signal.signalId} / {entry.signal.transport} / {entry.signal.severity}
              </small>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => dispatch({ kind: 'toggle', signalId: entry.signal.signalId })}>
                  {selected ? 'unpin' : 'pin'} signal
                </button>
                <button type="button" onClick={() => onNavigatePhase('triage')}>
                  triage
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <footer style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8' }}>
        <p style={{ margin: 0 }}>Pinned: {selectedSignalCount}</p>
        {selectedSignalCount > 0 ? (
          <p style={{ margin: 0 }}>
            selected signals: {[...state.selectedSignals].map((entry) => entry).join(', ')}
          </p>
        ) : null}
      </footer>
    </section>
  );
};
