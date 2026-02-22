import { useMemo } from 'react';
import type { ContinuityWorkspace } from '@domain/continuity-lens';

interface ContinuityLensDependencyStripProps {
  readonly workspace?: ContinuityWorkspace;
}

interface DependencyCell {
  readonly id: string;
  readonly service: string;
  readonly severity: number;
}

export const ContinuityLensDependencyStrip = ({ workspace }: ContinuityLensDependencyStripProps) => {
  const rows = useMemo<DependencyCell[]>(() => {
    const counts = new Map<string, number>();
    if (!workspace) return [];

    for (const signal of workspace.snapshot.signals) {
      counts.set(signal.service as string, (counts.get(signal.service as string) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([service, count]) => ({
        id: `${workspace.tenantId}:${service}`,
        service,
        severity: Math.min(100, count * 20),
      }))
      .sort((a, b) => b.severity - a.severity);
  }, [workspace]);

  return (
    <section>
      <h3>Dependency strip</h3>
      {rows.length === 0 ? (
        <p>No dependency signals</p>
      ) : (
        rows.map((row) => (
          <article key={row.id}>
            <p>{row.service}</p>
            <progress value={row.severity} max={100} />
            <small>{row.severity}%</small>
          </article>
        ))
      )}
    </section>
  );
};
