import type { QuantumRunbook, PluginRuntimeFactory, PluginHost, QuantumPluginRuntime } from './types';
import type { Brand } from '@shared/type-level';
import { runbookPlan, createMinimalState, createPlanArtifact } from './planner';
import { buildPluginPayload, activatePlugins } from './catalog';

const defaultHostState = <T extends object>(tenant: string, state: T): T & { generatedAt: string } =>
  ({ ...state, generatedAt: new Date().toISOString() } as T & { generatedAt: string });

export interface RuntimeSnapshot {
  readonly tenant: string;
  readonly planId: string;
  readonly ready: boolean;
  readonly pluginCount: number;
}

export const buildRuntimeHostState = <TState extends object>(
  tenant: string,
  state: TState,
): PluginHost<TState & { generatedAt: string }> => ({
  tenant: `${tenant}:runtime` as any,
  state: defaultHostState<TState>(tenant, state as TState),
});

export const assembleRunbookRuntime = async (runbook: QuantumRunbook, pluginFactory?: PluginRuntimeFactory) => {
  const baselinePlan = runbookPlan(runbook.tenant, runbook);
  const artifact = createPlanArtifact({
    tenant: runbook.tenant,
    runbook,
    limit: Math.max(1, runbook.signals.length),
    state: baselinePlan.state,
  });
  const pluginPayload = await buildPluginPayload(runbook);
  const pluginState = await activatePlugins({
    tenant: runbook.tenant,
    runbook,
    policyMetadata: {
      kind: 'policy',
      namespace: 'recovery-quantum',
      version: 'v::1.0',
    },
    requestId: `${runbook.tenant}:request` as Brand<string, 'quantum-request-id'>,
    correlation: `${runbook.tenant}:corr` as Brand<string, 'quantum-correlation-id'>,
  });

  const hostState = buildRuntimeHostState(runbook.tenant, {
    baseline: {
      planState: baselinePlan.state,
      steps: baselinePlan.steps.length,
    },
    artifact,
    pluginCount: Object.keys(pluginPayload).length,
    pluginState: pluginState ?? {},
  });

  const runtime = pluginFactory
    ? pluginFactory(hostState as PluginHost<Record<string, unknown>>)
    : (async () => ({
        pluginId: `${runbook.tenant}:runtime` as QuantumPluginRuntime['pluginId'],
        payload: {
          pluginPayload,
          artifact,
          host: hostState,
        },
      }))();

  const ready = hostState.state.generatedAt.length > 0;
  const snapshot: RuntimeSnapshot = {
    tenant: runbook.tenant,
    planId: baselinePlan.id,
    ready,
    pluginCount: Object.keys(pluginPayload).length,
  };
  const minimal = createMinimalState(runbook.tenant);
  return {
    pluginFactoryUsed: await runtime,
    baselinePlan,
    artifact,
    snapshot,
    minimalState: minimal,
    details: {
      metadata: hostState.state.generatedAt,
      pluginKeys: Object.keys(pluginPayload),
      snapshot,
    },
  };
};
