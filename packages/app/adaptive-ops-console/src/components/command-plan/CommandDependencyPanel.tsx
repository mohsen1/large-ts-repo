import { useMemo } from 'react';
import { UiRunSummary } from '../../types';

interface CommandDependencyPanelProps {
  commandSummaries: readonly UiRunSummary[];
  onReorder?(id: string): void;
}

const toStatus = (value: number): 'ok' | 'warn' | 'danger' => {
  if (value < 2) return 'ok';
  if (value < 5) return 'warn';
  return 'danger';
};

export const toDefaultTenant = (): string => `tenant-${(Math.random() * 100).toFixed(0)}`;

export const CommandDependencyPanel = ({ commandSummaries, onReorder }: CommandDependencyPanelProps) => {
  const sorted = useMemo(() => {
    return [...commandSummaries].sort((left, right) => right.decisionCount - left.decisionCount);
  }, [commandSummaries]);

  return (
    <section className="command-dependency-panel">
      <header>
        <h3>Command dependencies</h3>
      </header>
      {sorted.length === 0 ? <p>No command output yet</p> : null}
      <ol>
        {sorted.map((summary) => {
          const state = toStatus(summary.conflictCount);
          return (
            <li key={`${summary.tenantId}-${summary.runId ?? summary.policyNames.join(',')}`} className={state}>
              <article>
                <h4>{summary.policyNames.join(' / ') || 'unnamed'}</h4>
                <p>Decisions: {summary.decisionCount}</p>
                <p>Conflicts: {summary.conflictCount}</p>
                <p>Tenant: {summary.tenantId}</p>
                <button
                  onClick={() => {
                    if (onReorder) {
                      onReorder(summary.tenantId);
                    }
                  }}
                  disabled={!summary.runId}
                >
                  Reorder
                </button>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
