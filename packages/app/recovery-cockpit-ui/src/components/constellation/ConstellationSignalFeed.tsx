import { FC, useMemo } from 'react';
import type { OrchestratorRuntime } from '@service/recovery-cockpit-constellation-orchestrator';

const severityClass = (kind: string): string => {
  if (kind === 'risk') return '#f43f5e';
  if (kind === 'metric') return '#0ea5e9';
  if (kind === 'policy') return '#8b5cf6';
  return '#14b8a6';
};

type SignalEvent = {
  readonly id: string;
  readonly kind: string;
  readonly message: string;
};

export const ConstellationSignalFeed: FC<{ runtime?: OrchestratorRuntime | null }> = ({ runtime }) => {
  const feed = useMemo(() => {
    const points = runtime?.telemetry.points ?? [];
    const dedupe = new Map<string, SignalEvent>();
    for (const point of points) {
      const key = `${point.kind}:${point.message}`;
      if (!dedupe.has(key)) {
        dedupe.set(key, { id: key, kind: point.kind, message: point.message });
      }
    }
    return Array.from(dedupe.values()).slice(0, 20);
  }, [runtime?.telemetry.points]);

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 12, padding: 12 }}>
      <h3>Signal feed</h3>
      <ul style={{ maxHeight: 220, overflowY: 'auto', paddingLeft: 16 }}>
        {feed.length ? (
          feed.map((entry) => (
            <li
              key={entry.id}
              style={{
                borderLeft: `3px solid ${severityClass(entry.kind)}`,
                paddingLeft: 8,
                marginBottom: 4,
              }}
            >
              {entry.kind}: {entry.message}
            </li>
          ))
        ) : (
          <li>No live signals.</li>
        )}
      </ul>
    </section>
  );
};
