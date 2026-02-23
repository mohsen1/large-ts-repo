import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { withBrand } from '@shared/core';
import {
  type FusionBundle,
  type FusionCommand,
  type FusionPlanRequest,
  type FusionPlanResult,
  type RawSignalEnvelope as FusionRawSignal,
  applyFusionSignals,
  coordinateFusionBundle,
} from '@domain/recovery-fusion-intelligence';
import {
  executeReadinessSimulation,
  type PipelineContext,
  type SimulationPlanInput,
} from '@domain/recovery-readiness-simulation';
import {
  type ReadinessPolicy,
  type ReadinessSignal,
  type ReadinessRunId,
  type RecoveryTargetId,
} from '@domain/recovery-readiness';

export interface RecoveryFusionConsoleOptions {
  readonly tenant: string;
  readonly initiatedBy: string;
  readonly correlationId: string;
}

export interface FusionWorkspaceState {
  readonly planId: string;
  readonly acceptedPlan: boolean;
  readonly riskBand: 'green' | 'amber' | 'red' | 'critical';
  readonly waveCount: number;
  readonly commandCount: number;
  readonly scheduleWindowCount: number;
}

interface CommandExecutionContext {
  readonly planId: string;
  readonly waveIds: readonly string[];
  readonly correlationId: string;
}

const toReadinessSeverity = (signal: { readonly severity: number; readonly source: string }): ReadinessSignal['severity'] => {
  if (signal.severity >= 4) return 'critical';
  if (signal.severity >= 3) return 'high';
  if (signal.severity >= 2) return 'medium';
  return 'low';
};

const toReadinessSignal = (runId: ReadinessRunId, rawSignal: FusionBundle['signals'][number], index: number): ReadinessSignal => {
  const signalId = withBrand(`${runId}:signal:${index}`, 'ReadinessSignalId');
  const targetId = withBrand(`${runId}:target:${rawSignal.source}`, 'RecoveryTargetId');
  return {
    signalId,
    runId,
    targetId,
    source: 'telemetry',
    name: `${rawSignal.source}:${rawSignal.id}`,
    severity: toReadinessSeverity(rawSignal),
    capturedAt: rawSignal.detectedAt,
    details: rawSignal.payload,
  };
};

const defaultPolicy = (tenant: string): ReadinessPolicy => ({
  policyId: `${tenant}:fusion-policy`,
  name: 'fusion-readiness',
  constraints: {
    key: 'fusion-default',
    minWindowMinutes: 15,
    maxWindowMinutes: 240,
    minTargetCoveragePct: 1,
    forbidParallelity: false,
  },
  allowedRegions: new Set(['global']),
  blockedSignalSources: [],
});

const buildReadinessInput = (
  options: RecoveryFusionConsoleOptions,
  request: FusionPlanRequest,
): Result<SimulationPlanInput, Error> => {
  const targetIds: readonly RecoveryTargetId[] = request.waves
    .flatMap((wave) => wave.commands.map((command) => `${command.id}`))
    .map((targetId) => withBrand(targetId, 'RecoveryTargetId'));

  if (targetIds.length === 0) {
    return fail(new Error('no-targets'));
  }

  const runId = withBrand(String(request.runId), 'ReadinessRunId');

  return ok({
    tenant: options.tenant,
    runId,
    draft: {
      runId,
      title: 'Fusion simulation draft',
      objective: 'fusion-readiness',
      owner: options.initiatedBy,
      targetIds: [...targetIds],
      directiveIds: [
        withBrand('readiness', 'ReadinessDirectiveId'),
        withBrand('fusion', 'ReadinessDirectiveId'),
      ],
    },
    policy: defaultPolicy(options.tenant),
    signals: request.signals.map((signal, index) => toReadinessSignal(runId, signal, index)),
    graph: {
      nodes: request.waves.flatMap((wave) => ([{
        id: wave.id,
        owner: 'sre',
        criticality: 3,
        region: 'global',
        expectedSignalsPerMinute: wave.readinessSignals.length + wave.commands.length + 1,
      }])),
      dependencies: request.waves
        .flatMap((wave, index) => wave.commands.map((command, commandIndex) => ({
          from: `${wave.id}:${command.id}`,
          to: `${wave.id}:${wave.commands[(commandIndex + 1) % wave.commands.length]?.id ?? command.id}`,
          reason: `wave-${index}`,
        })))
        .filter((dependency) => dependency.from !== dependency.to),
    },
    constraints: {
      maxSignalsPerWave: Math.max(8, request.waves.length * 4),
      maxParallelNodes: request.waves.length === 0 ? 1 : Math.min(6, request.waves.length),
      blackoutWindows: [],
      minWindowCoverage: 0.2,
      maxRiskScore: 17,
    },
    seed: Math.max(1, request.waves.length),
  });
};

const executeCommands = (commands: readonly FusionCommand[], context: CommandExecutionContext): string[] =>
  commands
    .filter((command) => command.waveId === context.planId || context.waveIds.includes(command.waveId))
    .map((command) => `${command.id}:${command.action}:${command.requestedAt ?? context.correlationId}`);

export const runRecoveryFusionConsole = async (
  options: RecoveryFusionConsoleOptions,
  request: FusionPlanRequest,
): Promise<Result<{
  readonly evaluation: FusionPlanResult;
  readonly simulationStatus: string;
  readonly commandInvocations: readonly string[];
}, Error>> => {
  if (request.waves.length === 0) {
    return fail(new Error('fusion-plan-empty'));
  }

  const coordinated = coordinateFusionBundle(request, {
    tenant: options.tenant,
    correlationId: options.correlationId,
    initiatedBy: options.initiatedBy,
  });
  if (!coordinated.ok) return fail(coordinated.error);

  const readinessInputResult = buildReadinessInput(options, request);
  if (!readinessInputResult.ok) return fail(readinessInputResult.error);

  const context: PipelineContext = {
    tenant: options.tenant,
    requestedBy: options.initiatedBy,
    mode: 'balanced',
  };

  const simulation = executeReadinessSimulation(readinessInputResult.value, context);
  if (!simulation.ok) return fail(simulation.error);

  const commandInvocations = executeCommands(request.waves.flatMap((wave) => wave.commands), {
    planId: request.planId,
    waveIds: coordinated.value.workspace.waves,
    correlationId: options.correlationId,
  });

  return ok({
    evaluation: coordinated.value.plan,
    simulationStatus: simulation.value.status,
    commandInvocations,
  });
};

export const applyFusionSignalsToBundle = (
  bundle: FusionBundle,
  signals: readonly FusionRawSignal[],
): Result<{
  readonly accepted: number;
  readonly rejected: number;
  readonly scheduledWaves: readonly string[];
}, Error> => {
  const result = applyFusionSignals(bundle, signals);
  if (!result.ok) return fail(result.error);
  return ok({
    accepted: result.value.accepted,
    rejected: result.value.rejected,
    scheduledWaves: result.value.scheduled,
  });
};

export const describeWorkspace = (state: FusionWorkspaceState): string[] => [
  `plan=${state.planId}`,
  `risk=${state.riskBand}`,
  `waves=${state.waveCount}`,
  `commands=${state.commandCount}`,
  `windows=${state.scheduleWindowCount}`,
  `accepted=${state.acceptedPlan}`,
];
