import { useMemo } from 'react';
import type { DeckItem } from '../../services/recoveryCockpitAutomationService';
import type { ReactElement } from 'react';

type DeckProps = {
  readonly deck: readonly DeckItem[];
  readonly onSelect?: (stepId: DeckItem['stepId']) => void;
};

const stageBadge = (stage: DeckItem['stage']): string =>
  stage.toUpperCase();

export const AutomationRunDeck = ({ deck, onSelect }: DeckProps): ReactElement => {
  const rows = useMemo(
    () =>
      deck.map((item) => ({
        ...item,
        badge: stageBadge(item.stage),
        id: String(item.stepId),
      })),
    [deck],
  );

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h3>Automation Deck</h3>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {rows.map((item) => (
          <li
            key={item.id}
            style={{
              border: '1px solid #223',
              borderRadius: 8,
              padding: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: onSelect ? 'pointer' : 'default',
            }}
            onClick={() => {
              onSelect?.(item.stepId);
            }}
          >
            <span>{item.id}</span>
            <span>{item.pluginId}</span>
            <span>{item.badge}</span>
            <span>{item.ready ? 'ready' : 'wait'}</span>
            <span>{item.owner}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
