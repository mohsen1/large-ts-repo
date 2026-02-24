import {
  createGraphId,
  createInputRunId,
  createNodeId,
  createOutputWithPayload,
  createOperatorId,
  createSignalEndpoint,
  createSignalId,
  createTenantId,
  type IntentChannel,
  type IntentExecutionResult,
  type IntentInput,
  type IntentNodeConfig,
  type IntentNodePayload,
  type IntentPolicy,
  type IntentRunId,
  type IntentSignalId,
  type IntentStage,
  type IntentTelemetry,
  type PluginContract,
} from './types';

const fallbackInput = (value: unknown): IntentInput => {
  const bag = (value ?? {}) as Partial<IntentInput>;
  return {
    graphId: createGraphId(typeof bag.graphId === 'string' ? bag.graphId : 'graph:bootstrap'),
    runId: typeof bag.runId === 'string' ? createInputRunId(bag.runId) : createInputRunId('intent-run:bootstrap'),
    tenant: createTenantId(typeof bag.tenant === 'string' ? bag.tenant : 'tenant:bootstrap'),
    signalId: typeof bag.signalId === 'string' ? createSignalId(bag.signalId) : createSignalId('signal:bootstrap'),
    requestedBy:
      typeof bag.requestedBy === 'string' ? createOperatorId(bag.requestedBy) : createOperatorId('operator:bootstrap'),
    mode: bag.mode === 'auto' || bag.mode === 'manual' || bag.mode === 'scheduled' || bag.mode === 'emergency'
      ? bag.mode
      : 'auto',
  };
};

export const parseNodeConfig = (payload: unknown): IntentNodeConfig => {
  const bag = (payload ?? {}) as Partial<IntentNodeConfig>;
  const graphId = createGraphId(typeof bag.graphId === 'string' ? bag.graphId : 'graph:bootstrap');
  return {
    graphId,
    nodeId: createNodeId(graphId, typeof bag.nodeId === 'string' ? bag.nodeId : 'bootstrap'),
    kind: (typeof bag.kind === 'string' && (bag.kind === 'capture' || bag.kind === 'normalize' || bag.kind === 'score' || bag.kind === 'recommend' || bag.kind === 'simulate' || bag.kind === 'resolve'))
      ? bag.kind
      : 'capture',
    stageLabel: 'CAPTURE_STAGE',
    payload: {
      kind: typeof bag.payload === 'object' && bag.payload && (bag.payload as IntentNodePayload).kind
        ? (bag.payload as IntentNodePayload).kind
        : 'capture',
      weight: typeof (bag.payload as IntentNodePayload | undefined)?.weight === 'number'
        ? (bag.payload as IntentNodePayload).weight
        : 1,
    },
    timeoutMs: typeof bag.timeoutMs === 'number' ? bag.timeoutMs : 500,
    retries: typeof bag.retries === 'number' ? bag.retries : 1,
    metadata: {
      owner:
        typeof bag.metadata?.owner === 'string'
          ? createOperatorId(bag.metadata.owner)
          : createOperatorId('operator:bootstrap'),
      createdAt: bag.metadata?.createdAt instanceof Date ? bag.metadata.createdAt : new Date(),
      labels: Array.isArray(bag.metadata?.labels) ? bag.metadata.labels.map((item) => String(item)) : ['bootstrap'],
      labelsByStage: {
        capture: ['capture'],
        normalize: ['normalize'],
        score: ['score'],
        recommend: ['recommend'],
        simulate: ['simulate'],
        resolve: ['resolve'],
      },
    },
  };
};

export const parseIntentInput = (payload: unknown): IntentInput => fallbackInput(payload);

export const parseIntentResult = (payload: unknown): IntentExecutionResult => {
  const bag = (payload ?? {}) as Partial<IntentExecutionResult>;
  const input = fallbackInput({ runId: createInputRunId('intent-run:bootstrap'), graphId: 'graph:bootstrap' });
  return {
    runId: createInputRunId(typeof bag.runId === 'string' ? bag.runId : input.runId),
    graphId: createGraphId(typeof bag.graphId === 'string' ? bag.graphId : input.graphId),
    tenant: createTenantId(typeof bag.tenant === 'string' ? bag.tenant : input.tenant),
    ok: bag.ok === true,
    confidence: typeof bag.confidence === 'number' ? bag.confidence : 0,
    recommendations: Array.isArray(bag.recommendations) ? bag.recommendations.map(String) : ['default'],
  };
};

export const parseTelemetry = (payload: unknown): IntentTelemetry => {
  const bag = (payload ?? {}) as Partial<IntentTelemetry>;
  const input = fallbackInput({ runId: 'intent-run:bootstrap', graphId: 'graph:bootstrap' });
  const timings = typeof bag.stageTimings === 'object' && bag.stageTimings !== null ? (bag.stageTimings as Record<string, unknown>) : {};
  return {
    runId: createInputRunId(typeof bag.runId === 'string' ? bag.runId : input.runId),
    graphId: createGraphId(typeof bag.graphId === 'string' ? bag.graphId : input.graphId),
    nodeId: createNodeId(createGraphId(typeof bag.graphId === 'string' ? bag.graphId : input.graphId), `${bag.nodeId ?? 'bootstrap'}`),
    tenant: createTenantId(typeof bag.tenant === 'string' ? bag.tenant : input.tenant),
    elapsedMs: typeof bag.elapsedMs === 'number' ? bag.elapsedMs : 0,
    stageTimings: {
      capture: typeof timings.capture === 'number' ? timings.capture : 0,
      normalize: typeof timings.normalize === 'number' ? timings.normalize : 0,
      score: typeof timings.score === 'number' ? timings.score : 0,
      recommend: typeof timings.recommend === 'number' ? timings.recommend : 0,
      simulate: typeof timings.simulate === 'number' ? timings.simulate : 0,
      resolve: typeof timings.resolve === 'number' ? timings.resolve : 0,
    },
  };
};

export const parsePolicy = (
  payload: unknown,
): IntentPolicy<PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]> => {
  const bag = (payload ?? {}) as Partial<{
    id: string;
    tenant: string;
    channel: string;
    steps: readonly IntentStage[];
    plugins: readonly PluginContract[];
  }>;
  return {
    id: createGraphId(typeof bag.id === 'string' ? bag.id : 'graph:bootstrap'),
    tenant: createTenantId(typeof bag.tenant === 'string' ? bag.tenant : 'tenant:bootstrap'),
    channel: createSignalEndpoint(createTenantId(typeof bag.channel === 'string' ? bag.channel : 'tenant:bootstrap')),
    steps: bag.steps ?? ['capture', 'normalize', 'score'],
    plugins: (Array.isArray(bag.plugins) ? bag.plugins : []) as PluginContract<
      IntentStage,
      IntentNodePayload,
      IntentNodePayload
    >[],
  };
};

const seedInput = fallbackInput({
  graphId: 'graph:bootstrap',
  runId: 'intent-run:bootstrap',
  tenant: 'tenant:bootstrap',
  signalId: 'signal:bootstrap',
  requestedBy: 'operator:bootstrap',
  mode: 'auto',
});

const seedOutput = createOutputWithPayload(
  {
    input: seedInput,
    nodeId: createNodeId(seedInput.graphId, 'bootstrap'),
    payload: { kind: 'capture', weight: 1 },
    recommendations: ['seed'],
  },
  100,
  5,
);

export const schemaManifest = {
  policy: parsePolicy,
  nodeConfig: parseNodeConfig,
  intentInput: parseIntentInput,
  intentResult: parseIntentResult,
  telemetry: parseTelemetry,
} as const;

export const schemaSatisfies = {
  manifest: schemaManifest,
  sample: {
    input: seedInput,
    output: seedOutput.ok ? seedOutput.output : seedInput,
  },
} as const;
