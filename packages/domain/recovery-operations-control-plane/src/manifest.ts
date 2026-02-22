import type { Brand } from '@shared/type-level';
import { withBrand } from '@shared/core';
import type { RecoverySignal, RunPlanSnapshot, RunSession } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import { buildExecutionLayers, buildGraph, graphDiagnostics, scheduleWindowFromGraph } from './topology';
import { computeSchedule, type ScheduleOutput } from './scheduling';
import { buildConstraintMap, evaluateRunConstraints, summarizePolicyDecision } from './policy';
import type {
  ControlPlaneCheckpoint,
  ControlPlaneCommand,
  ControlPlaneConstraint,
  ControlPlaneManifest,
  ControlPlanePlan,
  ControlPlanePlanInput,
  ControlPlaneRunId,
} from './types';

const toTimelineEvent = (
  index: number,
  runId: string,
  stage: ControlPlaneCheckpoint['stage'],
  event: string,
): ControlPlaneManifest['timeline'][number] => ({
  at: new Date(Date.now() + index * 250).toISOString(),
  stage,
  event,
  tags: ['control-plane', runId],
});

const deriveStage = (index: number): ControlPlaneCheckpoint['stage'] =>
  index % 4 === 0 ? 'prepare' : index % 4 === 1 ? 'execute' : index % 4 === 2 ? 'verify' : 'closeout';

const commandFromStep = (index: number, stepId: string): ControlPlaneCommand => ({
  id: withBrand(`command:${index}:${stepId}`, 'ControlCommandId'),
  command: index % 2 === 0 ? 'deploy' : 'verify',
  runId: withBrand(stepId, 'ControlPlaneRunId'),
  stepId: stepId,
  createdAt: new Date(Date.now() + index * 1000).toISOString(),
  payload: {
    slot: index,
  },
});

const buildCheckpoints = (
  runId: ControlPlaneRunId,
  commands: readonly ControlPlaneCommand[],
): readonly ControlPlaneCheckpoint[] =>
  commands.map((command, index) => ({
    id: withBrand(`checkpoint:${String(runId)}:${index}`, 'ControlPlaneArtifactId'),
    runId,
    commandId: command.id,
    stage: deriveStage(index),
    status: index % 4 === 0 ? 'in-flight' : 'pending',
    startedAt: command.createdAt,
    details: {
      stepId: command.stepId,
      command: command.command,
    },
  }));

const calculateSignalDensity = (signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) return 0;
  return signals.reduce((acc, signal) => acc + signal.severity / 10, 0) / signals.length;
};

type BuiltUrgency = NonNullable<ControlPlanePlanInput['urgency']>;

const coerceUrgency = (input: ControlPlanePlanInput['urgency']): BuiltUrgency => {
  if (input === 'reactive' || input === 'defensive' || input === 'planned') {
    return input;
  }
  return 'planned';
};

const buildPlanTimeline = (
  runId: ControlPlaneRunId,
  scheduleWindows: readonly { startsAt: string; endsAt: string; label: string }[],
  ): readonly ControlPlaneManifest['timeline'][number][] =>
  scheduleWindows.map((window, index) =>
    toTimelineEvent(index, String(runId), deriveStage(index), `${window.label}:${window.startsAt}:${window.endsAt}`),
  );

export const buildPlanBlueprint = (input: ControlPlanePlanInput): ControlPlanePlan => {
  const graph = buildGraph(input.program, { maxDepth: 24, maxWeight: 12, disallowCycles: true });
  const diagnostics = graphDiagnostics(input.program, graph);
  const layers = buildExecutionLayers(graph);
  const cadenceMinutes = Math.max(1, Math.min(30, Math.floor(60 / Math.max(diagnostics.parallelism, 1))));

  const schedule = computeSchedule({
    runId: withBrand(`${input.runId}-${Date.now()}`, 'ControlPlaneRunId'),
    program: input.program,
    timezone: 'UTC',
    minimumCadenceMinutes: cadenceMinutes,
    maxConcurrent: diagnostics.parallelism ? Math.floor(diagnostics.parallelism) : 2,
  });

  const commands = layers
    .flat()
    .map((stepId, index) => commandFromStep(index, String(stepId)));
  const graphWindows = scheduleWindowFromGraph(graph, Math.max(1, Math.floor(cadenceMinutes / 2)));

  return {
    id: withBrand(`${input.runId}-${Date.now()}`, 'ControlPlaneRunId'),
    programId: input.program.id,
    snapshotId: input.snapshot.id,
    commands,
    graph,
    gates: graphWindows.windows.map((window) => window.label),
    window: {
      from: graphWindows.windows[0]?.startsAt ?? new Date().toISOString(),
      to: graphWindows.windows.at(-1)?.endsAt ?? new Date().toISOString(),
      timezone: 'UTC',
    },
  };
};

export const buildManifest = async (
  runId: string,
  planInput: ControlPlanePlanInput,
  signals: readonly RecoverySignal[],
): Promise<ControlPlaneManifest> => {
  const runBrand = withBrand(runId, 'ControlPlaneRunId');
  const createdAt = new Date().toISOString();
  const plan = buildPlanBlueprint(planInput);
  const schedule = computeSchedule({
    runId: runBrand,
    program: planInput.program,
    timezone: 'UTC',
    minimumCadenceMinutes: 5,
    maxConcurrent: 4,
  });

  const checkpoints = buildCheckpoints(runBrand, plan.commands);
  const timeline = buildPlanTimeline(runBrand, schedule.windows);
  const constraints: ControlPlaneConstraint[] = [
    {
      kind: 'strict',
      name: 'signal-density',
      limit: coerceUrgency(planInput.urgency) === 'reactive' ? 4 : 16,
      warningThreshold: 10,
    },
  ];
  const policyDecision = await evaluateRunConstraints(
    {
      tenant: planInput.tenant,
      run: {
        id: withBrand(`${runId}-session`, 'RunSessionId'),
        runId: withBrand(`${runId}-run`, 'RecoveryRunId'),
        ticketId: withBrand(`${runId}-ticket`, 'RunTicketId'),
        planId: planInput.runId,
        status: 'queued',
        createdAt,
        updatedAt: createdAt,
        constraints: {
          maxParallelism: planInput.program.steps.length,
          maxRetries: 3,
          timeoutMinutes: 120,
          operatorApprovalRequired: coerceUrgency(planInput.urgency) === 'reactive',
        },
        signals,
      },
      signals,
      constraints,
      urgency: coerceUrgency(planInput.urgency),
    },
    buildConstraintMap([
      (context) => calculateSignalDensity(context.signals) < 2.2,
      (context) => context.run.constraints.maxParallelism >= context.signals.length,
    ]),
  );

  const extraNotes = toTimelineEvent(
    timeline.length,
    runId,
    'verify',
    summarizePolicyDecision(policyDecision),
  );
  const densityWindow = buildPlanTimeline(runBrand, [
    {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
      label: `density:${calculateSignalDensity(signals)}`,
    },
  ])[0];

  return {
    envelopeId: withBrand(`${runId}-${Date.now()}`, 'ControlPlaneEnvelopeId'),
    tenant: planInput.tenant,
    run: runBrand,
    createdAt,
    updatedAt: new Date().toISOString(),
    plan,
    checkpoints,
    timeline: [
      ...timeline,
      extraNotes,
      densityWindow,
      toTimelineEvent(timeline.length + 2, runId, 'closeout', `policyAllowed=${String(policyDecision.allowed)}`),
    ],
  };
};

export const manifestFromSchedule = (
  planId: Brand<string, 'RunPlanId'>,
  schedule: ScheduleOutput,
): ControlPlaneManifest => {
  const now = new Date().toISOString();
  const manifestRunId = withBrand(`${String(schedule.runId)}-manifest`, 'ControlPlaneRunId');
  return {
    envelopeId: withBrand(`${String(schedule.runId)}-${Date.now()}`, 'ControlPlaneEnvelopeId'),
    tenant: 'default',
    run: manifestRunId,
    createdAt: now,
    updatedAt: now,
    plan: {
      id: withBrand(String(schedule.runId), 'ControlPlaneRunId'),
      programId: withBrand(`${String(planId)}-program`, 'RecoveryProgramId'),
      snapshotId: withBrand(String(planId), 'RunPlanId'),
      commands: [],
      graph: {
        runId: manifestRunId,
        nodes: [],
        edges: [],
        rootNodes: [],
        terminalNodes: [],
      },
      gates: schedule.windows.map((window) => window.label),
      window: {
        from: schedule.windows[0]?.startsAt ?? now,
        to: schedule.windows.at(-1)?.endsAt ?? now,
        timezone: 'UTC',
      },
    },
    checkpoints: schedule.windows.map((window, index) => ({
      id: withBrand(`${String(planId)}-${index}`, 'ControlPlaneArtifactId'),
      runId: manifestRunId,
      commandId: withBrand(`${String(schedule.runId)}-cmd-${index}`, 'ControlCommandId'),
      stage: deriveStage(index),
      status: index === 0 ? 'in-flight' : 'pending',
      startedAt: window.startsAt,
      details: { window },
    })),
    timeline: schedule.windows.map((window, index) => toTimelineEvent(index, String(manifestRunId), 'prepare', window.label)),
  };
};

export const planFromInput = (input: {
  runId: string;
  tenant: string;
  program: RecoveryProgram;
  snapshot: RunPlanSnapshot;
}): ControlPlanePlan => {
  return buildPlanBlueprint({
    runId: input.snapshot.id,
    program: input.program,
    snapshot: input.snapshot,
    window: {
      from: new Date(Date.now() - 30 * 60_000).toISOString(),
      to: new Date().toISOString(),
      timezone: 'UTC',
    },
    priority: input.program.priority,
    tenant: input.tenant,
    urgency: 'planned',
  });
};

export const manifestFromInput = async (input: {
  runId: string;
  tenant: string;
  program: RecoveryProgram;
  snapshot: RunPlanSnapshot;
  signals: readonly unknown[];
}): Promise<ControlPlaneManifest> => {
  const planInput = {
    runId: input.snapshot.id,
    program: input.program,
    snapshot: input.snapshot,
    window: {
      from: new Date(Date.now() - 30 * 60_000).toISOString(),
      to: new Date().toISOString(),
      timezone: 'UTC',
    },
    priority: input.program.priority,
    tenant: input.tenant,
    urgency: 'defensive' as const,
  };
  return buildManifest(input.runId, planInput, input.signals as RecoverySignal[]);
};
