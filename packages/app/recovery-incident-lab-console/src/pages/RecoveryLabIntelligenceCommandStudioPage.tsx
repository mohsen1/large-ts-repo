import { useMemo, useState, type ReactElement, type MouseEvent } from 'react';
import { RecoveryLabIntelligenceCommandPanel } from '../components/RecoveryLabIntelligenceCommandPanel';
import { RecoveryLabSignalMatrixPanel } from '../components/RecoveryLabSignalMatrixPanel';
import { useRecoveryLabIntelligenceStudio } from '../hooks/useRecoveryLabIntelligenceStudio';
import { type StrategyLane, type StrategyMode } from '@domain/recovery-lab-intelligence-core';

type SeverityLabel = {
  readonly severity: 'info' | 'warn' | 'error' | 'critical' | 'fatal';
  readonly count: number;
};

type MatrixLine = {
  readonly source: string;
  readonly count: number;
};

type SessionToken = {
  readonly route: string;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly score: number;
};

const severityOrder: readonly SeverityLabel['severity'][] = ['info', 'warn', 'error', 'critical', 'fatal'];

const toSeverityReport = (raw: Record<string, number>): readonly SeverityLabel[] =>
  severityOrder
    .map((severity) => ({ severity, count: raw[severity] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .toSorted((left, right) => right.count - left.count);

const summarizeMatrix = (matrixRows: readonly string[], matrixCount: number): string => {
  const topRows = matrixRows.slice(0, 6).join(' | ');
  return `${topRows}${matrixRows.length > 6 ? ` (+${matrixRows.length - 6})` : ''} | events=${matrixCount}`;
};

const toTopMatrix = (sources: readonly MatrixLine[]): readonly MatrixLine[] =>
  sources.slice(0, 12).map((entry, index) => ({
    ...entry,
    source: `${index + 1}. ${entry.source}`,
  }));

const toSessionTokens = (sessions: readonly SessionToken[]) =>
  sessions.map((session, index) => `${index + 1}:${session.route}(${session.mode}/${session.lane})=${session.score.toFixed(3)}`);

export const RecoveryLabIntelligenceCommandStudioPage = (): ReactElement => {
  const {
    workspace,
    scenario,
    status,
    sessions,
    matrix,
    matrixRows,
    matrixCells,
    matrixSources,
    matrixSourceSummary,
    matrixScore,
    bySeverity,
    signalBars,
    runStudio,
    bootstrap,
    setWorkspace,
    setScenario,
    setMode,
    setLane,
    clearStudio,
    appendSignals,
  } = useRecoveryLabIntelligenceStudio();

  const [refreshDisabled, setRefreshDisabled] = useState(false);
  const [manualRoute, setManualRoute] = useState(`${workspace}::${scenario}`);

  const severityReport = useMemo(() => toSeverityReport(bySeverity), [bySeverity]);
  const matrixSummary = useMemo(
    () => summarizeMatrix(matrixRows, matrixCells),
    [matrixRows, matrixCells],
  );

  const topMatrixRows = useMemo(
    () => toTopMatrix(matrixSourceSummary as readonly MatrixLine[]),
    [matrixSourceSummary],
  );
  const topSessionRows = useMemo(() => toSessionTokens(sessions), [sessions]);

  const workspaceHint = useMemo(() => `${workspace} -> ${scenario} (${status})`, [workspace, scenario, status]);

  const topSignalBars = useMemo(
    () =>
      signalBars.map((bar) => {
        const ratio = bar.score * 100;
        return {
          ...bar,
          width: `${Math.max(0, Math.min(100, Number(ratio.toFixed(1))))}%`,
          color: bar.color,
          score: bar.score,
        };
      }),
    [signalBars],
  );

  const summaryLines = useMemo(
    () => [
      `workspace hint: ${workspaceHint}`,
      `matrix lanes: ${matrixSummary}`,
      `matrix score: ${matrixScore.toFixed(3)}`,
      `sessions: ${sessions.length}`,
      `bars: ${signalBars.length}`,
      `seed: ${manualRoute}`,
    ],
    [workspaceHint, matrixSummary, matrixScore, sessions.length, signalBars.length, manualRoute],
  );

  const canRun = status !== 'running';

  const onRefresh = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (refreshDisabled) return;
    setRefreshDisabled(true);
    setManualRoute(`${workspace}::${scenario}::seed${Date.now()}`);
    try {
      bootstrap();
      await runStudio();
    } finally {
      setRefreshDisabled(false);
    }
  };

  const onInjectSignal = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    appendSignals([
      {
        source: 'manual',
        severity: 'info',
        at: new Date().toISOString(),
        detail: {
          route: 'studio:inject',
          marker: manualRoute,
          matrixScore,
        },
      },
      {
        source: 'manual',
        severity: 'warn',
        at: new Date().toISOString(),
        detail: {
          route: 'studio:inject',
          marker: manualRoute,
          matrixRows,
        },
      },
    ]);
  };

  return (
    <main className="recovery-lab-intelligence-command-studio-page">
      <h1>Recovery Lab Intelligence Command Studio</h1>
      <section className="recovery-lab-intelligence-command-studio-page__toolbar">
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
        <label>
          Manual route
          <input
            value={manualRoute}
            onChange={(event) => {
              setManualRoute(event.currentTarget.value);
            }}
          />
        </label>
        <button type="button" onClick={() => setMode('analyze')}>
          normalize mode analyze
        </button>
        <button type="button" onClick={() => setLane('forecast')}>
          normalize lane forecast
        </button>
        <button type="button" disabled={!canRun || refreshDisabled} onClick={onRefresh}>
          rerun all
        </button>
        <button type="button" onClick={onInjectSignal}>
          inject signals
        </button>
        <button type="button" onClick={() => clearStudio()}>
          clear
        </button>
      </section>

      <RecoveryLabIntelligenceCommandPanel
        activeMode={sessions[0]?.mode ?? 'simulate'}
        activeLane={sessions[0]?.lane ?? 'forecast'}
        summary={summaryLines}
        onClose={() => {
          setManualRoute(`${workspace}::${scenario}`);
        }}
      />

      <section className="recovery-lab-intelligence-command-studio-page__matrix-panel">
        <h2>Signal Matrix</h2>
        <p>rows: {matrixSummary}</p>
        <p>cells: {matrix.cells.length}</p>
        <div className="signal-bars">
          {topSignalBars.map((bar) => (
            <p
              key={`${bar.width}-${bar.score}`}
              className="signal-bars__entry"
              style={{
                background: bar.color,
                width: bar.width,
              }}
            >
              {bar.score.toFixed(3)}
            </p>
          ))}
        </div>
        <RecoveryLabSignalMatrixPanel
          matrix={matrixSources}
          mode={sessions[0]?.mode ?? 'simulate'}
          lane={sessions[0]?.lane ?? 'forecast'}
          summary={summaryLines}
        />
      </section>

      <section className="recovery-lab-intelligence-command-studio-page__events">
        <h2>Severity distribution</h2>
        <ul>
          {severityReport.map((entry) => (
            <li key={entry.severity}>
              {entry.severity}: {entry.count}
            </li>
          ))}
        </ul>
        <h2>Source ranking</h2>
        <ul>
          {topMatrixRows.map((entry) => (
            <li key={`${entry.source}-${entry.count}`}>
              {entry.source}: {entry.count}
            </li>
          ))}
        </ul>
      </section>

      <section className="recovery-lab-intelligence-command-studio-page__sessions">
        <h2>Session tokens</h2>
        <ol>
          {topSessionRows.map((token, index) => (
            <li key={`${token}-${index}`}>{token}</li>
          ))}
        </ol>
      </section>

      <section className="recovery-lab-intelligence-command-studio-page__status">
        <p>last matrix: {matrixSummary}</p>
        <p>status: {status}</p>
      </section>
    </main>
  );
};
