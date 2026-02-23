import { useCallback, useMemo } from 'react';
import { useRecoverySynthesis } from '../hooks/useRecoverySynthesis';
import { SynthesisControlPanel } from '../components/synthesis/SynthesisControlPanel';
import { SynthesisDependencyGraph } from '../components/synthesis/SynthesisDependencyGraph';
import { SynthesisReadinessBoard } from '../components/synthesis/SynthesisReadinessBoard';
import type { OrchestrationInput } from '@service/recovery-synthesis-orchestrator';
import {
  asCommandId,
  asIncidentId,
  asMillis,
  asScenarioId,
  asPercent,
  asScenarioSignalId,
  asScenarioConstraintId,
  asScenarioProfileId,
  type ScenarioBlueprint,
} from '@domain/recovery-scenario-lens';

const fallbackCommandIds = ['cmd-a', 'cmd-b', 'cmd-c'];

const makeFakeBlueprint = (): ScenarioBlueprint => ({
  scenarioId: asScenarioId('scenario.synthetic'),
  incidentId: asIncidentId('incident.synthetic'),
  name: 'Synthetic Recovery Synthesis',
  windowMinutes: 60,
  baselineConfidence: asPercent(0.94),
  signals: [
    {
      signalId: asScenarioSignalId('signal-1'),
      name: 'Error spike',
      severity: 'critical',
      score: asPercent(0.98),
      observedAt: new Date().toISOString(),
      context: { detector: 'playbook-router' },
      source: 'simulation',
    },
  ],
  commands: [
    {
      commandId: asCommandId(fallbackCommandIds[0]),
      commandName: 'Drain queue',
      targetService: 'service-gateway',
      estimatedDurationMs: asMillis(180000),
      resourceSpendUnits: 5,
      prerequisites: [],
      blastRadius: 1,
    },
    {
      commandId: asCommandId(fallbackCommandIds[1]),
      commandName: 'Fail over cache',
      targetService: 'service-cache',
      estimatedDurationMs: asMillis(240000),
      resourceSpendUnits: 9,
      prerequisites: [asCommandId(fallbackCommandIds[0])],
      blastRadius: 2,
    },
    {
      commandId: asCommandId(fallbackCommandIds[2]),
      commandName: 'Restart worker pool',
      targetService: 'service-worker',
      estimatedDurationMs: asMillis(120000),
      resourceSpendUnits: 11,
      prerequisites: [asCommandId(fallbackCommandIds[1])],
      blastRadius: 3,
    },
  ],
  links: [
    { from: asCommandId(fallbackCommandIds[0]), to: asCommandId(fallbackCommandIds[1]), reason: 'sequence safety', coupling: 0.4 },
    { from: asCommandId(fallbackCommandIds[1]), to: asCommandId(fallbackCommandIds[2]), reason: 'warm handoff', coupling: 0.7 },
  ],
  policies: ['policy.synthetic.safe'],
});

export const RecoverySynthesisConsolePage = () => {
  const { state, actions, runHistory, runScenario, simulatePlan } = useRecoverySynthesis();

  const canSimulate = state.envelope?.runId !== undefined;

  const onRun = useCallback(async () => {
    const payload: OrchestrationInput = {
      blueprint: makeFakeBlueprint(),
      profile: {
        profileId: asScenarioProfileId('synthetic-profile'),
        name: 'Synthetic Profile',
        maxParallelism: 2,
        maxBlastRadius: 3,
        maxRuntimeMs: asMillis(1200000),
        allowManualOverride: true,
        policyIds: ['policy-1', 'policy-2'],
      },
      policyInputs: [
        {
          incidentSeverity: 'critical',
          tenant: 'ops',
          services: ['service-gateway', 'service-cache', 'service-worker'],
          region: 'us-east-1',
          availableOperators: 4,
        },
      ],
      constraints: [
        {
          constraintId: asScenarioConstraintId('manual-parallelism'),
          type: 'max_parallelism',
          description: 'manual cap',
          severity: 'warning',
          commandIds: fallbackCommandIds.map(asCommandId),
          limit: 2,
        },
      ],
      signals: [],
      initiatedBy: 'dashboard-operator',
    };
    await runScenario(payload);
  }, [runScenario]);

  const onSimulate = useCallback(() => {
    if (state.envelope?.runId) {
      void simulatePlan(state.envelope.runId);
    }
  }, [state.envelope?.runId, simulatePlan]);

  const onModeChange = useCallback(() => {}, []);
  const onRefresh = useCallback(() => {}, []);

  const diagnostics = useMemo(
    () => ({
      run: state.runId ?? 'n/a',
      runHistoryCount: runHistory.length,
      activeSignals: state.signals.length,
      constraintCount: state.constraints.length,
    }),
    [state.runId, runHistory.length, state.signals.length, state.constraints.length],
  );

  return (
    <main style={{ display: 'grid', gap: '1rem' }}>
      <h1>Recovery Synthesis Console</h1>
      <p>run={diagnostics.run} history={diagnostics.runHistoryCount} activeSignals={diagnostics.activeSignals}</p>
      <SynthesisControlPanel
        state={state}
        actions={actions}
        onModeChange={() => onModeChange()}
        onRefresh={onRefresh}
      />
      <section style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={onRun} disabled={state.loading}>
          Generate scenario
        </button>
        <button type="button" onClick={onSimulate} disabled={!canSimulate || state.loading}>
          Simulate active plan
        </button>
      </section>
      {state.blueprint ? <SynthesisDependencyGraph blueprint={state.blueprint} /> : null}
      <SynthesisReadinessBoard simulation={state.simResult} />
      {state.envelope ? (
        <section>
          <h3>Envelope</h3>
          <pre>{JSON.stringify(state.envelope, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
};
