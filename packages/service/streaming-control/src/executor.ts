import {
  executePluginChain,
  StreamingPluginContext,
} from '@domain/streaming-observability';
import {
  PluginTraceId,
  PolicyPluginInput,
  SignalNormalizationInput,
  STREAMING_POLICY_PLUGIN_STACK,
  StreamPolicyDecisionRecord,
  collectPolicyDecision,
} from '@domain/streaming-observability';
import { withBrand } from '@shared/core';
import type { StreamingControlRequest } from './control';

export interface PolicyExecutionInput extends PolicyPluginInput {
  readonly streamId: string;
}

export interface PolicyExecutionResult {
  readonly traceId: PluginTraceId;
  readonly policy: StreamPolicyDecisionRecord;
}

export const executePolicyChain = async (
  request: StreamingControlRequest,
  context: StreamingPluginContext,
): Promise<PolicyExecutionResult> => {
  const seed: PolicyPluginInput = {
    streamId: request.streamId,
    events: request.events,
  };

  const output = await executePluginChain(
    STREAMING_POLICY_PLUGIN_STACK,
    seed satisfies SignalNormalizationInput,
    context,
  );

  const policy = collectPolicyDecision(output);

  return {
    traceId: withBrand(`${request.streamId}::policy`, 'StreamingPluginTraceId'),
    policy,
  };
};

export const deriveSignalPolicy = (
  executions: readonly PolicyExecutionResult[],
): readonly [StreamPolicyDecisionRecord, string] => {
  const joinedWarnings = executions.flatMap((execution) => execution.policy.warnings);
  const first = executions[0];
  if (!first) {
    return [
      {
        pluginName: 'policy-decider',
        streamId: '',
        severityLevel: 'ok',
        recommendedScale: 1,
        warnings: [],
      },
      'policy stack empty',
    ] as const;
  }
  const score = joinedWarnings.length;
  const normalized = score > 0 ? `${score} warnings` : 'stable';
  return [first.policy, normalized] as const;
};
