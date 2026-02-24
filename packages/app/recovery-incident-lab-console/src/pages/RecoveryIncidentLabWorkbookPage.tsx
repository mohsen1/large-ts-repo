import { type ReactElement, useMemo } from 'react';
import { RecoveryLabDiagnosticPanel } from '../components/RecoveryLabDiagnosticPanel';
import { useRecoveryLabWorkbook } from '../hooks/useRecoveryLabWorkbook';
import { ScenarioLabControls } from '../components/ScenarioLabControls';
import { ScenarioLabSignalsHeatmap } from '../components/ScenarioLabSignalsHeatmap';
import { ScenarioLabTimeline } from '../components/ScenarioLabTimeline';
import { summarizeSignalTrends } from '@domain/recovery-incident-lab-core';
import { useRecoveryIncidentLabWorkspace } from '../hooks/useRecoveryIncidentLabWorkspace';

export const RecoveryIncidentLabWorkbookPage = (): ReactElement => {
  const { state: workspaceState, summary: workspaceSummary } = useRecoveryIncidentLabWorkspace();
  const { state, isValid, summary, risk, signalSummary } = useRecoveryLabWorkbook();

  const riskLines = useMemo(() => risk ? `${risk.scenarioId}:${risk.score}:${risk.bands.length}` : 'no risk', [risk]);
  const signalWindows = useMemo(
    () =>
      state.signals.map((signal, index) => ({
        window: `${index + 1}-${signal.kind}`,
        score: Math.max(0, Math.min(100, signal.value)),
        recommendations: [signal.node, `${signal.value}`],
      })),
    [state.signals],
  );

  return (
    <main className="recovery-incident-lab-workbook-page">
      <header>
        <h1>Recovery Incident Lab Workbook</h1>
        <p>status {state.status}</p>
      </header>
      <section>
        <h2>Workspace snapshot</h2>
        <p>{workspaceSummary}</p>
        <ScenarioLabControls
          statusText={workspaceSummary}
          isBusy={workspaceState.mode === 'running'}
          canRun={isValid}
          summary={riskLines}
          onRun={() => {
            void workspaceState;
          }}
          onReset={() => {
            void window.location.reload();
          }}
        />
      </section>
      <ScenarioLabSignalsHeatmap windows={signalWindows} />
      <RecoveryLabDiagnosticPanel
        scenarioId={state.scenario?.id ?? 'none'}
        signals={state.signals}
        plan={state.plan}
        run={state.run}
        onExport={() => {
          window.alert(summary);
        }}
      />
      <ScenarioLabTimeline run={state.run} />
      <section>
        <h2>Signal summaries</h2>
        <ul>
          {signalSummary.map((item) => (
            <li key={`${item.kind}`}>{`${item.kind} avg=${item.average} peak=${item.peak}`}</li>
          ))}
        </ul>
        <p>summaries={summarizeSignalTrends(state.signals).length}</p>
      </section>
    </main>
  );
};
