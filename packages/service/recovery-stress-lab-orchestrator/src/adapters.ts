import { InMemoryPersistence, ConsoleAuditSink } from '@domain/recovery-stress-lab';
import {
  StressLabDecision,
  StressLabEngineConfig,
  StressLabSession,
  StressLabDraft,
} from './types';
import { buildOrchestrationPlan, runSimulation } from './execution';
import {
  OrchestrationPlan,
  RecoverySignal,
  WorkloadTarget,
  WorkloadTopology,
  TenantId,
  DraftTemplate,
  RecoverySimulationResult,
  createRunbookId,
  pickTopSignals,
} from '@domain/recovery-stress-lab';

export interface OrchestratorInput {
  readonly tenantId: TenantId;
  readonly draft: StressLabDraft;
  readonly config: StressLabEngineConfig;
  readonly runbooks: readonly {
    id: string;
    title: string;
    steps: readonly unknown[];
    cadence: { weekday: number; windowStartMinute: number; windowEndMinute: number };
  }[];
  readonly targets: readonly WorkloadTarget[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
}

export interface ServiceAdapters {
  persistence: InMemoryPersistence;
  audit: ConsoleAuditSink;
}

const buildPlanTemplate = (
  draft: StressLabDraft,
  tenantId: TenantId,
  selectedRunbookIds: readonly string[],
): DraftTemplate => {
  return {
    tenantId,
    title: draft.name,
    band: draft.band,
    selectedRunbooks: selectedRunbookIds.map((value) => createRunbookId(value)),
    selectedSignals: [...draft.selectedSignals],
  };
};

export const buildDecisionFromInput = (input: OrchestratorInput): StressLabDecision => {
  const draftTemplate = buildPlanTemplate(input.draft, input.tenantId, input.config.selectedRunbooks);
  const commandRunbooks = input.runbooks.map((entry) => ({
    id: createRunbookId(entry.id),
    tenantId: input.tenantId,
    name: entry.title,
    description: `${entry.title} generated from orchestrator`,
    steps: [],
    ownerTeam: 'stress-lab-team',
    cadence: entry.cadence,
  }));

  const build = buildOrchestrationPlan({
    tenantId: input.tenantId,
    band: input.config.band,
    riskBias: input.config.profileHint,
    draft: draftTemplate,
    runbooks: commandRunbooks,
    topology: input.topology,
    signals: pickTopSignals(input.signals, 8),
  });

  if (!build.plan) {
    return { plan: null, simulation: null, errors: build.errors };
  }

  const simulation = runSimulation({
    tenantId: input.tenantId,
    band: input.config.band,
    selectedSignals: pickTopSignals(input.signals, 8),
    plan: build.plan,
    riskBias: input.config.profileHint,
  });

  return { plan: build.plan, simulation, errors: build.errors };
};

export const persistDecision = async (
  adapters: ServiceAdapters,
  tenantId: TenantId,
  decision: StressLabDecision,
): Promise<void> => {
  if (decision.plan) {
    await adapters.persistence.savePlan(tenantId, decision.plan);
  }
  if (decision.simulation) {
    await adapters.persistence.saveSimulation(tenantId, decision.simulation);
  }
};

export const buildSession = (
  tenantId: TenantId,
  decision: StressLabDecision,
): StressLabSession => {
  const commands = (decision.plan?.runbooks ?? []).flatMap((runbook) =>
    runbook.steps.map((step) => ({
      id: String(step.commandId),
      workloadId: String(runbook.id),
      command: `${step.phase}: ${step.title}`,
      priority: runbook.steps.length,
    })),
  );

  return {
    tenantId,
    runState: {
      tenantId,
      selectedBand: 'low',
      selectedSignals: pickTopSignals([], 0),
      plan: decision.plan,
      simulation: decision.simulation,
    },
    commands,
    selectedCommandIndex: 0,
  };
};

export const ensureSimulation = (
  existing: RecoverySimulationResult | null,
  candidate: RecoverySimulationResult,
): RecoverySimulationResult => {
  if (!existing) return candidate;
  if (candidate.riskScore >= existing.riskScore && candidate.slaCompliance >= existing.slaCompliance) {
    return candidate;
  }
  return existing;
};
