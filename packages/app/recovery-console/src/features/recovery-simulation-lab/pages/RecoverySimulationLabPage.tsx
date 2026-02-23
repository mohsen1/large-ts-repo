import { useState } from 'react';
import { SimulationLabControls } from '../components/SimulationLabControls';
import { SimulationLabReadinessBoard } from '../components/SimulationLabReadinessBoard';
import { SimulationLabTimeline } from '../components/SimulationLabTimeline';
import { useRecoverySimulationLab } from '../hooks/useRecoverySimulationLab';
import type { SimulationBandSignal } from '@domain/recovery-simulation-lab-models';

interface RecoverySimulationLabPageProps {
  readonly tenantId: string;
  readonly incidentId?: string;
}

export const RecoverySimulationLabPage = ({ tenantId, incidentId }: RecoverySimulationLabPageProps) => {
  const {
    draft,
    selectedBand,
    runStatus,
    statusMessage,
    errors,
    commands,
    selectedCommandIndex,
    planResult,
    summaryLines,
    run,
    setBand,
    setDraft,
    setSelectedCommandIndex,
    buildPlan,
    runSimulation,
  } = useRecoverySimulationLab(tenantId);

  const [notes] = useState<string[]>([]);

  return (
    <main>
      <header>
        <h1>Recovery Simulation Lab</h1>
        <p>{`tenant ${tenantId}`}</p>
        <p>{`incident ${incidentId ?? 'not provided'}`}</p>
        <p>{`status ${runStatus}`}</p>
        {statusMessage ? <p>{statusMessage}</p> : null}
      </header>

      <SimulationLabControls
        draft={draft}
        onDraftChange={setDraft}
        selectedBand={selectedBand}
        onBandClick={setBand}
        onRun={runSimulation}
        onBuild={buildPlan}
      />

      <SimulationLabReadinessBoard
        result={planResult}
        selected={planResult?.projection.draftId}
        riskHeadline={summaryLines.join(' | ')}
        onSelectBand={(band) => {
          const safe = band as SimulationBandSignal['band'];
          setBand(safe);
        }}
      />

      <SimulationLabTimeline
        run={run}
        commands={commands}
        selectedCommandIndex={selectedCommandIndex}
        onSelectCommand={setSelectedCommandIndex}
      />

      <section>
        <h2>Notes</h2>
        <ul>
          {notes.length === 0 ? <li>No notes yet</li> : notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>

      {errors.length > 0 ? (
        <section>
          <h2>Errors</h2>
          <ul>
            {errors.map((entry) => (
              <li key={entry} style={{ color: '#ff4d4f' }}>
                {entry}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
};
