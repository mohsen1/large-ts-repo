import { buildExecutionPlan } from '@domain/recovery-orchestration';
import type {
  RecoverySignal,
  RunPlanSnapshot,
  RunSession,
} from '@domain/recovery-operations-models';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export type ExecutionState = 'pending' | 'ready' | 'running' | 'throttled' | 'blocked';

export interface ScheduledSegment {
  readonly stepId: string;
  readonly command: string;
  readonly timeoutMs: number;
  readonly requiredApprovals: number;
  readonly slot: number;
  readonly state: ExecutionState;
}

export interface PlanSchedule {
  readonly runId: RecoveryRunState['runId'];
  readonly planId: RunPlanSnapshot['id'];
  readonly programId: RecoveryProgram['id'];
  readonly segments: readonly ScheduledSegment[];
  readonly batchSize: number;
  readonly totalTimeoutMs: number;
  readonly canParallelize: boolean;
  readonly signalWindow?: RunSignalWindow;
  readonly readinessState?: ReadonlyArray<string>;
}

export interface ScheduleContext {
  readonly readinessState?: ReadonlyArray<string>;
  readonly approvals?: number;
  readonly signalPressure?: number;
  readonly maxConcurrency?: number;
}

const normalizePressure = (value?: number): number => {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Number(value.toFixed(3));
};

const inferState = (segmentIndex: number, approvals: number, signalPressure: number): ExecutionState => {
  if (signalPressure >= 9) return 'blocked';
  if (segmentIndex >= 3 && approvals > 0) return 'throttled';
  if (segmentIndex >= approvals) return 'ready';
  if (segmentIndex > 0 && signalPressure > 4) return 'pending';
  return 'running';
};

export interface RunSignalWindow {
  readonly minSeverity: number;
  readonly maxSeverity: number;
  readonly avgConfidence: number;
}

const aggregateSignalWindow = (signals: readonly RecoverySignal[]): RunSignalWindow => {
  const severityValues = signals.map((signal) => signal.severity).filter((value) => Number.isFinite(value));
  const confidenceValues = signals.map((signal) => signal.confidence).filter((value) => Number.isFinite(value));

  const minSeverity = severityValues.length ? Math.min(...severityValues) : 0;
  const maxSeverity = severityValues.length ? Math.max(...severityValues) : 0;
  const avgConfidence = confidenceValues.length
    ? confidenceValues.reduce((sum, confidence) => sum + confidence, 0) / confidenceValues.length
    : 0;

  return {
    minSeverity: Number(minSeverity.toFixed(2)),
    maxSeverity: Number(maxSeverity.toFixed(2)),
    avgConfidence: Number(avgConfidence.toFixed(3)),
  };
};

export const deriveSignalPressure = (signals: readonly RecoverySignal[]): number => {
  const window = aggregateSignalWindow(signals);
  const weighted = (window.maxSeverity - window.minSeverity) + (1 - window.avgConfidence) * 10;
  return normalizePressure(Math.max(1, weighted));
};

export const buildRunSchedule = (
  plan: RunPlanSnapshot,
  session: RunSession,
  context: ScheduleContext = {},
): PlanSchedule => {
  const rawPlan = buildExecutionPlan({
    runId: session.runId,
    program: plan.program,
    includeFallbacks: context.readinessState !== undefined,
  });

  const pressure = deriveSignalPressure(session.signals);
  const approvals = Math.max(0, context.approvals ?? 0);
  const maxConcurrency = context.maxConcurrency ?? rawPlan.batchSize;
  const signalWindow = aggregateSignalWindow(session.signals);

  const baseTimeout = rawPlan.sequence.reduce((sum, segment) => sum + segment.timeoutMs, 0);
  const segments: ScheduledSegment[] = rawPlan.sequence.map((segment, index) => ({
    stepId: segment.stepId,
    command: segment.command,
    timeoutMs: segment.timeoutMs,
    requiredApprovals: segment.requiredApprovals,
    slot: index + 1,
    state: inferState(index, approvals, pressure),
  }));

  const normalizedTimeout = Math.max(1, Math.round(baseTimeout / Math.max(1, maxConcurrency)));
  const canParallelize = rawPlan.canParallelize && pressure < 6 && approvals < 4;

  return {
    runId: session.runId,
    planId: plan.id,
    programId: plan.program.id,
    segments,
    batchSize: canParallelize ? Math.min(maxConcurrency, rawPlan.batchSize) : 1,
    totalTimeoutMs: normalizedTimeout,
    canParallelize,
    readinessState: context.readinessState,
    signalWindow,
  };
};
