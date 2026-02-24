import { useMemo } from 'react';
import type { PolicyDirective, QuantumOutput } from '../types';

interface QuantumCommandLedgerProps {
  readonly output: QuantumOutput;
  readonly showReasons?: boolean;
}

type LedgerGroup = {
  readonly command: PolicyDirective['command'];
  readonly items: readonly PolicyDirective[];
  readonly weight: number;
};

const ledgerWeight = (items: readonly PolicyDirective[]) =>
  items.reduce((acc, item) => acc + item.priority * (item.expiresAt ? 1.05 : 0.95), 0);

export const QuantumCommandLedger = ({ output, showReasons = false }: QuantumCommandLedgerProps) => {
  const groups = useMemo(() => {
    const grouped = new Map<PolicyDirective['command'], PolicyDirective[]>();
    for (const directive of output.directives) {
      const next = grouped.get(directive.command) ?? [];
      grouped.set(directive.command, [...next, directive]);
    }
    return [...grouped.entries()].map(([command, items]) => ({
      command,
      items,
      weight: ledgerWeight(items),
    })) as readonly LedgerGroup[];
  }, [output.directives]);

  const sorted = useMemo(
    () => [...groups].sort((left, right) => right.weight - left.weight),
    [groups],
  );

  return (
    <section>
      <h4>Command Ledger</h4>
      {sorted.map((group) => (
        <section key={group.command}>
          <h5>
            {group.command} · {group.items.length} · weight {group.weight.toFixed(1)}
          </h5>
          <ul>
            {group.items.map((directive, index) => (
              <li key={`${directive.id}-${index}`}>
                {directive.id} · {directive.priority}
                {showReasons && <span> · {directive.reason}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
};
