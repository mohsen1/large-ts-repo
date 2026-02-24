import { z } from 'zod';
import { NoInfer } from '@shared/type-level';
import { withBrand } from '@shared/core';
import {
  createClock,
  createLabId,
  createPlanId,
  createScenarioId,
  type IncidentLabPlan,
  type IncidentLabScenario,
  type LabTemplateStep,
  type StepId,
} from './types';
import {
  type CommandRunbook,
  type WorkloadTarget,
  type RecoverySignal,
  type SignalClass,
  createWorkloadId,
  type CommandStepId,
} from '@domain/recovery-stress-lab';
import { type StudioLaneKind, type StudioLaneKind as LaneKind } from './incident-studio-types';

export const workloadAdapterSchema = z
  .object({
    tenantId: z.string().min(1),
    runbookIds: z.array(z.string().min(1)).default([]),
    runAt: z.string().min(1),
    lanes: z.array(z.string().min(1)).default([]),
  })
  .passthrough();

export interface WorkloadAdapterState {
  readonly tenantId: string;
  readonly runbookIds: readonly string[];
  readonly runAt: string;
  readonly lanes: readonly LaneKind[];
}

export interface WorkloadMapRecord {
  readonly runbookId: string;
  readonly workloadCount: number;
  readonly lane: LaneKind;
  readonly updatedAt: string;
}

type LaneSet<TTargets extends readonly WorkloadTarget[]> = {
  readonly [K in keyof TTargets]: TTargets[K];
};

export const toTopologyRoute = <TTargets extends readonly WorkloadTarget[]>(input: NoInfer<TTargets>): LaneSet<TTargets> => {
  const ordered = [...input].toSorted((left, right) => String(left.workloadId).localeCompare(String(right.workloadId)));
  return ordered as LaneSet<TTargets>;
};

const toStepId = (seed: string): StepId => withBrand(seed, 'StepId');
const stepOwner = (seed: string) => withBrand(seed, 'ActorId');

const toLabStep = (runbook: CommandRunbook, stepIndex: number, step: CommandRunbook['steps'][number]): LabTemplateStep => ({
  id: toStepId(`${String(runbook.id)}:${String(step.commandId)}:${stepIndex}`),
  label: step.title,
  command: `${runbook.name}:${step.phase}`,
  expectedDurationMinutes: step.estimatedMinutes,
  dependencies: step.prerequisites.map((entry: CommandStepId) => toStepId(`${String(entry)}:${stepIndex}:dep`)),
  constraints: [
    {
      key: 'estimatedMinutes',
      operator: 'gt',
      value: step.estimatedMinutes,
    },
  ],
  owner: stepOwner(`${runbook.ownerTeam}:${String(runbook.id)}`),
});

const asLaneWeights = (lanes: readonly StudioLaneKind[]): Record<LaneKind, number> =>
  lanes.reduce<Record<LaneKind, number>>((acc, lane) => {
    const base = String(lane).length;
    acc[lane] = Math.max(1, (base % 4) + 1);
    return acc;
  }, {} as Record<LaneKind, number>);

export const buildTemplateSteps = (runbook: CommandRunbook): readonly LabTemplateStep[] =>
  runbook.steps.map((step, index) => toLabStep(runbook, index, step));

const signalWeight = (signal: SignalClass): number => {
  switch (signal) {
    case 'availability':
      return 3;
    case 'integrity':
      return 2;
    case 'performance':
      return 1;
    case 'compliance':
      return 2;
  }
};

const severityFromSignals = (signals: readonly RecoverySignal[]): IncidentLabScenario['severity'] => {
  const severity = signals.reduce((acc, signal) => Math.max(acc, ['low', 'medium', 'high', 'critical'].indexOf(signal.severity)), 0);
  return ['low', 'medium', 'high', 'critical'][Math.min(3, Math.max(0, severity))] as IncidentLabScenario['severity'];
};

export const buildScenarioTemplate = (input: {
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly lanes: readonly LaneKind[];
}): {
  readonly scenario: IncidentLabScenario;
  readonly topology: readonly WorkloadTarget[];
  readonly laneWeights: Record<LaneKind, number>;
} => {
  const normalizedSignals = [...input.signals].toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
  const laneWeights = asLaneWeights(
    input.lanes.length > 0
      ? input.lanes
      : ['control', 'compute', 'storage', 'network', 'safety', 'policy'] as const,
  );

  if (input.runbooks.length === 0) {
    return {
      scenario: {
        id: createScenarioId('incident-studio-empty'),
        labId: createLabId('studio-lab-default'),
        name: 'studio-fallback',
        createdBy: 'incident-lab-core',
        severity: 'low',
        topologyTags: ['fallback'],
        steps: [],
        estimatedRecoveryMinutes: 5,
        owner: 'incident-lab-core',
        labels: ['fallback'],
      },
      topology: [],
      laneWeights: laneWeights as Record<LaneKind, number>,
    };
  }

  const ranked = [...input.runbooks].toSorted((left, right) => right.steps.length - left.steps.length + signalWeight(input.signals[0]?.class ?? 'availability'));
  const [lead] = ranked;

  if (!lead) {
    return {
      scenario: {
        id: createScenarioId('incident-studio-empty'),
        labId: createLabId('studio-lab-default'),
        name: 'studio-fallback',
        createdBy: 'incident-lab-core',
        severity: 'low',
        topologyTags: ['fallback'],
        steps: [],
        estimatedRecoveryMinutes: 5,
        owner: 'incident-lab-core',
        labels: ['fallback'],
      },
      topology: [],
      laneWeights: laneWeights as Record<LaneKind, number>,
    };
  }

  const steps = ranked.flatMap((runbook) => buildTemplateSteps(runbook));
  const topology = ranked.map((runbook): WorkloadTarget => {
    const workloadId = createWorkloadId(`${String(runbook.id)}:topology`);
    return {
      tenantId: runbook.tenantId,
      workloadId,
      commandRunbookId: runbook.id,
      name: runbook.name,
      criticality: ((lead.steps.length % 5) + 1) as WorkloadTarget['criticality'],
      region: 'us-east-1',
      azAffinity: ['a', 'b', 'c'],
      baselineRtoMinutes: Math.max(1, Math.round(runbook.steps.length * 1.25)),
      dependencies: [createWorkloadId(`${String(lead.id)}:base`)],
    };
  });

  const scenario: IncidentLabScenario = {
    id: createScenarioId(String(lead.id)),
    labId: createLabId(`studio-${String(lead.tenantId)}`),
    name: `studio-scenario-${lead.name}`,
    createdBy: String(lead.tenantId),
    severity: severityFromSignals(normalizedSignals),
    topologyTags: ['workload', 'incident-lab', ...normalizedSignals.map((signal) => signal.class)],
    steps,
    estimatedRecoveryMinutes: Math.max(2, normalizedSignals.length + lead.steps.length + ranked.length),
    owner: lead.ownerTeam,
    labels: ['workload', ...input.lanes],
  };

  return {
    scenario,
    topology,
    laneWeights: laneWeights as Record<LaneKind, number>,
  };
};

export const buildScenarioFromRunbooks = (input: {
  readonly tenantId: string;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly lanes: readonly LaneKind[];
}): IncidentLabPlan => {
  const orderedRunbooks = [...input.runbooks].toSorted((left, right) => left.name.localeCompare(right.name));
  const queue: readonly StepId[] = orderedRunbooks.flatMap((runbook, index) => [toStepId(`${String(runbook.id)}:${index}`)]);
  const selected = queue.toReversed();
  const estimatedRecoveryMinutes = Math.max(1, input.signals.length + queue.length);
  const state = severityFromSignals(input.signals) === 'critical' ? 'active' : 'ready';

  return {
    id: createPlanId(createScenarioId(input.tenantId)),
    scenarioId: createScenarioId(input.tenantId),
    labId: createLabId(`studio-${input.tenantId}`),
    selected,
    queue,
    state,
    orderedAt: new Date().toISOString(),
    scheduledBy: input.runbooks[0]?.ownerTeam ?? 'incident-lab-studio',
  };
};

export const normalizeWorkloadState = <T extends WorkloadMapRecord[]>(
  entries: readonly [...T],
): Record<string, WorkloadMapRecord> => {
  const result = entries.reduce<Record<string, WorkloadMapRecord>>((acc, entry) => {
    acc[`lane:${String(entry.runbookId)}`] = entry;
    return acc;
  }, {});

  return result;
};

export const summarizeWorkloadTarget = (target: WorkloadTarget): { readonly workload: string; readonly tags: string } => ({
  workload: String(target.workloadId),
  tags: `${target.criticality}:${target.region}:${target.azAffinity.length}`,
});

export const resolveTopologySignatures = (topology: readonly WorkloadTarget[]): readonly string[] =>
  topology
    .map((entry) => withBrand(`${String(entry.tenantId)}:${String(entry.workloadId)}:${entry.commandRunbookId}`, 'TopologyId'))
    .filter((entry, index, all) => all.indexOf(entry) === index);
