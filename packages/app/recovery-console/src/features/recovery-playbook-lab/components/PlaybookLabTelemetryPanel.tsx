import { useMemo } from 'react';
import type { PlaybookTelemetryRow } from '../types';

interface PlaybookLabTelemetryPanelProps {
  readonly rows: readonly PlaybookTelemetryRow[];
  readonly onSelectRun: (runId: string) => void;
}

const formatMs = (value: number): string => `${value}ms`;
const formatTime = (value: string): string => new Date(value).toLocaleString();

const hasFailures = (row: PlaybookTelemetryRow): boolean => row.failures > 0;

export const PlaybookLabTelemetryPanel = ({ rows, onSelectRun }: PlaybookLabTelemetryPanelProps) => {
  const sorted = useMemo(
    () => [...rows].sort((left, right) => (right.startedAt > left.startedAt ? 1 : -1)),
    [rows],
  );
  return (
    <section className="playbook-lab-telemetry">
      <h4>Recent telemetry</h4>
      <ul>
        {sorted.map((row) => (
          <li
            key={row.runId}
            className={hasFailures(row) ? 'telemetry-row fail' : 'telemetry-row'}
          >
            <button type="button" onClick={() => {
              onSelectRun(row.runId);
            }}>
              {row.runId}
            </button>
            <span>{row.status}</span>
            <span>{formatTime(row.startedAt)}</span>
            <span>selected: {row.selected}</span>
            <span>failures: {row.failures}</span>
            <span>latency: {formatMs(row.failures + 1)}</span>
            <span>playbook: {row.playbookId}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
