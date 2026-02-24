import { useMemo } from 'react';
import type { PolicyDirective, QuantumOutput } from '../types';

interface QuantumPolicyMatrixProps {
  readonly output: QuantumOutput;
  readonly compact?: boolean;
}

const cellClass = (weight: number) => {
  if (weight >= 80) {
    return 'critical';
  }
  if (weight >= 40) {
    return 'high';
  }
  if (weight >= 20) {
    return 'medium';
  }
  return 'low';
};

const sortPolicyRows = (directives: readonly PolicyDirective[], compact?: boolean) =>
  directives
    .map((entry, index) => ({
      ...entry,
      weight: (101 - Math.min(100, (index + 1) * 11)) / 1.25,
      index,
    }))
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => ({ ...entry, displayReason: compact && entry.reason.length > 30 ? `${entry.reason.slice(0, 30)}…` : entry.reason }));

export const QuantumPolicyMatrix = ({ output, compact = false }: QuantumPolicyMatrixProps) => {
  const rows = useMemo(() => sortPolicyRows(output.directives, compact), [output.directives, compact]);

  const commandBreakdown = useMemo(() => {
    const groups: Record<PolicyDirective['command'], PolicyDirective[]> = {
      throttle: [],
      reroute: [],
      synchronize: [],
      freeze: [],
    };
    for (const directive of output.directives) {
      groups[directive.command].push(directive);
    }
    return groups;
  }, [output.directives]);

  const total = output.directives.reduce((acc, entry) => acc + entry.priority, 0);

  return (
    <section>
      <h3>Policy Matrix</h3>
      <p>Priority total: {total}</p>
      <div style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
        {Object.entries(commandBreakdown).map(([command, group]) => (
          <div key={command}>
            {command}: {group.length}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 3fr 1fr', gap: 8 }}>
        <div>Command</div>
        <div>Priority</div>
        <div>Reason</div>
        <div>Dependencies</div>
        {rows.map((entry) => {
          const rowClass = cellClass(entry.weight);
          return (
            <div key={entry.id} className={rowClass}>
              <div>{entry.command}</div>
              <div>{entry.priority}</div>
              <div>{entry.displayReason}</div>
              <div>{entry.dependencies.length}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
