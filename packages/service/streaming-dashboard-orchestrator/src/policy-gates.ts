import { StreamPolicyDecisionRecord, collectPolicyDecision } from '@domain/streaming-observability';
import { StreamingControlRequest, runPolicyControl } from '@service/streaming-control';
import { StreamingPluginCatalog, summarizeCatalog } from '@data/streaming-dashboard-store';
import { withBrand } from '@shared/core';
import { PluginTraceId } from '@domain/streaming-observability';

export interface PolicyGateResult {
  readonly accepted: boolean;
  readonly actionCount: number;
  readonly recommendedScale: number;
  readonly warnings: readonly string[];
  readonly summary: ReturnType<typeof summarizeCatalog>;
  readonly traceId: PluginTraceId;
}

export interface OrchestrationPolicyInput {
  readonly tenant: string;
  readonly streamId: string;
  readonly events: StreamingControlRequest['events'];
}

export const evaluatePolicyGate = async (input: OrchestrationPolicyInput): Promise<PolicyGateResult> => {
  const control = await runPolicyControl({
    tenant: input.tenant,
    streamId: input.streamId,
    events: input.events,
  });
  const summary = summarizeCatalog([
    {
      traceId: control.traceId,
      streamId: input.streamId,
      pluginName: 'policy-decider',
      policySeverity: control.policy.severityLevel,
      warnings: control.policy.warnings,
      executedAt: new Date().toISOString(),
    } as const,
  ]);
  const decision = collectPolicyDecision({
    streamId: control.policy.streamId,
    severityLevel: control.policy.severityLevel,
    recommendedScale: control.policy.recommendedScale,
    warnings: control.policy.warnings,
  });
  return {
    accepted: decision.severityLevel !== 'critical',
    actionCount: control.actions.length,
    recommendedScale: control.policy.recommendedScale,
    warnings: decision.warnings,
    summary,
    traceId: control.traceId,
  };
};

export const runWithPolicy = async (
  input: OrchestrationPolicyInput,
): Promise<PolicyGateResult> => {
  const catalog = new StreamingPluginCatalog();
  try {
    const decision = await evaluatePolicyGate(input);
    const severity: StreamPolicyDecisionRecord['severityLevel'] = decision.actionCount > 0 ? 'warning' : 'ok';
    catalog.record({
      traceId: controlTraceId(input.streamId),
      streamId: input.streamId,
      pluginName: 'policy-decider',
      policySeverity: severity,
      warnings: decision.warnings,
      executedAt: new Date().toISOString(),
    });
    return decision;
  } finally {
    await catalog[Symbol.asyncDispose]();
  }
};

const controlTraceId = (streamId: string): PluginTraceId => withBrand(`${streamId}::policy`, 'StreamingPluginTraceId');
