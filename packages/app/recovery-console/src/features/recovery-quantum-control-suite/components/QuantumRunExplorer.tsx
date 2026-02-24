import { Fragment, useMemo } from 'react';
import type { QuantumOutput, QuantumCommand } from '../types';

interface QuantumRunExplorerProps {
  readonly output: QuantumOutput;
}

const commandPalette: Record<QuantumCommand, string> = {
  throttle: '🛑',
  reroute: '↔',
  synchronize: '⇄',
  freeze: '❄',
};

export const QuantumRunExplorer = ({ output }: QuantumRunExplorerProps) => {
  const commandPath = useMemo(() => {
    const commands = output.directives.map((entry) => entry.command);
    const unique = [...new Set(commands)] as QuantumCommand[];
    return unique.map((command) => `${commandPalette[command]} ${command}`).join(' · ');
  }, [output.directives]);

  const dependencyGraph = useMemo(() => {
    const rows = output.directives
      .map((directive, index) => ({
        ...directive,
        inbound: directive.dependencies.length,
        index,
      }))
      .sort((left, right) => right.inbound - left.inbound);
    return rows;
  }, [output.directives]);

  return (
    <section>
      <h4>Run Explorer</h4>
      <p>{commandPath || 'No commands emitted'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.5fr 4fr', gap: 8 }}>
        <strong>Directive</strong>
        <strong>Deps</strong>
        <strong>Reason</strong>
        {dependencyGraph.map((entry) => (
          <Fragment key={entry.id}>
            <div>{entry.id}</div>
            <div>{entry.inbound}</div>
            <div>{entry.reason}</div>
          </Fragment>
        ))}
      </div>
    </section>
  );
};
