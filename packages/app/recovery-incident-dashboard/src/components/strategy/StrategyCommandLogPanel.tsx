import { useMemo } from 'react';
import type { StrategyStoreEvent } from '@data/recovery-strategy-store';

interface StrategyCommandLogPanelProps {
  readonly events: readonly StrategyStoreEvent[];
  readonly planId?: string;
  readonly onFilter?: (planId: string) => void;
}

const eventLabel = (event: StrategyStoreEvent): string => {
  return `${event.type} ${event.planId} ${event.createdAt}`;
};

export const StrategyCommandLogPanel = ({ events, planId, onFilter }: StrategyCommandLogPanelProps) => {
  const visible = useMemo(() => {
    if (!planId) {
      return events;
    }
    return events.filter((event) => event.planId === planId);
  }, [events, planId]);

  return (
    <section>
      <h3>Command log</h3>
      <p>events={visible.length}</p>
      <div>
        {visible.map((event) => (
          <button
            key={`${event.planId}-${event.createdAt}`}
            type="button"
            onClick={() => onFilter?.(event.planId)}
          >
            {eventLabel(event)}
          </button>
        ))}
      </div>
    </section>
  );
};
