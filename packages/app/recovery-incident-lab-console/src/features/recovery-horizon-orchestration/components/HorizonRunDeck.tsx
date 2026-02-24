import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { MeshExecution } from '@service/recovery-horizon-orchestrator/horizon-mesh.js';
import type { WindowTrend } from '../types';

const defaultTrend: readonly WindowTrend[] = [
  { stage: 'ingest', count: 0, ratio: 0, severity: 'low' },
  { stage: 'analyze', count: 0, ratio: 0, severity: 'low' },
  { stage: 'resolve', count: 0, ratio: 0, severity: 'low' },
  { stage: 'optimize', count: 0, ratio: 0, severity: 'low' },
  { stage: 'execute', count: 0, ratio: 0, severity: 'low' },
] as const;

interface HorizonRunDeckProps {
  readonly runHistory: readonly MeshExecution[];
  readonly trend?: readonly WindowTrend[];
  readonly onReload: () => Promise<void>;
}

const classForSeverity = (severity: WindowTrend['severity']): string => {
  switch (severity) {
    case 'high':
      return 'severity-high';
    case 'medium':
      return 'severity-medium';
    default:
      return 'severity-low';
  }
};

const formatDuration = (from: number, to: number): string => `${Math.max(0, to - from)}ms`;

const renderTrend = (trend: readonly WindowTrend[]): ReactElement => (
  <ul className="trend-chart">
    {trend.map((entry) => (
      <li key={entry.stage} className={classForSeverity(entry.severity)}>
        <strong>{entry.stage}</strong>
        <span>{entry.count}</span>
        <span>{Math.round(entry.ratio * 100)}%</span>
      </li>
    ))}
  </ul>
);

const renderSteps = (steps: MeshExecution['steps']): ReactElement[] => {
  if (steps.length === 0) {
    return [<li key="noop">No execution steps</li>];
  }

  return steps.map((step) => (
    <li key={`${step.stage}-${step.bindingCount}-${step.emitted}`}>
      <div>
        Stage {step.stage} 
      </div>
      <div>bindings: {step.bindingCount}</div>
      <div>emitted: {step.emitted}</div>
      <div>time: {step.elapsedMs}ms</div>
    </li>
  ));
};

export const HorizonRunDeck = ({ runHistory, trend = defaultTrend, onReload }: HorizonRunDeckProps): ReactElement => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const execution = runHistory[selectedIndex] ?? {
    tenantId: 'tenant-001',
    mode: 'single',
    runId: 'none',
    steps: [],
    startedAt: 0 as any,
    finishedAt: 0 as any,
    events: [],
  };

  const stats = useMemo(() => {
    const count = runHistory.length;
    const emitted = runHistory.reduce((total, current) => total + current.steps.reduce((acc, step) => acc + step.emitted, 0), 0);
    const elapsed = runHistory.reduce((total, current) => total + Number(current.finishedAt - current.startedAt), 0);

    return {
      count,
      emitted,
      elapsed,
      window: runHistory[selectedIndex]?.events.length ?? 0,
      mode: runHistory[selectedIndex]?.mode,
    };
  }, [runHistory, selectedIndex]);

  useEffect(() => {
    if (selectedIndex >= runHistory.length) {
      setSelectedIndex(Math.max(0, runHistory.length - 1));
    }
  }, [runHistory, selectedIndex]);

  return (
    <section className="horizon-run-deck">
      <header>
        <h2>Horizon Run Deck</h2>
        <p>Runs: {stats.count} · Emitted: {stats.emitted} · Elapsed: {stats.elapsed}ms · Window: {stats.window} · Mode: {stats.mode}</p>
        <button onClick={() => { void onReload(); }} type="button">
          Reload data
        </button>
      </header>
      <div className="run-select">
        {runHistory.map((entry, index) => (
          <button
            key={entry.runId}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className={index === selectedIndex ? 'selected' : 'unselected'}
          >
            {entry.mode}:{index}
          </button>
        ))}
      </div>
      <article>
        <h3>Execution Trace</h3>
        <ul>{renderSteps(execution.steps)}</ul>
      </article>
      <article>
        <h3>Stage Trend</h3>
        {renderTrend(trend)}
      </article>
      <article>
        <h3>Timeline</h3>
        <div>
          Duration {formatDuration(execution.startedAt, execution.finishedAt)}
        </div>
        <ul>
          {execution.events.slice(0, 20).map((entry) => (
            <li key={`${entry}-${Date.now()}-${Math.random()}`}>{entry}</li>
          ))}
        </ul>
      </article>
    </section>
  );
};
