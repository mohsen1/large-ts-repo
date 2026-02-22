import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardRunState, DashboardIncident } from '../types';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { OperationsController } from '@service/recovery-incident-orchestrator';
import type { IncidentPlaybookTemplate } from '@domain/recovery-operations-models';

export interface RunbookBoardState {
  readonly selectedPlaybook: string;
  readonly playbooks: readonly { readonly title: string; readonly steps: number }[];
  readonly artifacts: readonly { readonly artifactId: string; readonly checksum: string }[];
  readonly ready: boolean;
}

export interface OperationsPlaybookBoardProps {
  readonly repository: RecoveryIncidentRepository;
  readonly tenantId: string;
  readonly runs: readonly DashboardRunState[];
  readonly incidents: readonly DashboardIncident[];
}

interface ArtifactEnvelope {
  readonly artifactId: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

const sortByState = (left: DashboardRunState, right: DashboardRunState): number =>
  right.startedAt.localeCompare(left.startedAt);

const scoreFromRuns = (runs: readonly DashboardRunState[]) =>
  runs.reduce((total, run) => {
    if (run.state === 'failed') {
      return total + 0.2;
    }
    if (run.state === 'done') {
      return total + 1;
    }
    return total + 0.5;
  }, 0);

export const OperationsPlaybookBoard = ({ repository, tenantId, runs, incidents }: OperationsPlaybookBoardProps) => {
  const controller = useMemo(
    () => new OperationsController({ repository, tenantId, clock: () => new Date().toISOString() }),
    [repository, tenantId],
  );
  const [template, setTemplate] = useState<IncidentPlaybookTemplate | undefined>();
  const [playbooks, setPlaybooks] = useState<readonly { readonly title: string; readonly steps: number }[]>([]);
  const [artifacts, setArtifacts] = useState<readonly ArtifactEnvelope[]>([]);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>('');

  const ready = useMemo(() => incidents.length > 0 && runbooksReady(incidents), [incidents]);
  const runScore = useMemo(() => scoreFromRuns(runs), [runs]);
  const runBuckets = useMemo(() => {
    const buckets = new Map<DashboardRunState['state'], number>();
    for (const run of runs) {
      const count = buckets.get(run.state) ?? 0;
      buckets.set(run.state, count + 1);
    }
    return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [runs]);

  const build = useCallback(async () => {
    const bundle = await controller.buildPlaybooks();
    setTemplate(bundle.template);
    setPlaybooks(bundle.playbooks.map((playbook) => ({
      title: String(playbook.playbookId),
      steps: playbook.steps.length,
    })));
    setArtifacts(bundle.artifacts.map((artifact: ArtifactEnvelope) => ({
      artifactId: artifact.artifactId,
      sizeBytes: artifact.sizeBytes,
      checksum: artifact.checksum,
    })));
    setSelectedPlaybook(bundle.playbooks[0]?.playbookId ?? '');
  }, [controller]);

  useEffect(() => {
    void build();
  }, [build]);

  const clearSelection = () => {
    setSelectedPlaybook('');
  };

  const orderedRuns = useMemo(() => [...runs].sort(sortByState), [runs]);

  return (
    <section className="operations-playbook-board">
      <h2>Operations Playbook Board</h2>
      <p>Ready: {String(ready)} score={runScore.toFixed(2)}</p>
      <button onClick={() => void build()}>Build now</button>
      <button onClick={clearSelection}>Clear selection</button>
      <div className="playbook-metadata">
        <h3>Template</h3>
        <p>{template?.title ?? 'none'}</p>
        <p>{template?.templateId}</p>
      </div>
      <div className="playbook-grid">
        <article>
          <h3>Playbooks</h3>
          <ul>
            {playbooks.map((entry) => (
              <li key={entry.title}>
                <button onClick={() => setSelectedPlaybook(entry.title)}>{entry.title}</button>
                <span>{entry.steps} steps</span>
              </li>
            ))}
          </ul>
        </article>
        <article>
          <h3>Artifacts</h3>
          <ul>
            {artifacts.map((entry) => (
              <li key={entry.artifactId}>
                <strong>{entry.artifactId}</strong>
                <small>{entry.sizeBytes} bytes</small>
                <small>{entry.checksum}</small>
              </li>
            ))}
          </ul>
        </article>
        <article>
          <h3>Run Buckets</h3>
          <ul>
            {runBuckets.map(([state, count]) => (
              <li key={state}>
                {state}: {count}
              </li>
            ))}
          </ul>
          <h3>Recent Runs</h3>
          <ul>
            {orderedRuns.slice(0, 8).map((run) => (
              <li key={run.runId}>
                <span>{run.runId}</span>
                <span>{run.state}</span>
                <span>{run.startedAt}</span>
              </li>
            ))}
          </ul>
          <p>Selected: {selectedPlaybook || 'none'}</p>
        </article>
      </div>
    </section>
  );
};

const runbooksReady = (incidents: readonly DashboardIncident[]) =>
  incidents.every((incident) => incident.runCount >= 0);
