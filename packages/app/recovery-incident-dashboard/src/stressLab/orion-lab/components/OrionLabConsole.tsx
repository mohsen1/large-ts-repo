import { memo, useMemo } from 'react';
import { useOrionLabWorkspace } from '../hooks/useOrionLabWorkspace';
import type { OrionEntityId } from '../types';

interface OrionLabConsoleProps {
  workspace: ReturnType<typeof useOrionLabWorkspace>;
}

export const OrionLabConsole = memo(({ workspace }: OrionLabConsoleProps) => {
  const {
    state,
    actions,
  } = workspace;

  const total = useMemo(() => {
    const complete = state.metrics.succeeded;
    const failed = state.metrics.failed.length;
    const ratio = complete + failed === 0 ? 0 : (complete / (complete + failed)) * 100;
    return {
      complete,
      failed,
      ratio: Number.isFinite(ratio) ? ratio.toFixed(1) : '0.0',
      latency: state.metrics.latencyMs,
    };
  }, [state.metrics.succeeded, state.metrics.failed.length, state.metrics.latencyMs]);

  const sortedItems = useMemo(() => {
    return [...state.items]
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 12);
  }, [state.items]);

  const selectedAction = async () => {
    if (state.items[0]) {
      await actions.run(state.items[0].route);
    }
  };

  const selectedCancel = async () => {
    if (state.items[0]) {
      await actions.cancel(state.items[0].route);
    }
  };

  const selectedReplay = async () => {
    await actions.replay('orion-replay-latest' as OrionEntityId);
  };

  const clear = async () => {
    actions.clear();
  };

  return (
    <section className="orion-lab-console">
      <header>
        <h2>Orion Lab Console</h2>
        <p>
          State: <strong>{state.status}</strong>
        </p>
        <p>
          Workspace: <strong>{state.config.workspace}</strong>
        </p>
        <p>
          Completed: <strong>{total.complete}</strong> / Failed: <strong>{total.failed}</strong> / Ratio: <strong>{total.ratio}%</strong>
        </p>
      </header>
      <div>
        <button onClick={selectedAction} type="button">
          Run Head Item
        </button>
        <button onClick={selectedCancel} type="button">
          Cancel Head Item
        </button>
        <button onClick={selectedReplay} type="button">
          Replay Mission
        </button>
        <button onClick={clear} type="button">
          Clear
        </button>
        <button onClick={state.metrics.latencyMs ? actions.refresh : actions.refresh} type="button">
          Refresh
        </button>
      </div>
      <ul>
        {sortedItems.map((item) => {
          const isCritical = item.severity === 'critical' || item.severity === 'high';
          return (
            <li key={item.route} style={{ color: isCritical ? 'salmon' : undefined }}>
              <strong>{item.route}</strong>
              {' - '}
              {item.expectedState}
              {' / '}
              {item.startedAt}
            </li>
          );
        })}
      </ul>
      <div>
        {state.timeline.slice(0, 8).map((entry) => (
          <article key={`${entry.id}-${entry.emittedAt}`}>
            <p>
              {entry.stage} / {entry.emittedAt}
            </p>
            <p>{JSON.stringify(entry.envelope)}</p>
          </article>
        ))}
      </div>
      <div>
        <strong>Latency: {state.metrics.latencyMs}ms</strong>
      </div>
      <div>
        <strong>Config maxParallel: {state.config.maxParallel}</strong>
      </div>
    </section>
  );
});
