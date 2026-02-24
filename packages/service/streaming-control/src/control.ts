import { createTopology, plan, scale } from '@domain/streaming-engine';
import { StreamPlan } from '@domain/streaming-engine/planner';
import {
  buildTopologyDigest,
  PluginTraceId,
  StreamEventRecord,
  StreamingPluginContext,
  asStreamId,
  pluginTrace,
  asTenantId,
  StreamPolicyDecisionRecord,
  STREAMING_POLICY_PLUGIN_STACK,
} from '@domain/streaming-observability';
import { withBrand } from '@shared/core';
import { NoInfer, type Brand } from '@shared/type-level';
import { executePolicyChain as executePolicyChainInternal } from './executor';

export interface Command {
  type: 'start' | 'pause' | 'resume' | 'stop';
  stream: string;
}

export interface CommandResult {
  accepted: boolean;
  message: string;
}

export type ControlMode = 'adaptive' | 'conservative' | 'strict';
export type CommandScope = `command:${ControlMode}`;
export type ControlTrace = Brand<string, 'ControlTraceId'>;
export type StreamPolicyAction = {
  readonly streamId: string;
  readonly command: string;
  readonly level: 'ok' | 'warn' | 'critical';
};

export interface ControlSession {
  readonly mode: ControlMode;
  readonly traceId: ControlTrace;
  readonly streamId: string;
  readonly tenant: string;
  readonly createdAt: string;
  readonly pluginDigest: string;
}

export interface ControlOutput {
  readonly accepted: boolean;
  readonly message: string;
  readonly policy: StreamPolicyDecisionRecord;
  readonly actions: readonly StreamPolicyAction[];
  readonly traceId: PluginTraceId;
}

export interface StreamingControlRequest {
  readonly tenant: string;
  readonly streamId: string;
  readonly events: readonly StreamEventRecord[];
}

export interface StreamingControlResult extends ControlOutput {
  readonly session: ControlSession;
  readonly policyPlugins: readonly string[];
}

const createTraceId = (streamId: string): ControlTrace =>
  withBrand(`control:${streamId}:${Date.now()}`, 'ControlTraceId');

const buildCommandScope = (mode: ControlMode): CommandScope => `command:${mode}`;

const classifyCommand = (trace: StreamPolicyDecisionRecord): readonly StreamPolicyAction[] => {
  if (trace.severityLevel === 'critical') {
    return [
      { streamId: trace.streamId, command: 'scale-up', level: 'critical' },
      { streamId: trace.streamId, command: 'drain-workload', level: 'critical' },
    ];
  }
  if (trace.severityLevel === 'warning') {
    return [{ streamId: trace.streamId, command: 'rebalance', level: 'warn' }];
  }
  return [{ streamId: trace.streamId, command: 'observe', level: 'ok' }];
};

const createContext = (tenant: string, streamId: string): StreamingPluginContext => {
  const traceId = pluginTrace(streamId);
  return {
    tenant: asTenantId(tenant),
    streamId,
    traceId,
    scope: `policy-plugin:${streamId}`,
    startedAt: new Date().toISOString(),
    metadata: {
      stack: 'streaming-control',
      stackSize: 3,
    },
  };
};

const previewScale = (streamId: string): number => {
  const topology = createTopology(
    {
      id: asStreamId(streamId),
      partitions: [{ id: 'preview-p', startOffset: 0, endOffset: 1 }],
      createdAt: new Date(),
    },
    [
      { id: 'source', kind: 'source', options: { protocol: 'kinesis' } },
      { id: 'transform', kind: 'transform', options: { protocol: 'lambda' } },
      { id: 'sink', kind: 'sink', options: { protocol: 's3' } },
    ],
    [
      { from: 'source', to: 'transform' },
      { from: 'transform', to: 'sink' },
    ],
  );
  return plan(topology, { eventsPerSecond: 300, bytesPerSecond: 4_000 }).steps.reduce(
    (acc, step) => acc + step.parallelism,
    0,
  );
};

const actionState = (policy: StreamPolicyDecisionRecord): 'blocked' | 'cleared' =>
  policy.recommendedScale > 3 ? 'blocked' : 'cleared';

export function runCommand(cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'start':
      return { accepted: true, message: `starting ${cmd.stream}` };
    case 'pause':
      return { accepted: true, message: `pausing ${cmd.stream}` };
    case 'resume':
      return { accepted: true, message: `resuming ${cmd.stream}` };
    case 'stop':
      return { accepted: true, message: `stopped ${cmd.stream}` };
    default:
      return { accepted: false, message: 'unsupported command' };
  }
}

export function tune(plan: StreamPlan, factor: number): StreamPlan {
  return scale(plan, factor);
}

export const runPolicyControl = async (
  request: StreamingControlRequest,
  mode: NoInfer<ControlMode> = 'adaptive',
): Promise<StreamingControlResult> => {
  const traceId = createTraceId(request.streamId);
  const context = createContext(request.tenant, request.streamId);
  const scope = buildCommandScope(mode);
  const pluginDigest = buildTopologyDigest(
    STREAMING_POLICY_PLUGIN_STACK.map((plugin) => ({
      nodeId: plugin.name,
      code: plugin.version,
      message: `${plugin.kind}/${plugin.scope}`,
      severity: 1,
    })),
  );

  const controlPlan = await executePolicyChainInternal(request, context);
  const baseScale = previewScale(request.streamId);
  const actions = [...classifyCommand(controlPlan.policy)];
  const ledger: string[] = [];

  using policyResource = {
    [Symbol.dispose]() {
      ledger.push('policy-resource-disposed');
    },
  };

  await using controlScope = {
    async [Symbol.asyncDispose]() {
      ledger.push(`command-${scope}`);
      ledger.push(`trace-${traceId}`);
      ledger.push(`policy-size-${STREAMING_POLICY_PLUGIN_STACK.length}`);
      if (baseScale > 3) {
        ledger.push('high-scale-adjusted');
      }
    },
  };

  const commandScale = Math.max(1, baseScale + (controlPlan.policy.recommendedScale ?? 0));
  const adjustedScale = scope === 'command:strict' ? Math.max(1, commandScale + 1) : commandScale;

  return {
    accepted: actionState(controlPlan.policy) !== 'blocked',
    message: `${scope} policy execution completed for ${request.streamId}; digest=${pluginDigest}; scale=${adjustedScale}; ledger=${ledger.length}`,
    policy: controlPlan.policy,
    actions,
    traceId: controlPlan.traceId,
    session: {
      mode,
      traceId,
      streamId: request.streamId,
      tenant: request.tenant,
      createdAt: context.startedAt,
      pluginDigest,
    },
    policyPlugins: STREAMING_POLICY_PLUGIN_STACK.map((plugin) => plugin.name),
  };
};
