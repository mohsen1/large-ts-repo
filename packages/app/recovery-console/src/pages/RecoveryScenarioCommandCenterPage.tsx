import { useMemo, useState } from 'react';
import {
  RecoveryScenarioSignalCards,
  type RecoveryScenarioSignalCardsProps,
} from '../components/RecoveryScenarioSignalCards';
import { RecoveryScenarioCommandWorkbench } from '../components/RecoveryScenarioCommandWorkbench';
import { ScenarioPolicyPalette, type ScenarioSignalPolicy } from '../components/ScenarioPolicyPalette';
import { useRecoveryScenarioWorkbench } from '../hooks/useRecoveryScenarioWorkbench';
import type { RecoveryScenarioTemplate, OrchestrationSignal } from '@domain/recovery-orchestration-planning/src/incident-models';

interface RecoveryScenarioCommandCenterPageProps {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly templates: readonly RecoveryScenarioTemplate[];
  readonly signals: readonly OrchestrationSignal[];
}

export const RecoveryScenarioCommandCenterPage = ({
  tenantId,
  incidentId,
  templates,
  signals,
}: RecoveryScenarioCommandCenterPageProps) => {
  const {
    state,
    runScenarioWorkflow,
    canRun,
    selectedReasons,
    status,
    health,
  } = useRecoveryScenarioWorkbench({
    tenantId,
    incidentId,
    templates,
    signals,
  });

  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [policyState, setPolicyState] = useState<readonly ScenarioSignalPolicy[]>(() =>
    templates.map((template) => ({
      id: template.templateId,
      name: template.title,
      mode: template.domain === 'network' ? 'auto' : 'staged',
      confidence: Math.min(95, template.signals.length * 11),
      enabled: true,
    })),
  );

  const handleAcknowledge = (signalKey: string) => {
    if (acknowledged.includes(signalKey)) {
      setAcknowledged((previous) => previous.filter((entry) => entry !== signalKey));
      return;
    }

    setAcknowledged((previous) => [...previous, signalKey]);
  };

  const handleSelectPolicy = (policyId: string) => {
    setPolicyState((previous) => previous.map((entry) => ({ ...entry, mode: entry.id === policyId ? 'manual' : entry.mode })));
  };

  const handleTogglePolicy = (policyId: string) => {
    setPolicyState((previous) =>
      previous.map((entry) =>
        entry.id === policyId
          ? {
              ...entry,
              enabled: !entry.enabled,
            }
          : entry,
      ),
    );
  };

  const reasons = useMemo(
    () => (selectedReasons.length === 0 ? ['No blocking constraints'] : selectedReasons),
    [selectedReasons],
  );

  const signalCardsProps: RecoveryScenarioSignalCardsProps = useMemo(
    () => ({
      signals,
      onAcknowledge: handleAcknowledge,
    }),
    [signals],
  );

  return (
    <main className="recovery-scenario-command-center-page">
      <header>
        <h1>Scenario Command Center</h1>
        <p>Tenant {tenantId} incident {incidentId}</p>
      </header>

      <RecoveryScenarioCommandWorkbench
        state={state}
        canRun={canRun}
        onRun={runScenarioWorkflow}
        health={health}
      />

      <section>
        <h2>Blocking reasons</h2>
        <ul>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Run status</h2>
        <p>Signals processed: {signals.length}</p>
        <p>Templates: {templates.length}</p>
        <p>Acknowledged: {acknowledged.length}</p>
        <p>Workflow status: {status}</p>
      </section>

      <ScenarioPolicyPalette
        policies={policyState}
        onSelectPolicy={handleSelectPolicy}
        onTogglePolicy={handleTogglePolicy}
      />

      <RecoveryScenarioSignalCards {...signalCardsProps} />
    </main>
  );
};
