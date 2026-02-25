import { type ReactElement, useMemo } from 'react';
import {
  asChronicleGraphRoute,
  type ChronicleGraphStatus,
} from '@domain/recovery-chronicle-graph-core';
import { type GraphWorkspaceResult } from '@service/recovery-chronicle-graph-orchestrator';
import type { TimelinePoint } from '../../types';

export interface ChronicleGraphTimelinePanelProps {
  readonly status: ChronicleGraphStatus;
  readonly runResult?: GraphWorkspaceResult;
  readonly onSelect?: (index: number, value: TimelinePoint) => void;
}

const statusColor = (status: ChronicleGraphStatus): string => {
  if (status === 'completed') return 'green';
  if (status === 'running') return 'blue';
  if (status === 'failed') return 'red';
  return 'gray';
};

const normalizeStatus = (status: ChronicleGraphStatus): TimelinePoint['status'] =>
  status === 'completed' ? 'succeeded' : status === 'running' ? 'running' : 'failed';

const mapObservation = (runResult?: GraphWorkspaceResult): readonly TimelinePoint[] => {
  if (!runResult) {
    return [{
      label: asChronicleGraphRoute('timeline').replace('chronicle-graph://', ''),
      status: 'queued',
      score: 0,
    }];
  }

  return runResult.events.map((event, index) => {
    const payloadScore =
      typeof event.payload === 'object' && event.payload !== null && 'score' in event.payload
        ? Number((event.payload as { score?: number }).score ?? 0)
        : index;
    return {
      label: `${event.phase}`,
      status: normalizeStatus(runResult.workspace.status),
      score: payloadScore,
    };
  });
};

export const ChronicleGraphTimelinePanel = ({
  status,
  runResult,
  onSelect,
}: ChronicleGraphTimelinePanelProps): ReactElement => {
  const route = asChronicleGraphRoute('studio');
  const points: readonly TimelinePoint[] = useMemo(() => mapObservation(runResult), [runResult]);

  return (
    <section>
      <header>
        <h3>Timeline</h3>
        <p>
          route: {route} - status: {status}
        </p>
      </header>
      <ol>
        {points.map((point, index) => (
          <li key={`${point.label}-${index}`}>
            <button
              type="button"
              onClick={() => {
                onSelect?.(index, point);
              }}
            >
              {index}: {point.label} score={point.score} trend={point.status}
            </button>
          </li>
        ))}
      </ol>
      <span style={{ color: statusColor(status) }}>Status dot</span>
    </section>
  );
};
