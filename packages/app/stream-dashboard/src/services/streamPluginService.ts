import { NoInfer } from '@shared/type-level';
import { runPolicyControl, StreamPolicyAction, StreamingControlRequest, ControlMode } from '@service/streaming-control';
import { StreamEventRecord, StreamHealthSignal, StreamSlaWindow } from '@domain/streaming-observability';
import { runDashboardOrchestration, StreamDashboardContext, StreamIngestEvent } from './streamDashboardService';

export interface PolicyGovernanceSnapshot {
  readonly streamId: string;
  readonly policyScale: number;
  readonly policyMode: ControlMode;
  readonly warnings: readonly string[];
  readonly commandActions: readonly StreamPolicyAction[];
  readonly history: StreamSlaWindow[];
}

export interface PolicyGovernanceSnapshotResult {
  readonly planScale: number;
  readonly snapshot: {
    policyScale: number;
    streamId: string;
    mode: ControlMode;
    commands: readonly StreamPolicyAction[];
  };
  readonly signals: readonly StreamHealthSignal[];
  readonly history: StreamSlaWindow[];
}

const buildGovernanceContext = (context: StreamDashboardContext, request: StreamIngestEvent) => ({
  tenant: context.tenant,
  streamId: request.streamId,
  events: request.events,
});

const normalizePlan = (
  governance: Awaited<ReturnType<typeof runPolicyControl>>,
  streamId: string,
): PolicyGovernanceSnapshot => ({
  streamId,
  policyScale: governance.policy.recommendedScale,
  policyMode: governance.session.mode,
  warnings: governance.policy.warnings,
  commandActions: governance.actions,
  history: [],
});

export const runGovernanceOrchestration = async (
  context: StreamDashboardContext,
  request: StreamIngestEvent,
  mode: NoInfer<ControlMode> = 'adaptive',
): Promise<PolicyGovernanceSnapshotResult> => {
  const governance = await runPolicyControl(buildGovernanceContext(context, request), mode);
  const base = await runDashboardOrchestration(context, request);
  const snapshot = normalizePlan(governance, request.streamId);
  const commands = snapshot.commandActions;
  return {
    planScale: Math.max(snapshot.policyScale, Math.max(1, commands.length)),
    snapshot: {
      policyScale: snapshot.policyScale,
      streamId: snapshot.streamId,
      mode: snapshot.policyMode,
      commands,
    },
    signals: base.signals,
    history: base.history,
  };
};

export const runPolicyOnlyOrchestration = async (
  tenant: string,
  streamId: string,
  events: StreamEventRecord[],
): Promise<PolicyGovernanceSnapshot> => {
  const governance = await runPolicyControl({
    tenant,
    streamId,
    events,
  });
  return normalizePlan(governance, streamId);
};
