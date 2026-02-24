import { useMemo } from 'react';
import type { HorizonWorkspace } from '../types';

const severityScale: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const asClass = (value: string) => `severity-${value}`;

const summarize = (value: number) =>
  value > 100
    ? 'critical'
    : value > 60
      ? 'high'
      : value > 30
        ? 'medium'
        : 'low';

export const HorizonLabStrategyBoard = ({ workspace }: { workspace: HorizonWorkspace }) => {
  const { state, report, stats } = workspace;

  const rows = useMemo(() => {
    const rows = state.plans.map((plan) => {
      const age = plan.startedAt ? Number(plan.startedAt) : 0;
      const score = age % 97;
      const severity = summarize(score);
      return {
        id: plan.id,
        stage: plan.pluginSpan.stage,
        age,
        score,
        severity,
      };
    });
    return rows.sort((left, right) => right.score - left.score);
  }, [state.plans]);

  return (
    <section className="horizon-strategy-board">
      <h3>Horizon Strategy Board</h3>

      <article>
        <h4>Aggregate Stats</h4>
        <ul>
          <li>Total plans: {state.plans.length}</li>
          <li>Active plans: {state.plans.filter((plan) => Number(plan.startedAt) > 0).length}</li>
          <li>Signals: {state.signals.length}</li>
          <li>Mutations: {state.events.length}</li>
          <li>Report stages: {report?.stages.length ?? 0}</li>
        </ul>
      </article>

      {stats ? (
        <article>
          <h4>Stage Mix</h4>
          <ul>
            <li>ingest: {stats.stageMix?.ingest ?? 0}</li>
            <li>analyze: {stats.stageMix?.analyze ?? 0}</li>
            <li>resolve: {stats.stageMix?.resolve ?? 0}</li>
            <li>optimize: {stats.stageMix?.optimize ?? 0}</li>
            <li>execute: {stats.stageMix?.execute ?? 0}</li>
          </ul>
        </article>
      ) : null}

      <div className="strategy-grid">
        {rows.map((row) => (
          <article key={row.id} className={asClass(row.severity)}>
            <header>
              <h5>{row.id}</h5>
              <span>{row.stage}</span>
            </header>
            <p>{`age ${(row.age / 1000).toFixed(1)}s`}</p>
            <progress max={100} value={row.score} />
            <span>{row.severity}</span>
          </article>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Stage</th>
            <th>Severity</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const factor = severityScale[row.severity] + row.score / 100;
            return (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.stage}</td>
                <td>{row.severity}</td>
                <td>{factor.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
