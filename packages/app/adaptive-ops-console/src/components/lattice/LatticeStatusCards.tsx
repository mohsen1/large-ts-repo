import { Fragment, type ReactElement } from 'react';
import type { LatticeBlueprintManifest } from '@domain/recovery-lattice';

type Card = {
  readonly blueprintId: string;
  readonly mode: 'analysis' | 'validation' | 'execution' | 'rehearsal';
  readonly steps: number;
};

type Props = {
  readonly items: readonly Card[];
  readonly onSelect: (blueprintId: string) => void;
  readonly selectedBlueprintId?: string;
};

const modeColor = (mode: Card['mode']): string => {
  switch (mode) {
    case 'analysis':
      return '#6ec5ff';
    case 'validation':
      return '#9d70ff';
    case 'execution':
      return '#ff9a6c';
    case 'rehearsal':
      return '#6cff9a';
    default:
      return '#b6b6b6';
  }
};

export const LatticeStatusCards = ({
  items,
  onSelect,
  selectedBlueprintId,
}: Props): ReactElement => {
  return (
    <section className="lattice-status-cards">
      <h3>Blueprints</h3>
      <div className="card-grid">
        {items.map((item) => {
          const active = selectedBlueprintId === item.blueprintId;
          return (
            <button
              key={item.blueprintId}
              type="button"
              className={`card ${active ? 'selected' : ''}`}
              style={{ borderColor: modeColor(item.mode) }}
              onClick={() => onSelect(item.blueprintId)}
            >
              <strong>{item.mode}</strong>
              <span>{item.steps} steps</span>
              <small>{item.blueprintId}</small>
            </button>
          );
        })}
        {items.length === 0 && (
          <Fragment>
            <em>No blueprint loaded</em>
          </Fragment>
        )}
      </div>
    </section>
  );
};
