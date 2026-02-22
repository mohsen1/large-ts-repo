import {
  buildPlanWindow,
  createPlanRevision,
  createWindowId,
  buildSignalWindow,
  type IncidentContext,
  type RecoveryPlanWindow,
  type RecoveryScenarioTemplate,
  type RecoveryStepTemplate,
  type ScenarioBudget,
  type ScenarioCandidate,
  type TenantId,
  type PlanRevision,
  type ScenarioState,
  type OrchestrationSignal,
  type SignalWindow,
  type IncidentId,
  type SimulationEnvelope,
  type IncidentDomain,
} from './incident-models';

export interface PlannerInput {
  readonly tenantId: TenantId;
  readonly incidentId: string;
  readonly service: string;
  readonly domain: IncidentDomain;
  readonly timestamp: string;
  readonly templates: readonly RecoveryScenarioTemplate[];
  readonly signals: readonly string[];
}

export interface CandidateSelection {
  readonly tenantId: TenantId;
  readonly selected: readonly ScenarioCandidate[];
  readonly envelopes: readonly SimulationEnvelope[];
  readonly reason: string;
}

const normalizeSignals = (signals: readonly string[]): OrchestrationSignal[] =>
  signals.map((signal, index) => ({
    tenantId: '',
    incidentId: '',
    signal,
    value: signal.length * 3,
    timestamp: new Date(Date.now() + index * 300).toISOString(),
  }));

const toSignalWindow = (
  timestamp: string,
  template: RecoveryScenarioTemplate,
): SignalWindow => buildSignalWindow(timestamp, Math.max(30, template.steps.length * 12), createWindowId(template.templateId, template.templateId));

const clampRiskTolerance = (riskTolerance: number): ScenarioBudget['riskTolerance'] => {
  if (riskTolerance <= 0) return 0;
  if (riskTolerance === 1) return 1;
  if (riskTolerance === 2) return 2;
  if (riskTolerance === 3) return 3;
  if (riskTolerance === 4) return 4;
  return 5;
};

const buildTemplateState = (index: number): ScenarioState => (index % 2 === 0 ? 'active' : 'queued');

const buildWindows = (steps: readonly RecoveryStepTemplate[]): readonly RecoveryPlanWindow[] =>
  steps.map((step, index) => {
    const startMinute = index * Math.max(1, step.estimatedMinutes);
    const confidenceSeed = step.stepType.length + step.preconditions.length * 5;
    const riskSeed = Math.min(100, step.estimatedMinutes * 4 + step.sideEffects.length * 8);
    return buildPlanWindow(startMinute, Math.max(5, step.estimatedMinutes), riskSeed + confidenceSeed);
  });

const buildBudget = (windows: readonly RecoveryPlanWindow[], template: RecoveryScenarioTemplate): ScenarioBudget => {
  const windowMinutes = windows.reduce((sum, window) => sum + (window.endMinute - window.startMinute), 0);
  const riskTotal = windows.reduce((sum, window) => sum + window.riskScore, 0);
  return {
    maxParallelism: Math.max(1, Math.min(6, template.steps.length + 1)),
    budgetMinutes: windowMinutes * 2 + 5,
    budgetCostUnits: Math.max(20, windowMinutes + riskTotal),
    riskTolerance: clampRiskTolerance(5 - Math.floor(riskTotal / 90)),
  };
};

const buildContext = (input: PlannerInput): IncidentContext => {
  const signalWindow = toSignalWindow(input.timestamp, input.templates[0] ?? ({} as RecoveryScenarioTemplate));
  return {
    tenantId: input.tenantId,
    incidentId: `${input.tenantId}:${input.incidentId}` as IncidentId,
    ownerTeam: `${input.domain}-command`,
    services: [input.service],
    window: signalWindow,
    domains: [input.domain],
    runMode: 'staged',
  };
};

const buildCandidate = (input: PlannerInput, template: RecoveryScenarioTemplate, revision: PlanRevision): ScenarioCandidate => {
  const normalizedSignals = normalizeSignals(input.signals);
  const windows = buildWindows(template.steps);
  const budget = buildBudget(windows, template);
  return {
    scenarioId: `${input.tenantId}:${template.templateId}:${Date.now()}` as ScenarioCandidate['scenarioId'],
    tenantId: input.tenantId,
    context: {
      ...buildContext(input),
      services: template.targets,
    },
    planWindow: buildPlanWindow(0, windows.reduce((sum, window) => sum + (window.endMinute - window.startMinute), 0), budget.riskTolerance * 12),
    template: {
      ...template,
      state: buildTemplateState(input.signals.length),
      signals: normalizedSignals.map((signal) => signal.signal),
      steps: template.steps,
    },
    revision,
    budget,
    generatedAt: new Date().toISOString(),
  };
};

const buildChecks = (candidate: ScenarioCandidate): SimulationEnvelope['checks'] => [
  {
    candidateId: candidate.scenarioId,
    passed: candidate.budget.maxParallelism >= 1,
    blockedReasons: candidate.budget.maxParallelism <= 0 ? ['zero-parallelism'] : [],
    warnings: candidate.budget.riskTolerance >= 3 ? ['aggressive-tolerance'] : ['safe-tolerance'],
  },
  {
    candidateId: candidate.scenarioId,
    passed: candidate.template.steps.length > 0,
    blockedReasons: candidate.template.steps.length === 0 ? ['missing-steps'] : [],
    warnings: candidate.template.steps.length > 5 ? ['dense-plan'] : ['compact-plan'],
  },
];

export const composeCandidates = (input: PlannerInput): CandidateSelection => {
  const templates = input.templates.length > 0 ? input.templates : [];
  const candidates = templates.map((template, index) =>
    buildCandidate(input, template, createPlanRevision(index + 1)),
  );

  const prioritized = [...candidates].sort((left, right) => right.planWindow.riskScore - left.planWindow.riskScore);

  const envelopes = prioritized.map((candidate): SimulationEnvelope => ({
    id: `${candidate.scenarioId}:envelope`,
    revision: candidate.revision,
    candidate,
    traces: candidate.template.targets.map((target) => ({
      when: candidate.generatedAt,
      component: 'scenario-planner',
      message: `${candidate.scenarioId}:target:${target}`,
      tags: { service: target, template: candidate.template.templateId },
      correlationId: `${candidate.scenarioId}`,
    })),
    windows: buildWindows(candidate.template.steps),
    checks: buildChecks(candidate),
  }));

  return {
    tenantId: input.tenantId,
    selected: prioritized,
    envelopes,
    reason: templates.length === 0 ? 'no-templates' : 'candidate-space-ready',
  };
};

export const prioritizeCandidates = (candidates: readonly ScenarioCandidate[]): readonly ScenarioCandidate[] =>
  [...candidates].sort((left, right) => {
    const leftScore = left.planWindow.confidence;
    const rightScore = right.planWindow.confidence;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    return right.budget.budgetCostUnits - left.budget.budgetCostUnits;
  });

export const buildSimulationEnvelope = (candidate: ScenarioCandidate): SimulationEnvelope => ({
  id: `${candidate.scenarioId}:single`,
  revision: candidate.revision,
  candidate,
  traces: [
    {
      when: new Date().toISOString(),
      component: 'planner',
      message: `build:${candidate.scenarioId}`,
      tags: { tenant: candidate.tenantId, state: candidate.template.state },
      correlationId: `${candidate.tenantId}:${candidate.scenarioId}`,
    },
  ],
  windows: buildWindows(candidate.template.steps),
  checks: buildChecks(candidate),
});

export const recomposeAndPrioritize = (input: PlannerInput): CandidateSelection => {
  const base = composeCandidates(input);
  return {
    ...base,
    selected: prioritizeCandidates(base.selected),
    reason: `${base.reason}:${base.selected.length}`,
  };
};
