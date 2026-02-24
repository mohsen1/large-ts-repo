import {
  type IncidentContext,
  type IncidentIntentManifest,
  type IncidentIntentPolicy,
  type IncidentIntentPlan,
  type IncidentIntentRoute,
  type IntentNodeId,
  type IncidentIntentSignal,
  type IncidentIntentStepInput,
  type IncidentIntentStepOutput,
  type IntentStatus,
  type IncidentTenantId,
  type IncidentIntentTuple,
  createIntentRunId,
  createIntentStepId,
  createIncidentTenantId,
} from './types';
import { IntentTopologyGraph, topologyStatsTuple } from './topology';
import { buildPolicy, planFromSignals } from './policy';
import { describeRoute } from './types';

export interface OrchestrationWindow {
  readonly from: string;
  readonly to: string;
}

export interface OrchestrationInput {
  readonly tenantId: IncidentTenantId;
  readonly context: IncidentContext;
  readonly signals: readonly IncidentIntentSignal[];
  readonly policies: readonly IncidentIntentPolicy[];
  readonly window: OrchestrationWindow;
}

export interface OrchestrationOutput {
  readonly runId: string;
  readonly tenantId: IncidentTenantId;
  readonly status: IntentStatus;
  readonly topPlan: IncidentIntentPlan;
  readonly route: IncidentIntentRoute;
  readonly graphDepth: number;
  readonly snapshots: readonly IncidentIntentManifest[];
}

export interface OrchestrationRequest<TSignals extends readonly IncidentIntentSignal[]> {
  readonly tenantId: IncidentTenantId;
  readonly signals: TSignals;
  readonly policies: readonly IncidentIntentPolicy[];
  readonly context: IncidentContext;
  readonly window?: OrchestrationWindow;
}

export const createDefaultWindow = (): OrchestrationWindow => ({
  from: new Date(Date.now() - 5 * 60_000).toISOString(),
  to: new Date().toISOString(),
});

const rankInputPolicy = (policies: readonly IncidentIntentPolicy[]): readonly IncidentIntentPolicy[] => {
  const sorted = [...policies].toSorted((left, right) => right.weight.severity - left.weight.severity);
  return sorted.slice(0, 5);
};

const makePlanInput = (context: IncidentContext, signals: readonly IncidentIntentSignal[]): IncidentIntentStepInput => ({
  context,
  candidates: context.tags.map((tag) => ({
    kind: tag,
    confidence: Math.max(0, Math.min(1, context.tags.length / 4)),
    rationale: `context:${context.tenantId}:${tag}`,
  })),
  signals,
});

export const createRoute = (
  runId: string,
  tenantId: IncidentTenantId,
  steps: readonly string[],
): IncidentIntentRoute => ({
  runId: runId as IncidentIntentRoute['runId'],
  tenantId,
  steps: steps.map((step, index) => ({
    stepId: createIntentStepId(step, index),
    path: step,
    weight: Math.max(1, step.length),
    latencyMs: step.length,
    labels: { [step]: step },
  })),
});

export const toPolicyTuple = <T extends readonly IncidentIntentPolicy[]>(
  policies: T,
): IncidentIntentTuple<T> => (policies.length > 0
  ? policies
  : [buildPolicy({
    title: 'fallback',
    minimumConfidence: 0.5,
    tags: ['fallback'],
  })]) as unknown as IncidentIntentTuple<T>;

export const buildPolicies = (
  policyDefs: ReadonlyArray<{
    title: string;
    minimumConfidence: number;
    tags: Iterable<string>;
  }>,
): readonly IncidentIntentPolicy[] => policyDefs.map((policyDef) => buildPolicy(policyDef));

export const normalizeWindow = (input: OrchestrationWindow = createDefaultWindow()): OrchestrationWindow => ({
  from: input.from,
  to: input.to,
});

export const buildOrchestrationPlan = async <TSignals extends readonly IncidentIntentSignal[]>(
  input: OrchestrationRequest<TSignals>,
): Promise<OrchestrationOutput> => {
  const topPolicies = toPolicyTuple(input.policies);
  const policies = rankInputPolicy([...topPolicies]);
  const manifestNodes: IncidentIntentManifest[] = [];
  const graph = new IntentTopologyGraph({
    tenantId: input.tenantId,
    runId: createIntentRunId('run'),
    nodes: [],
    edges: [],
  });

  const stepInputs = makePlanInput(input.context, input.signals);
  const evaluated = policies.map((policy, index) => {
    const nodePlan = planFromSignals(stepInputs, policy);
    return {
      input: stepInputs,
      output: nodePlan,
      policy,
      stepId: createIntentStepId(policy.policyId as string, index),
    };
  });

  for (const entry of evaluated) {
    const manifestNode: IncidentIntentManifest = {
      catalogId: `orchestrator-${entry.stepId}` as IncidentIntentManifest['catalogId'],
      tenantId: input.tenantId,
      title: `${entry.policy.title} run`,
      summary: entry.policy.policyId as string,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      context: input.context,
    };
    manifestNodes.push(manifestNode);
    graph.upsertNode({
      id: `node-${entry.stepId}` as unknown as IntentNodeId,
      kind: 'collect',
      phase: 'analysis',
      status: 'running',
      description: `${entry.policy.title}`,
      weight: entry.output.durationMs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      meta: {
        owner: input.context.meta.owner,
        capabilities: [entry.policy.title],
        dependencies: [],
      },
    });
  }

  const statsTuple = topologyStatsTuple([graph]);
  const _stats = statsTuple[0];
  const route = createRoute(createIntentRunId('route'), input.tenantId, evaluated.map((entry) => entry.policy.policyId as string));
  const phases = evaluated.map(
    (entry): IncidentIntentPlan['phases'][number] => ({
      phase: 'analysis',
      input: {
        context: input.context,
        candidates: input.context.tags.map((tag) => ({ kind: tag, confidence: 0.5, rationale: 'init' })),
        signals: input.signals,
      },
      output: {
        generatedAt: new Date().toISOString(),
        stepId: entry.stepId,
        kind: 'collect',
        durationMs: entry.output.durationMs,
        status: 'queued',
        output: entry.output.output,
      },
      startedAt: new Date().toISOString(),
    }),
  );

  return {
    runId: createIntentRunId('orchestration'),
    tenantId: input.tenantId,
    status: input.context.affectedSystems.length === 0 ? 'failed' : 'running',
    topPlan: {
      runId: createIntentRunId('top'),
      tenantId: input.tenantId,
      phases: phases as IncidentIntentPlan['phases'],
      route: route.steps.map((step) => step.path),
    },
    route,
    graphDepth: _stats.maxDepth,
    snapshots: manifestNodes,
  };
};

export const executeOrchestration = async (tenantId: string): Promise<OrchestrationOutput> => {
  const tenant = createIncidentTenantId(tenantId);
  const context: IncidentContext = {
    tenantId: tenant,
    incidentId: `${tenant}-active`,
    startedAt: new Date().toISOString(),
    affectedSystems: ['api-gateway'],
    severity: 'p2',
    tags: ['boot', 'default'],
    meta: {
      tenantId: tenant,
      owner: 'ops',
      region: 'us-east',
      team: 'recovery',
    },
  };

  const policies = buildPolicies([
    {
      title: 'baseline-resilience',
      minimumConfidence: 0.6,
      tags: ['baseline', 'collect'],
    },
  ]);

  return buildOrchestrationPlan({
    tenantId: tenant,
    policies,
    context,
    signals: [
      {
        id: createIntentRunId('seed') as IncidentIntentSignal['id'],
        kind: 'telemetry',
        source: 'bootstrap',
        value: 1,
        unit: 'ratio',
        observedAt: new Date().toISOString(),
        labels: { source: 'bootstrap' },
      },
    ],
    window: createDefaultWindow(),
  });
};

export const describePlan = (manifest: OrchestrationOutput): string => {
  const report = manifest.snapshots
    .map((entry) => describeRoute([entry.title, ...entry.context.tags] as const))
    .join(' | ');
  return `${manifest.runId}: ${manifest.status} :: ${report}`;
};

export const normalizeInputSignals = (signals: readonly IncidentIntentSignal[]): readonly IncidentIntentSignal[] =>
  [...signals].toSorted((left, right) => right.observedAt.localeCompare(left.observedAt));

export const policyTuple = <T extends readonly IncidentIntentPolicy[]>(policies: T): IncidentIntentTuple<T> => {
  return toPolicyTuple(policies);
};
