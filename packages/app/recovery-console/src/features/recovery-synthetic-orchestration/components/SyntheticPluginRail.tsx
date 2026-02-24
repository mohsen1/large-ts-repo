import { useMemo } from 'react';
import type { SyntheticRunRecord } from '@data/recovery-synthetic-orchestration-store';

export interface PluginRailProps {
  readonly runs: readonly SyntheticRunRecord[];
}

interface RunPlugin {
  readonly pluginId: string;
  readonly phase: string;
  readonly count: number;
}

export const SyntheticPluginRail = ({ runs }: PluginRailProps) => {
  const rails = useMemo<readonly RunPlugin[]>(() => {
    const map = new Map<string, number>();
    for (const run of runs) {
      for (const phase of run.phases) {
        const key = `phase:${phase}`;
        const prev = map.get(key) ?? 0;
        map.set(key, prev + 1);
      }
    }
    return [...map.entries()].map(([id, count]) => ({
      pluginId: id,
      phase: id.split(':')[1] ?? 'unknown',
      count,
    }));
  }, [runs]);

  return (
    <aside className="synthetic-plugin-rail">
      <h4>Plugin phase rail</h4>
      <ol>
        {rails.map((rail) => (
          <li key={rail.pluginId}>
            <strong>{rail.phase}</strong>
            <span>{` · `}</span>
            <code>{rail.count}</code>
          </li>
        ))}
      </ol>
    </aside>
  );
};
