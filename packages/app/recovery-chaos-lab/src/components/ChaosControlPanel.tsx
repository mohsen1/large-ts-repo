import { useMemo } from 'react';
import type { ChaosRunEvent, ChaosRunReport } from '@service/recovery-chaos-orchestrator';
import type { StageBoundary } from '@domain/recovery-chaos-lab';
import type { ActionKind } from '@domain/recovery-chaos-lab';

export interface StageControls<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly selectedStage?: string;
  readonly dryRun: boolean;
  readonly speedMs: number;
  readonly actions: readonly ActionKind[];
}

export interface ChaosControlPanelProps<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly controls: StageControls<T>;
  readonly status: 'idle' | 'running' | 'done' | 'error';
  readonly latest?: ChaosRunReport<T> | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onReset: () => void;
  readonly onAdjust: (next: StageControls<T>) => void;
}

type TraceLike = { readonly kind?: string; readonly status?: string };

const KNOWN_EVENTS = ['run-started', 'stage-started', 'stage-complete', 'run-complete', 'run-failed'] as const;

function classify(events: readonly TraceLike[]) {
  const latestKind = events.at(-1)?.kind;
  return {
    known: latestKind ? (KNOWN_EVENTS as readonly string[]).includes(String(latestKind)) : false,
    latest: latestKind ?? 'run-started'
  };
}

export function ChaosControlPanel<T extends readonly StageBoundary<string, unknown, unknown>[]>({
  controls,
  status,
  latest,
  onStart,
  onStop,
  onReset,
  onAdjust
}: ChaosControlPanelProps<T>) {
  const canStart = status === 'idle' || status === 'done' || status === 'error';
  const canStop = status === 'running';
  const canReset = status !== 'running';
  const progress = latest?.progress ?? 0;

  const metrics = useMemo(() => {
    const ratio = progress / 100;
    const score = Math.round((ratio + 1) * 42);
    return {
      ratio,
      score,
      state: status
    };
  }, [progress, status]);

  const eventSummary = classify(latest?.trace ?? []);

  return (
    <section className="chaos-control">
      <h3>Control panel</h3>
      <label>
        Stage selected
        <select
          value={controls.selectedStage ?? ''}
          onChange={(event) => {
            onAdjust({
              ...controls,
              selectedStage: event.target.value || undefined
            });
          }}
        >
          <option value="">all stages</option>
          {controls.actions.map((action) => (
            <option value={action} key={action}>
              {action}
            </option>
          ))}
        </select>
      </label>
      <label>
        Simulation speed
        <input
          type="range"
          min={1}
          max={10}
          value={controls.speedMs}
          onChange={(event) => {
            onAdjust({
              ...controls,
              speedMs: Number(event.target.value)
            });
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={controls.dryRun}
          onChange={() => {
            onAdjust({ ...controls, dryRun: !controls.dryRun });
          }}
        />
        Dry run
      </label>
      <footer>
        <button type="button" onClick={onStart} disabled={!canStart}>
          Start
        </button>
        <button type="button" onClick={onStop} disabled={!canStop}>
          Stop
        </button>
        <button type="button" onClick={onReset} disabled={!canReset}>
          Reset
        </button>
      </footer>
      <dl>
        <dt>Progress</dt>
        <dd>{progress}%</dd>
        <dt>Score</dt>
        <dd>{metrics.score}</dd>
        <dt>Status</dt>
        <dd>{metrics.state}</dd>
        <dt>Terminal event</dt>
        <dd>{eventSummary.known ? eventSummary.latest : 'pending'}</dd>
      </dl>
    </section>
  );
}
