import { type ReactNode, useMemo } from 'react';
import type { StudioRunRecord } from '../services/convergenceStudioService';

type RunTone = 'critical' | 'warn' | 'ok';

interface Props {
  readonly runs: readonly StudioRunRecord[];
}

const toneForRun = (run: StudioRunRecord): RunTone => {
  if (run.constraintCount > 12 || run.score < 0.35) return 'critical';
  if (run.score < 0.6 || run.constraintCount > 6) return 'warn';
  return 'ok';
};

const RunItem = ({ run, tone }: { readonly run: StudioRunRecord; readonly tone: RunTone }) => {
  return (
    <li className={`runbook-item runbook-item--${tone}`}>
      <strong>{run.runId}</strong>
      <span>{run.scope}</span>
      <span>{run.stage}</span>
      <span>{run.score.toFixed(3)}</span>
      <span>{run.confidence.toFixed(3)}</span>
      <span>{run.selectedRunbookCount}</span>
      <span>{run.constraintCount}</span>
    </li>
  );
};

export const RecoveryConvergenceStudioRunbookPanel = ({ runs }: Props) => {
  const ordered = useMemo(() => [...runs].toSorted((left, right) => right.score - left.score), [runs]);

  const groups = useMemo(() => {
    const out = new Map<string, ReactNode[]>([
      ['ok', []],
      ['warn', []],
      ['critical', []],
    ]);

    for (const run of ordered) {
      const tone = toneForRun(run);
      const bucket = out.get(tone);
      if (!bucket) {
        continue;
      }
      bucket.push(
        <RunItem
          key={run.runId}
          run={run}
          tone={tone}
        />,
      );
    }

    return [
      { name: 'Critical', tone: 'critical' as const, items: out.get('critical') ?? [] },
      { name: 'Warnings', tone: 'warn' as const, items: out.get('warn') ?? [] },
      { name: 'Healthy', tone: 'ok' as const, items: out.get('ok') ?? [] },
    ];
  }, [ordered]);

  return (
    <section className="convergence-runbooks">
      <h3>Runbooks</h3>
      {groups.map((group) => (
        <article key={group.tone} className={`runbook-group runbook-group--${group.tone}`}>
          <h4>{group.name}</h4>
          <ul>{group.items}</ul>
        </article>
      ))}
    </section>
  );
};
