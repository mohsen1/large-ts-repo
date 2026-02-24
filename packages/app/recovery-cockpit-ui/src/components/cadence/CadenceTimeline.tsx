import { FC, useMemo } from 'react';
import type { CadenceRunPlan, CadenceSlot, CadenceWindow } from '@domain/recovery-operations-cadence';

export type CadenceTimelineProps = {
  plan: CadenceRunPlan | null;
  onSlotSelect: (slotId: string) => void;
};

type SlotCell = {
  readonly slot: CadenceSlot;
  readonly window: CadenceWindow;
  readonly index: number;
  readonly density: number;
};

const toMinutes = (value: string): number => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 0;
  return parsed / 60_000;
};

const buildCells = (plan: CadenceRunPlan): SlotCell[] => {
  const map = new Map<string, CadenceWindow>();
  for (const window of plan.windows) {
    map.set(String(window.id), window);
  }

  const cells: SlotCell[] = [];
  for (const slot of plan.slots) {
    const window = map.get(String(slot.windowId));
    if (!window) continue;

    const density = (slot.weight * Math.max(1, slot.tags.length)) / Math.max(1, slot.estimatedMinutes / 15);
    const index = plan.windows.findIndex((entry) => String(entry.id) === String(window.id));
    cells.push({ slot, window, index, density });
  }

  return cells.sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    return toMinutes(left.window.startsAt) - toMinutes(right.window.startsAt);
  });
};

const windowClass = (slot: SlotCell) => {
  if (slot.density > 1.2) return '#dc2626';
  if (slot.density > 0.8) return '#d97706';
  if (slot.density > 0.5) return '#0ea5e9';
  return '#16a34a';
};

export const CadenceTimeline: FC<CadenceTimelineProps> = ({ plan, onSlotSelect }) => {
  const cells = useMemo(() => {
    if (!plan) return [] as SlotCell[];
    return buildCells(plan);
  }, [plan]);

  if (!plan) {
    return (
      <section style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
        <h2>Cadence timeline</h2>
        <p>No plan selected</p>
      </section>
    );
  }

  return (
    <section style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
      <h2>Cadence timeline</h2>
      <p>Run: {plan.runId}</p>
      <p>Windows: {plan.windows.length}</p>
      <p>Slots: {cells.length}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {cells.map((cell) => {
          const windowSpanMinutes = (toMinutes(cell.window.endsAt) - toMinutes(cell.window.startsAt)) / 60;
          return (
            <article
              key={`${cell.slot.id}-${cell.index}`}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 8,
                borderLeft: `6px solid ${windowClass(cell)}`,
              }}
            >
              <h3>
                {cell.window.title} ({cell.index + 1})
              </h3>
              <p>{String(cell.slot.id)}</p>
              <p>step={cell.slot.stepId}</p>
              <p>
                {cell.slot.plannedFor} · est={cell.slot.estimatedMinutes}m · density={cell.density.toFixed(2)}
              </p>
              <p>window span hours: {windowSpanMinutes.toFixed(2)}</p>
              <p>requires: {cell.slot.requires.map((id) => String(id)).join(', ') || 'none'}</p>
              <p>tags: {cell.slot.tags.join(', ') || 'none'}</p>
              <button type="button" onClick={() => onSlotSelect(String(cell.slot.id))}>
                Inspect slot
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
};
