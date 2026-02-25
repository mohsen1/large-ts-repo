import { type ReactElement, useMemo } from 'react';
import { resolveIdentityDescriptor, asSession, asWindow } from '@domain/recovery-ecosystem-analytics';
import type { AnalyticsStoreSignalEvent } from '@data/recovery-ecosystem-analytics-store';

export interface SignalMatrixPanelProps {
  readonly events: readonly AnalyticsStoreSignalEvent[];
  readonly onInspect: (session: string) => void;
}

interface MatrixCell {
  readonly row: string;
  readonly col: string;
  readonly at: string;
}

const detectKind = (entry: AnalyticsStoreSignalEvent): string =>
  resolveIdentityDescriptor(entry.kind).kind;

const buildMatrix = (entries: readonly AnalyticsStoreSignalEvent[]): readonly MatrixCell[] =>
  entries
    .map((entry) => ({
      row: detectKind(entry),
      col: asWindow(entry.namespace).replace('namespace:', ''),
      at: entry.at,
    }))
    .filter((entry) => entry.row.length > 0);

export const SignalMatrixPanel = ({ events, onInspect }: SignalMatrixPanelProps): ReactElement => {
  const matrix = useMemo(() => buildMatrix(events), [events]);
  const rows = [...new Set(matrix.map((entry) => entry.row))];
  const cols = [...new Set(matrix.map((entry) => entry.col))];
  const sessions = events.map((entry) => asSession(entry.session));

  return (
    <section>
      <h3>Signal Matrix</h3>
      <p>{`rows:${rows.length} cols:${cols.length} events:${events.length}`}</p>
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>Col</th>
            <th>At</th>
            <th>Inspect</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((cell, index) => (
            <tr key={`${cell.row}-${index}`}>
              <td>{cell.row}</td>
              <td>{cell.col}</td>
              <td>{cell.at}</td>
              <td>
                <button type="button" onClick={() => onInspect(`${asSession(sessions[index] ?? 'session:default')}`)}>
                  inspect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
