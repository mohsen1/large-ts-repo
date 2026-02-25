import { type FC } from 'react';
import type { GraphOrchestrationEvent } from '../../services/recoveryCockpitGraphService';

export interface GraphReplayConsoleProps {
  readonly events: readonly GraphOrchestrationEvent[];
  readonly title: string;
}

export const GraphReplayConsole: FC<GraphReplayConsoleProps> = ({ events, title }) => {
  return (
    <section>
      <h2>{title}</h2>
      <pre style={{
        background: '#101820',
        border: '1px solid #223',
        borderRadius: 8,
        padding: 12,
        maxHeight: 240,
        overflow: 'auto',
      }}>
        {events.map((event, index) => (
          <div key={`${event.at}-${index}`}>
            [{event.kind}] {event.at}: {event.detail}
          </div>
        ))}
      </pre>
    </section>
  );
};
