import { useMemo } from 'react';
import type { ScenarioBlueprint } from '@domain/recovery-scenario-lens';

export interface QuantumSynthesisTopologyPanelProps {
  readonly blueprint: ScenarioBlueprint;
  readonly selected: string;
  readonly onSelect: (commandId: string) => void;
}

export const QuantumSynthesisTopologyPanel = ({
  blueprint,
  selected,
  onSelect,
}: QuantumSynthesisTopologyPanelProps) => {
  const entries = useMemo(
    () =>
      blueprint.commands.map((command) => ({
        id: command.commandId,
        name: command.commandName,
        target: command.targetService,
        prerequisites: command.prerequisites.length,
        blast: command.blastRadius,
        active: selected === command.commandId,
      })),
    [blueprint.commands, selected],
  );

  return (
    <section style={{ border: '1px solid #d0d0d0', borderRadius: 12, padding: 12 }}>
      <h3>Command Topology</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              style={{
                width: '100%',
                border: `1px solid ${entry.active ? '#2b7' : '#bbb'}`,
                borderRadius: 8,
                padding: 12,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{entry.name}</strong>
                <span style={{ opacity: 0.75 }}>{entry.blast}</span>
              </div>
              <div style={{ opacity: 0.65 }}>
                service: {entry.target} · prereqs: {entry.prerequisites}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
