import { useMemo } from 'react';
import type { FusionBundle } from '@domain/recovery-fusion-intelligence';

interface CommandDeckProps {
  readonly bundle: FusionBundle;
  readonly onSelect: (waveId: string) => void;
}

export const FusionCommandDeck = ({ bundle, onSelect }: CommandDeckProps) => {
  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const wave of bundle.waves) {
      map.set(wave.id, wave.commands.length);
    }
    return [...map.entries()].map(([waveId, count]) => ({ waveId, count }));
  }, [bundle.waves]);

  const top = [...grouped].sort((a, b) => b.count - a.count).slice(0, 10);
  const totalCommands = top.reduce((sum, wave) => sum + wave.count, 0);

  return (
    <section>
      <h3>Fusion Command Deck</h3>
      <p>total commands: {totalCommands}</p>
      <ul>
        {top.map((entry) => (
          <li key={entry.waveId}>
            <button type="button" onClick={() => onSelect(entry.waveId)}>
              {entry.waveId} — {entry.count}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
