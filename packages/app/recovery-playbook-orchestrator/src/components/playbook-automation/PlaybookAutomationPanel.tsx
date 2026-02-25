import { memo } from 'react';
import type { PlaybookAutomationSessionId, PlaybookAutomationRunId } from '@domain/recovery-playbook-orchestration-core';
import { PlaybookStatusConsole } from './PlaybookStatusConsole';
import { PlaybookTopologyGraph } from './PlaybookTopologyGraph';

export interface PlaybookAutomationPanelProps {
  sessionId?: PlaybookAutomationSessionId;
  runs: readonly PlaybookAutomationRunId[];
  loading: boolean;
  history: readonly string[];
  onHydrate: () => Promise<void>;
  onRun: () => Promise<void>;
}

const compact = <T extends readonly unknown[]>(rows: T, max = 4): readonly T[number][] =>
  rows.length > max ? rows.slice(0, max) : [...rows];

export const PlaybookAutomationPanel = memo(
  ({ sessionId, runs, loading, history, onHydrate, onRun }: PlaybookAutomationPanelProps) => {
    const recent = compact(history);
    return (
      <section className="playbook-automation-panel">
        <header>
          <h2>Automation Session</h2>
          <p>{sessionId ?? 'no session'}</p>
        </header>
        <article>
          <h3>Run timeline</h3>
          <ul>
            {runs.map((runId) => (
              <li key={runId}>{runId}</li>
            ))}
          </ul>
          <button onClick={onHydrate} disabled={loading}>
            Hydrate simulation
          </button>
          <button onClick={onRun} disabled={loading}>
            Execute simulation plan
          </button>
        </article>
        <PlaybookStatusConsole statuses={recent} />
        <PlaybookTopologyGraph runs={runs} />
      </section>
    );
  },
);

PlaybookAutomationPanel.displayName = 'PlaybookAutomationPanel';
