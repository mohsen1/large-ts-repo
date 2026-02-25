import { useMemo } from 'react';
import { CommandId, type ScenarioCommand, type ScenarioBlueprint } from '@domain/recovery-scenario-lens';

interface MatrixCell {
  readonly id: string;
  readonly command: ScenarioCommand;
  readonly row: number;
  readonly col: number;
  readonly active: boolean;
}

export interface QuantumSynthesisCommandCanvasProps {
  readonly blueprint: ScenarioBlueprint;
  readonly selectedCommand: string;
  readonly onSelect: (id: string) => void;
}

const rowSpacing = 120;
const colSpacing = 190;

const asCommandId = (value: string): CommandId => value as CommandId;

const buildMatrix = (commands: readonly ScenarioCommand[]): readonly MatrixCell[] => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(commands.length)));
  return commands.map((command, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return {
      id: command.commandId,
      command,
      row,
      col,
      active: index === 0,
    };
  });
};

export const QuantumSynthesisCommandCanvas = ({
  blueprint,
  selectedCommand,
  onSelect,
}: QuantumSynthesisCommandCanvasProps) => {
  const cells = useMemo(
    () =>
      buildMatrix(blueprint.commands).map((cell) => ({
        ...cell,
        active: selectedCommand === cell.id,
      })),
    [blueprint.commands, selectedCommand],
  );

  const selectedCommandName = blueprint.commands.find((command) => command.commandId === asCommandId(selectedCommand))?.commandName;

  return (
    <section style={{ border: '1px solid #d0d0d0', borderRadius: 12, padding: 12 }}>
      <h3>Command Matrix</h3>
      <p style={{ marginTop: 0, opacity: 0.75 }}>
        Select a command to inspect blast radius and dependencies.
      </p>
      <div style={{ position: 'relative', minHeight: rowSpacing * 3, minWidth: colSpacing * 4 }}>
        {cells.map((cell) => {
          const left = cell.col * colSpacing;
          const top = cell.row * rowSpacing;
          return (
            <button
              key={cell.id}
              type="button"
              onClick={() => onSelect(cell.id)}
              style={{
                position: 'absolute',
                left,
                top,
                width: 150,
                borderRadius: 10,
                border: cell.active ? '2px solid #2b9' : '1px solid #aaa',
                padding: 10,
                background: cell.active ? '#f0fffa' : '#fff',
                textAlign: 'left',
              }}
            >
              <strong style={{ display: 'block' }}>{cell.command.commandName}</strong>
              <span style={{ fontSize: 12, opacity: 0.8 }}>service: {cell.command.targetService}</span>
              <div style={{ marginTop: 6, fontSize: 11 }}>
                duration: {Number(cell.command.estimatedDurationMs)}ms
              </div>
            </button>
          );
        })}
      </div>
      <p style={{ marginBottom: 0, marginTop: rowSpacing * 0.4 }}>
        selected: <strong>{selectedCommandName ?? 'none'}</strong>
      </p>
    </section>
  );
};

