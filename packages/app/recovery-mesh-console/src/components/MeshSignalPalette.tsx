import { useMemo } from 'react';
import { type MeshPayloadFor, type MeshRunId, type MeshSignalKind } from '@service/recovery-ops-mesh-engine';
import type { SignalCatalogItem } from '../services/meshSignalCatalog';

export interface MeshSignalPaletteProps {
  readonly selected: MeshSignalKind;
  readonly onSelect: (kind: MeshSignalKind) => void;
  readonly mode: 'single' | 'batch';
  readonly items: readonly SignalCatalogItem[];
  readonly running: boolean;
}

interface SignalPaletteAction {
  readonly kind: MeshSignalKind;
  readonly label: string;
  readonly icon: string;
}

const defaultActions = [
  { kind: 'pulse', label: 'Pulse', icon: '⚡' },
  { kind: 'snapshot', label: 'Snapshot', icon: '📸' },
  { kind: 'alert', label: 'Alert', icon: '🚨' },
  { kind: 'telemetry', label: 'Telemetry', icon: '📈' },
] as const satisfies readonly SignalPaletteAction[];

export const MeshSignalPalette = ({ selected, onSelect, mode, items, running }: MeshSignalPaletteProps) => {
  const compact = useMemo(() => {
    const summary = items.reduce(
      (acc, item) => {
        const count = acc[item.kind] ?? 0;
        return {
          ...acc,
          [item.kind]: count + item.value,
        };
      },
      { pulse: 0, snapshot: 0, alert: 0, telemetry: 0 } as Record<MeshSignalKind, number>,
    );

    return defaultActions.map((action) => ({
      ...action,
      value: summary[action.kind],
      state: selected === action.kind ? 'on' : 'off',
    }));
  }, [items, selected]);

  const onClick = (kind: MeshSignalKind) => {
    if (!running) {
      onSelect(kind);
    }
  };

  return (
    <section>
      <h3>Signal Palette</h3>
      <p>Mode: {mode}</p>
      <ul>
        {compact.map((entry) => (
          <li key={entry.kind}>
            <button
              type="button"
              disabled={running}
              onClick={() => onClick(entry.kind)}
              data-state={entry.state}
            >
              <span>{entry.icon}</span>
              <span>{entry.label}</span>
              <strong>{entry.value}</strong>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export const MeshSignalSummary = ({
  payload,
}: {
  readonly payload: MeshPayloadFor<MeshSignalKind>;
}) => {
  const title = useMemo(() => {
    if (payload.kind === 'pulse') {
      const pulse = payload as MeshPayloadFor<'pulse'>;
      return `Pulse ${pulse.payload.value}`;
    }
    if (payload.kind === 'snapshot') {
      const snapshot = payload as MeshPayloadFor<'snapshot'>;
      return `Snapshot ${snapshot.payload.name}`;
    }
    if (payload.kind === 'alert') {
      const alert = payload as MeshPayloadFor<'alert'>;
      return `${alert.payload.severity}: ${alert.payload.reason}`;
    }
    const telemetry = payload as MeshPayloadFor<'telemetry'>;
    return `Telemetry ${JSON.stringify(telemetry.payload.metrics)}`;
  }, [payload]);

  return <p>{title}</p>;
};

export const MeshSignalBadge = ({
  kind,
  value,
}: {
  readonly kind: MeshSignalKind;
  readonly value: number;
}) => {
  return <span>{`${kind.toUpperCase()}:${value}`}</span>;
};

export const SignalHistoryLegend = ({
  history,
  onSelect,
}: {
  readonly history: readonly MeshRunId[];
  readonly onSelect: (runId: MeshRunId) => void;
}) => {
  return (
    <div>
      <h4>History</h4>
      <ul>
        {history.map((runId) => (
          <li key={runId}>
            <button type="button" onClick={() => onSelect(runId)}>
              {runId}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
