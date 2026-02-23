import { FC, useMemo, useState } from 'react';
import { evaluateRisk, createTimeline, IntentTimeline } from '@domain/recovery-cockpit-orchestration-core';
import { useIntentOrchestrator } from '../hooks/useIntentOrchestrator';
import { IntentHeatmap } from '../components/intent/IntentHeatmap';
import { IntentWorkbench } from '../components/intent/IntentWorkbench';
import { IntentPolicyLane } from '../components/intent/IntentPolicyLane';
import { IntentTimelinePanel } from '../components/intent/IntentTimelinePanel';

const EmptyState = () => <p>No active recovery intents. Seed a scenario to start.</p>;

export const RecoveryCockpitIntentOpsPage: FC = () => {
  const {
    running,
    intents,
    selectedIntentId,
    statusText,
    overviewSummary,
    seedScenarios,
    selectIntent,
    runOrchestrator,
    addStep,
    promoteActive,
    finishIntent,
    abortIntent,
  } = useIntentOrchestrator();

  const [newStep, setNewStep] = useState({ key: 'gate', action: 'validate gate', operator: 'operator', service: 'platform', expectedMinutes: 10 });
  const [policyByIntent, setPolicyByIntent] = useState<Record<string, string>>({});

  const selectedIntent = intents.find((intent) => intent.intentId === selectedIntentId);

  const policyByIntentRecords = useMemo(() => {
    return intents.reduce<Record<string, IntentTimeline>>((acc, intent) => {
      acc[intent.intentId] = createTimeline(intent.intentId);
      return acc;
    }, {});
  }, [intents]);

  const riskScore = selectedIntent ? evaluateRisk(selectedIntent).compositeScore.toFixed(1) : 'n/a';

  return (
    <main style={{ padding: 20, display: 'grid', gap: 14 }}>
      <header>
        <h1>Recovery Intent Operations</h1>
        <p>{overviewSummary}</p>
        <small>{statusText}</small>
      </header>

      <section style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={() => void seedScenarios()} disabled={running}>
          Seed workload intent
        </button>
        <button type="button" onClick={() => void runOrchestrator()} disabled={running || intents.length === 0}>
          Run orchestration
        </button>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <input
            aria-label="step-key"
            value={newStep.key}
            onChange={(event) => setNewStep((prev) => ({ ...prev, key: event.target.value }))}
          />
          <input
            aria-label="step-action"
            value={newStep.action}
            onChange={(event) => setNewStep((prev) => ({ ...prev, action: event.target.value }))}
          />
          <input
            aria-label="step-operator"
            value={newStep.operator}
            onChange={(event) => setNewStep((prev) => ({ ...prev, operator: event.target.value }))}
          />
          <input
            aria-label="step-service"
            value={newStep.service}
            onChange={(event) => setNewStep((prev) => ({ ...prev, service: event.target.value }))}
          />
          <input
            aria-label="step-duration"
            type="number"
            value={newStep.expectedMinutes}
            onChange={(event) => setNewStep((prev) => ({ ...prev, expectedMinutes: Number(event.target.value) }))}
          />
          <button type="button" onClick={() => addStep({ ...newStep, requiredCapabilities: [selectedIntent?.scope ?? 'platform', 'telemetry'] })}>
            Add step
          </button>
        </div>
        <div>
          <p>Selected intent risk: {riskScore}</p>
          <p>Timeline threshold: {intents.length}</p>
        </div>
      </section>

      <IntentHeatmap intents={intents} intensityThreshold={55} onInspect={selectIntent} />

      <section>
        {intents.length ? (
          <IntentWorkbench
            intents={intents}
            selectedId={selectedIntentId}
            onSelect={selectIntent}
            onPromote={promoteActive}
            onFinish={finishIntent}
            onAbort={abortIntent}
          />
        ) : (
          <EmptyState />
        )}
      </section>

      <IntentPolicyLane
        intents={intents}
        timelineByIntent={policyByIntentRecords}
        onApplyPolicy={(intentId, action, comment) => {
          setPolicyByIntent((prev) => ({ ...prev, [intentId]: `${action}::${comment}` }));
        }}
      />

      <IntentTimelinePanel selectedIntent={selectedIntent} />
    </main>
  );
};
