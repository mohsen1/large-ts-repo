import { type FC } from 'react';
import { useCockpitGraphReplay } from '../../hooks/useCockpitGraphReplay';
import type { GraphOrchestrationEvent } from '../../services/recoveryCockpitGraphService';

export interface GraphOrchestrationBoardProps {
  readonly events: readonly GraphOrchestrationEvent[];
  readonly topologyNodes: readonly string[];
  readonly onDrill: (nodeId: string) => void;
}

export const GraphOrchestrationBoard: FC<GraphOrchestrationBoardProps> = ({
  events,
  topologyNodes,
  onDrill,
}) => {
  const replay = useCockpitGraphReplay(events);

  return (
    <section>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <h2>Topology</h2>
          <ul>
            {topologyNodes.map((node) => (
              <li key={node}>
                <button type="button" onClick={() => onDrill(node)}>
                  {node}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={() => replay.step(-1)} disabled={replay.cursor <= 0}>
              Back
            </button>
            <button type="button" onClick={() => replay.step(1)} disabled={replay.complete} style={{ marginLeft: 8 }}>
              Next
            </button>
          </div>
        </div>
        <div>
          <h2>Replay preview</h2>
          {replay.visibleEvents.map((event, index) => (
            <p key={`${event.at}-${index}`}>
              [{event.kind}] {event.detail}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
};
