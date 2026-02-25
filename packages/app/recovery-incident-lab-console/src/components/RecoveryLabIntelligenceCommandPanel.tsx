import { type ReactElement, useMemo, useState } from 'react';
import { useRecoveryLabIntelligenceStudio } from '../hooks/useRecoveryLabIntelligenceStudio';
import { type StrategyLane, type StrategyMode } from '@domain/recovery-lab-intelligence-core';
import type { SignalMatrix } from '@domain/recovery-lab-intelligence-core';
import { RecoveryLabSignalMatrixPanel } from './RecoveryLabSignalMatrixPanel';

const MODES: readonly StrategyMode[] = ['simulate', 'analyze', 'stress', 'plan', 'synthesize'];
const LANES: readonly StrategyLane[] = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'];

type PanelProps = {
  readonly activeMode: StrategyMode;
  readonly activeLane: StrategyLane;
  readonly onClose: () => void;
  readonly summary: readonly string[];
};

type ScoreBar = {
  readonly width: `${number}%`;
  readonly color: `#${string}`;
  readonly score: number;
};

const palette = ['#22d3ee', '#a78bfa', '#f59e0b', '#4ade80', '#f472b6'] as const;

export const RecoveryLabIntelligenceCommandPanel = ({ activeMode, activeLane, onClose, summary }: PanelProps): ReactElement => {
  const {
    workspace,
    scenario,
    status,
    sessions,
    setMode,
    setLane,
    setScenario,
    setWorkspace,
    runStudio,
    matrix,
    matrixScore,
    matrixSourceSummary,
    signalBars,
    matrixRows,
  } = useRecoveryLabIntelligenceStudio();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const topScore = useMemo(() => {
    if (sessions.length === 0) {
      return 'n/a';
    }
    return `${(sessions[0]?.score ?? 0).toFixed(3)} (${sessions[0]?.mode}/${sessions[0]?.lane})`;
  }, [sessions]);

  const laneDistribution = useMemo(() => {
    const buckets = sessions.reduce<Record<string, number>>((acc, session) => {
      return { ...acc, [session.lane]: (acc[session.lane] ?? 0) + 1 };
    }, {});
    return Object.entries(buckets).map(([lane, count]) => `${lane}: ${count}`).toSorted();
  }, [sessions]);

  const rows = useMemo(() => matrixRows.join(' | '), [matrixRows]);

  const cells = useMemo(() => {
    if (!matrix) return [];
        const raw = matrix as SignalMatrix;
    return raw.cells.slice(0, 12);
  }, [matrix]);

  return (
    <section className="recovery-lab-intelligence-command-panel">
      <header>
        <h2>Recovery Lab Intelligence Control</h2>
        <p>status: {status}</p>
      </header>
      <p>
        workspace: {workspace} / scenario: {scenario}
      </p>
      <p>workspace key: {workspace}::{scenario}</p>
      <p>matrix score: {matrixScore.toFixed(3)}</p>
      <p>matrix lanes: {rows || 'n/a'}</p>

      <div className="controls">
        <div>
          <label>
            Workspace
            <input
              value={workspace}
              onChange={(event) => {
                setWorkspace(event.currentTarget.value);
              }}
            />
          </label>
          <label>
            Scenario
            <input
              value={scenario}
              onChange={(event) => {
                setScenario(event.currentTarget.value);
              }}
            />
          </label>
        </div>

        <div>
          <label>
            Mode
            <select
              value={activeMode}
              onChange={(event) => {
                const mode = event.currentTarget.value as StrategyMode;
                if (MODES.includes(mode)) {
                  setMode(mode);
                }
              }}
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lane
            <select
              value={activeLane}
              onChange={(event) => {
                const lane = event.currentTarget.value as StrategyLane;
                if (LANES.includes(lane)) {
                  setLane(lane);
                }
              }}
            >
              {LANES.map((lane) => (
                <option key={lane} value={lane}>
                  {lane}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="recovery-lab-intelligence-command-panel__summary">
        <h3>Session summary</h3>
        <ul>
          {laneDistribution.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>

        <h3>Matrix source summary</h3>
        <ul>
          {matrixSourceSummary.map((entry) => (
            <li key={`${entry.source}-${entry.count}`}>
              {entry.source}: {entry.count}
            </li>
          ))}
        </ul>

        <h3>Recent summary lines</h3>
        <ol>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>

      <section>
        <h3>Signal cells</h3>
        <ul>
          {cells.map((cell, index) => (
            <li key={`${cell.source}-${index}`}>
              {cell.source}/{cell.mode}: {cell.severity}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Scoreboard</h3>
        <p>top score: {topScore}</p>
        <div className="score-bars">
          {(signalBars as readonly ScoreBar[]).map((entry, index) => (
            <div
              key={`${entry.color}-${index}`}
              className="score-bar"
              style={{ width: entry.width, background: palette[index % palette.length] }}
            >
              {entry.score.toFixed(2)}
            </div>
          ))}
        </div>
      </section>

      <RecoveryLabSignalMatrixPanel
        summary={summary}
        matrix={(matrix as unknown as { readonly cells?: never[] } | undefined)?.cells}
        mode={activeMode}
        lane={activeLane}
      />

      <footer>
        <button
          type="button"
          onClick={() => {
            void Promise.resolve()
              .then(() => {
                setBusy(true);
                setMessage(undefined);
              })
              .then(() => runStudio())
              .then(() => {
                setBusy(false);
              })
              .catch((cause) => {
                setMessage(String(cause));
                setBusy(false);
              });
          }}
          disabled={busy}
        >
          run orchestration
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
          }}
        >
          close
        </button>
        <button
          type="button"
          onClick={() => {
            setMessage('manual reset invoked');
          }}
        >
          reset status
        </button>
      </footer>
      {message ? <p className="status-message">{message}</p> : null}
    </section>
  );
};
