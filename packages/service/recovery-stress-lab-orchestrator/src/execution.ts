import {
  normalizeTenantLimit,
  CommandRunbook,
  RecoverySignal,
  SeverityBand,
  TenantId,
  WorkloadTopology,
  createTenantId,
  DraftTemplate,
  RecoverySimulationResult,
  OrchestrationPlan,
  defaultProfileFromTeam,
  buildReadinessWindows,
  policyCoverageScore,
  prioritizeRunbookOrder,
  validateRunbooksAgainstRules,
  mergeWindows,
  topologyTraversalOrder,
  simulateRunbook,
  createRunbookId,
} from '@domain/recovery-stress-lab';

const PHASE_ORDER: readonly ['observe', 'isolate', 'migrate', 'verify', 'restore', 'standdown'] = ['observe', 'isolate', 'migrate', 'verify', 'restore', 'standdown'];

const BAND_ORDER = ['low', 'medium', 'high', 'critical'] as const;

export interface PlannerInput {
  readonly tenantId: string;
  readonly band: SeverityBand;
  readonly riskBias: 'conservative' | 'normal' | 'agile';
  readonly draft: DraftTemplate;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
}

export interface BuildDecision {
  readonly plan: OrchestrationPlan | null;
  readonly errors: readonly string[];
}

export const buildOrchestrationPlan = (input: PlannerInput): BuildDecision => {
  const tenantId = createTenantId(input.tenantId);
  const selectedRunbooks = input.runbooks.filter((runbook) => input.draft.selectedRunbooks.includes(runbook.id));
  const profile = defaultProfileFromTeam(input.tenantId, input.riskBias);
  const warnings = validateRunbooksAgainstRules(profile, selectedRunbooks);

  if (selectedRunbooks.length === 0) {
    return { plan: null, errors: ['No matching runbooks found for draft selection'] };
  }

  const ordered = prioritizeRunbookOrder(profile, input.draft);
  const orderedRunbooks = ordered
    .map((id) => selectedRunbooks.find((runbook) => runbook.id === id))
    .filter((entry): entry is CommandRunbook => entry !== undefined);

  const windows = orderedRunbooks.flatMap((runbook) => buildReadinessWindows(runbook, input.band));
  const scheduleEntries = mergeWindows(
    windows.map((window) => ({
      startMinute: new Date(window.startAt).getHours() * 60 + new Date(window.startAt).getMinutes(),
      endMinute: new Date(window.endAt).getHours() * 60 + new Date(window.endAt).getMinutes(),
      dayIndex: new Date(window.startAt).getUTCDay(),
    })),
    [],
  );

  const schedule = scheduleEntries.map((entry, index) => {
    const runbookId = windows[index]?.runbookId ?? createRunbookId(`fallback-${tenantId}-${index}`);
    return {
      runbookId,
      startAt: new Date(
        Date.UTC(2026, 0, 1 + entry.dayIndex, Math.floor(entry.startMinute / 60), entry.startMinute % 60),
      ).toISOString(),
      endAt: new Date(
        Date.UTC(2026, 0, 1 + entry.dayIndex, Math.floor(entry.endMinute / 60), entry.endMinute % 60),
      ).toISOString(),
      phaseOrder: PHASE_ORDER,
    };
  });

  const traversedWorkload = topologyTraversalOrder(input.topology);
  const coverage = policyCoverageScore(profile, orderedRunbooks.length);
  const estimateBase = orderedRunbooks.length * 45 * (1 / Math.max(0.5, coverage));
  const estimate = Math.max(1, normalizeTenantLimit(Math.max(1, estimateBase)));

  return {
    plan: {
      tenantId,
      scenarioName: `stress-lab-${input.tenantId}`,
      schedule,
      runbooks: orderedRunbooks,
      dependencies: {
        nodes: traversedWorkload,
        edges: input.topology.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          weight: edge.coupling,
          payload: { fromCriticality: 0, toCriticality: 0 },
        })),
      },
      estimatedCompletionMinutes: BAND_ORDER.includes(input.band) ? estimate : 1,
    },
    errors: warnings,
  };
};

export interface SimulationInput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly selectedSignals: readonly RecoverySignal[];
  readonly plan: OrchestrationPlan;
  readonly riskBias: 'conservative' | 'normal' | 'agile';
}

export const runSimulation = (input: SimulationInput) => {
  const profile = defaultProfileFromTeam(input.tenantId, input.riskBias);
  return simulateRunbook({
    tenantId: input.tenantId,
    band: input.band,
    selectedSignals: input.selectedSignals,
    runbooks: input.plan.runbooks,
    profile,
    nowIso: new Date().toISOString(),
  });
};

export const compareSimulations = (
  current: RecoverySimulationResult,
  candidate: RecoverySimulationResult,
): ReadonlyArray<string> => {
  const messages: string[] = [];
  const riskDelta = candidate.riskScore - current.riskScore;
  const slaDelta = candidate.slaCompliance - current.slaCompliance;

  if (riskDelta < -0.1) {
    messages.push('Candidate has lower risk profile by >10%.');
  }
  if (slaDelta < -0.1) {
    messages.push('SLA compliance regressed by >10%.');
  }
  if (candidate.ticks.length > current.ticks.length) {
    messages.push('Candidate extends plan duration but may provide better validation coverage.');
  }
  return messages;
};
