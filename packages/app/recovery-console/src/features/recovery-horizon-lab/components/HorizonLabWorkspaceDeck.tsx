import { memo, useMemo } from 'react';
import type { UseHorizonLabWorkspaceReturn } from '../hooks/useHorizonLabWorkspace';
import { useHorizonLabTimeline } from '../hooks/useHorizonLabTimeline';

interface HorizonLabWorkspaceDeckProps {
  readonly workspace: UseHorizonLabWorkspaceReturn;
}

const StagePill = ({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? '2px solid #5aa9ff' : '1px solid #cfd6df',
        borderRadius: 12,
        padding: '8px 14px',
        margin: 4,
        color: active ? '#0e2a47' : '#233243',
        background: active ? '#e6f0ff' : '#ffffff',
      }}
    >
      {label}
    </button>
  );
};

const SummaryList = ({
  values,
}: {
  readonly values: readonly string[];
}) => {
  return (
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {values.map((value, index) => (
        <li key={`${value}-${index}`}>{value}</li>
      ))}
    </ul>
  );
};

export const HorizonLabWorkspaceDeck = memo(({ workspace }: HorizonLabWorkspaceDeckProps) => {
  const { state, actions } = workspace;
  const timeline = useHorizonLabTimeline(state.summary);

  const stageList = useMemo(
    () =>
      state.summary?.timeline
        .map((entry) => entry.stage)
        .map((stage, index) => {
          const active = state.summary?.timeline[index]?.stage === stage;
          return (
            <StagePill
              key={`${stage}-${index}`}
              label={`${index + 1}. ${stage}`}
              active={Boolean(active)}
              onClick={() => {
                void actions.start();
              }}
            />
          );
        }),
    [state.summary?.timeline, actions],
  );

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16 }}>
      <header>
        <h2>
          Horizon Lab Workspace {state.id} ({state.scenarioId})
        </h2>
        <p>
          Stage {state.stage} • Route {state.summary?.state.route ?? 'pending'} • Run {state.runId ?? 'not started'}
        </p>
      </header>

      <section>
        <div style={{ marginBottom: 12 }}>
          <button type="button" onClick={actions.start} style={{ marginRight: 8 }}>
            Start
          </button>
          <button type="button" onClick={actions.stop} style={{ marginRight: 8 }}>
            Stop
          </button>
          <button type="button" onClick={actions.toggleAuto} style={{ marginRight: 8 }}>
            Toggle Auto
          </button>
          <button type="button" onClick={actions.reset}>
            Reset
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>{stageList}</div>
      </section>

      <section>
        <h3>Bucketized durations</h3>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Stage</th>
              <th style={{ textAlign: 'left' }}>Duration total</th>
              <th style={{ textAlign: 'left' }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {timeline.buckets.map((bucket) => (
              <tr key={bucket.name}>
                <td>{bucket.name}</td>
                <td>{bucket.value}</td>
                <td>{bucket.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Timeline trace</h3>
        <SummaryList values={timeline.segments.map((segment) => `${segment.path} / ${segment.output}`)} />
        <p>Total wall time: {timeline.totalDurationMs}ms</p>
      </section>

      <section>
        <h3>Snapshots</h3>
        <SummaryList values={state.summary?.snapshots ?? []} />
      </section>
    </div>
  );
});
