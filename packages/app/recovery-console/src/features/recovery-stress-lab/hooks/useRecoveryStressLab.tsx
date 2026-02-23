import { useCallback, useMemo, useState } from 'react';
import {
  TenantId,
  CommandRunbook,
  DraftTemplate,
  SeverityBand,
  RecoverySignal,
  OrchestrationPlan,
  RecoverySimulationResult,
  type RecoverySignalId,
  defaultProfileFromTeam,
} from '@domain/recovery-stress-lab';
import { buildOrchestrationPlan, runSimulation, buildDecisionFromInput } from '@service/recovery-stress-lab-orchestrator';
import type { StressLabSummary } from '../types';
import { StressLabOrchestrator } from '@service/recovery-stress-lab-orchestrator';
import { InMemoryPersistence, ConsoleAuditSink } from '@domain/recovery-stress-lab';

const buildCommandsFromRunbooks = (runbooks: readonly CommandRunbook[]) => {
  return runbooks.flatMap((runbook) =>
    runbook.steps.map((step) => ({
      id: String(step.commandId),
      title: `${runbook.name}: ${step.title}`,
      runbook: runbook.id,
      stepCount: runbook.steps.length,
    })),
  );
};

export const useRecoveryStressLab = (tenantId: TenantId) => {
  const [runbooks, setRunbooks] = useState<readonly CommandRunbook[]>([]);
  const [signals, setSignals] = useState<readonly RecoverySignal[]>([]);
  const [plan, setPlan] = useState<OrchestrationPlan | null>(null);
  const [simulation, setSimulation] = useState<RecoverySimulationResult | null>(null);
  const [band, setBand] = useState<SeverityBand>('medium');
  const [selectedSignalIds, setSelectedSignalIds] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<StressLabSummary['status']>('idle');
  const [errors, setErrors] = useState<readonly string[]>([]);

  const profile = useMemo(() => defaultProfileFromTeam(tenantId, band === 'critical' ? 'agile' : 'normal'), [tenantId, band]);
  const commandCatalog = useMemo(() => buildCommandsFromRunbooks(runbooks), [runbooks]);

  const selectedSignals = useMemo(
    () => signals.filter((signal) => selectedSignalIds.includes(signal.id)),
    [signals, selectedSignalIds],
  );

  const draft: DraftTemplate = useMemo(() => ({
    tenantId,
    title: `stress-lab-${tenantId}`,
    band,
    selectedRunbooks: runbooks.map((runbook) => runbook.id),
    selectedSignals: selectedSignals.map((signal) => signal.id),
  }), [tenantId, band, runbooks, selectedSignals]);

  const selectedPlanWindows = useMemo(() => {
    if (!plan) return [] as readonly string[];
    return plan.schedule
      .map((entry) => {
        const runbook = runbooks.find((item) => item.id === entry.runbookId);
        if (!runbook) return null;
        return `${runbook.name} ${entry.startAt}-${entry.endAt}`;
      })
      .filter((entry): entry is string => entry !== null);
  }, [plan, runbooks]);

  const buildPlan = useCallback(() => {
    setStatus('planning');
    setErrors([]);
    const planner = buildOrchestrationPlan({
      tenantId,
      band,
      riskBias: band === 'critical' ? 'agile' : 'normal',
      draft,
      runbooks,
      topology: {
        tenantId,
        nodes: [],
        edges: [],
      },
      signals: selectedSignals,
    });

    if (!planner.plan) {
      setErrors(planner.errors);
      setStatus('failed');
      return;
    }

    setPlan(planner.plan);
    setStatus('ready');
  }, [tenantId, band, draft, runbooks, selectedSignals]);

  const run = useCallback(async () => {
    if (!plan) {
      setErrors(['No plan to run']);
      setStatus('failed');
      return;
    }
    setStatus('simulating');
    const next = runSimulation({
      tenantId,
      band,
      selectedSignals,
      plan,
      riskBias: band === 'critical' ? 'agile' : 'normal',
    });

    setSimulation(next);
    setStatus('ready');
  }, [plan, tenantId, band, selectedSignals]);

  const runWithService = useCallback(async () => {
    const orchestrator = new StressLabOrchestrator({
      persistence: new InMemoryPersistence(),
      adapters: { audit: new ConsoleAuditSink() },
    });

    const decision = buildDecisionFromInput({
      tenantId,
      draft: {
        name: 'service-draft',
        description: 'Run with explicit orchestrator call',
        band,
        selectedSignals: [...selectedSignalIds] as RecoverySignalId[],
        selectedRunbookIds: runbooks.map((runbook) => runbook.id),
      },
      config: {
        tenantId,
        band,
        profileHint: band === 'critical' ? 'agile' : band === 'low' ? 'conservative' : 'normal',
        selectedRunbooks: runbooks.map((runbook) => runbook.id),
      },
      runbooks: runbooks.map((runbook) => ({
        id: runbook.id,
        title: runbook.name,
        steps: runbook.steps,
        cadence: runbook.cadence,
      })),
      targets: [],
      topology: {
        tenantId,
        nodes: [],
        edges: [],
      },
      signals: [...signals],
    });

    await orchestrator.bootstrap({
      tenantId,
      config: {
        tenantId,
        band,
        profileHint: 'normal',
        selectedRunbooks: runbooks.map((runbook) => runbook.id),
      },
      topologyId: 'stress-topology',
      runbooks: runbooks.map((runbook) => ({
        id: runbook.id,
        title: runbook.name,
        steps: runbook.steps,
        cadence: runbook.cadence,
      })),
      targets: [],
      signals: [...signals],
    });

    setPlan(decision.plan);
    setSimulation(decision.simulation);
  }, [tenantId, band, runbooks, selectedSignalIds, signals]);

  return {
    profile,
    band,
    status,
    errors: [...errors],
    plan,
    simulation,
    runbooks,
    signals,
    selectedSignals,
    selectedSignalIds,
    commandCatalog,
    selectedPlanWindows,
    setBand,
    setRunbooks,
    setSignals,
    setSelectedSignalIds,
    buildPlan,
    run,
    runWithService,
  };
};
