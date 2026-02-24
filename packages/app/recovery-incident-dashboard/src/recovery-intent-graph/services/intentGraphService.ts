import {
  createGraphId,
  createInputRunId,
  createNodeId,
  createOperatorId,
  createSignalId,
  createTenantId,
  type IntentInput,
  type IntentNodePayload,
  type IntentOutput,
  type IntentPolicy,
  type IntentStage,
  type PluginContract,
  type IntentTelemetry,
} from '@domain/recovery-intent-graph';
import { IntentGraphEngine, createDefaultEngine, type EngineOutput } from '@service/recovery-intent-graph-orchestrator';
import type { PlanExecutionRequest } from '@service/recovery-intent-graph-orchestrator';

const bootstrapPolicy = (tenant: string): IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]> => ({
  id: createGraphId('bootstrap'),
  tenant: createTenantId(tenant),
  channel: `intent://intent.${tenant}`,
  steps: ['capture', 'normalize', 'score', 'recommend', 'simulate', 'resolve'],
  plugins: [],
});

const defaultEnginePromise = (async () => {
  const engine = await createDefaultEngine({
    tenant: 'tenant:dashboard',
    namespace: 'recovery-incident-dashboard',
    requestId: 'bootstrap',
  });
  return engine;
})();

const bootstrapInput = (tenant: string): IntentInput => ({
  graphId: createGraphId('bootstrap'),
  runId: createInputRunId('bootstrap'),
  tenant: createTenantId(tenant),
  signalId: createSignalId('bootstrap'),
  requestedBy: createOperatorId('operator:dashboard'),
  mode: 'auto',
});

export interface IntentGraphServiceResult {
  readonly id: string;
  readonly output: EngineOutput;
  readonly telemetry: readonly IntentTelemetry[];
  readonly outputs: readonly IntentOutput[];
}

const fallbackOutputs = (
  tenant: string,
  policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>,
  nodes: readonly IntentNodePayload[],
): readonly IntentOutput[] =>
  nodes.length === 0
    ? []
    : nodes.map((node, index) => ({
        runId: createInputRunId(`fallback:${index}`),
        graphId: policy.id,
        tenant: createTenantId(tenant),
        nodeId: createNodeId(policy.id, `${node.kind}:${index}`),
        score: 100 - index * 3,
        elapsedMs: (index + 1) * 120,
        recommendations: [`fallback:${node.kind}`],
      }));

export const runIntentGraph = async (
  plan: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>,
  nodes: readonly IntentNodePayload[],
): Promise<IntentGraphServiceResult> => {
  const engine = await defaultEnginePromise;
  const output = await engine.execute({
    policy: plan,
    nodes,
  });

  return {
    id: `${plan.id}:${Date.now()}`,
    output,
    telemetry: output.telemetry,
    outputs: output.outcome.ok ? output.outputs : fallbackOutputs('tenant:dashboard', plan, nodes),
  };
};

export const preparePlan = (
  tenant = 'tenant:dashboard',
): Promise<IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>> => {
  return Promise.resolve(bootstrapPolicy(tenant));
};

export const createContextNodes = (
  policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>,
): readonly IntentNodePayload[] =>
  policy.steps.map((step, index) => ({
    kind: step,
    weight: index + 1,
  }));
