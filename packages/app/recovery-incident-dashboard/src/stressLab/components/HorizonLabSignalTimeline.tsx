import { useMemo } from 'react';
import type { HorizonWorkspace } from '../types';

interface SignalTimelineProps {
  readonly workspace: HorizonWorkspace;
}

type SignalRecord = HorizonWorkspace['state']['signals'][number];

const formatIso = (value: string) => {
  const date = new Date(value);
  return date.toLocaleTimeString();
};

const labelStage = (stage: string) => `${stage.toUpperCase()} @ ${new Date().toISOString().slice(11, 19)}`;

const toRows = (signals: readonly SignalRecord[]) =>
  signals
    .map((record) => ({
      id: record.id,
      tenant: record.input.tenantId,
      startedAt: record.startedAt,
      stage: record.kind,
      signal: record,
    }))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

export const HorizonLabSignalTimeline = ({ workspace }: SignalTimelineProps) => {
  const rows = useMemo(() => toRows(workspace.state.signals), [workspace.state.signals]);

  return (
    <section className="horizon-timeline">
      <h3>Horizon Signal Timeline</h3>
      <ul>
        {rows.map((row) => {
          const label = labelStage(row.stage);
          const severity = row.signal.severity;
          return (
            <li key={row.id} className={`timeline-${severity}`}>
              <div>
                <strong>{row.id}</strong>
                <p>{label}</p>
              </div>
              <small>{row.tenant}</small>
              <time>{formatIso(row.startedAt)}</time>
              <span>{severity}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
