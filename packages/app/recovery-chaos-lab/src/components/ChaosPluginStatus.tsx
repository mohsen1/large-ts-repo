import { useMemo } from 'react';
import type { ChaosRunEvent } from '@service/recovery-chaos-orchestrator';

export interface ChaosPluginStatusProps {
  readonly pluginRows: readonly {
    readonly plugin: string;
    readonly status: 'active' | 'idle' | 'failed';
    readonly health: number;
    readonly lastSeen: string;
  }[];
  readonly events: readonly ChaosRunEvent[];
  readonly onRefresh: () => void;
}

export function ChaosPluginStatus({ pluginRows, events, onRefresh }: ChaosPluginStatusProps) {
  const aggregates = useMemo(() => {
    const grouped = pluginRows.reduce<Record<string, number>>(
      (acc, row) => {
        const bucket = acc[row.status] ?? 0;
        acc[row.status] = bucket + 1;
        return acc;
      },
      { active: 0, idle: 0, failed: 0 }
    );
    const latest = events.at(-1);
    return {
      grouped,
      latestKind: latest?.kind ?? 'run-started',
      failureCount: events.filter((event) => event.kind === 'run-failed' || event.kind === 'stage-failed').length
    };
  }, [pluginRows, events]);

  return (
    <section className="chaos-plugin-status">
      <header>
        <h3>Plugins</h3>
        <button type="button" onClick={onRefresh}>
          refresh
        </button>
      </header>
      <ul>
        {pluginRows.map((row) => (
          <li key={row.plugin}>
            <strong>{row.plugin}</strong>
            <span>{row.status}</span>
            <small>health {row.health}%</small>
            <i>{row.lastSeen}</i>
          </li>
        ))}
      </ul>
      <aside>
        <p>active {aggregates.grouped.active}</p>
        <p>idle {aggregates.grouped.idle}</p>
        <p>failed {aggregates.grouped.failed}</p>
        <p>failures {aggregates.failureCount}</p>
        <p>latest {aggregates.latestKind}</p>
      </aside>
    </section>
  );
}
