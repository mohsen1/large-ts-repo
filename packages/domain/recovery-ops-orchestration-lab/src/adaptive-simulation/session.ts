import { randomUUID } from 'node:crypto';
import {
  asPlanId,
  asSessionId,
  asRunId,
  buildSimulationEnvelope,
  buildSummary,
  normalizeTopology,
  type SimulationConfig,
  type SimulationEnvelope,
  type SimulationPlan,
  type SimulationPlanId,
  type SimulationResult,
  type SimulationRunId,
  type SimulationSessionId,
  type SimulationSignal,
  type SimulationTopology,
  type SimulationWindow,
} from './types';
import {
  appendCandidate,
  createSimulationEnvelopeResult,
  PipelinePhase,
  PipelineStage,
  runAdaptivePipeline,
  type AdaptivePipelineResult,
} from './pipeline';
import { AdaptivePluginRegistry, buildPluginsFromConfig } from './plugins';
import { buildGraphDiagnostics, buildSimulationGraph, summarizeGraph } from './graph';

export type SessionState = 'boot' | 'ready' | 'running' | 'complete' | 'failed';

export interface SessionRequest {
  readonly tenantId: string;
  readonly siteId: string;
  readonly topology: SimulationTopology;
  readonly signals: readonly SimulationSignal[];
  readonly plans: readonly SimulationPlan[];
  readonly context: Record<string, unknown>;
}

export interface SimulationSessionState {
  readonly sessionId: SimulationSessionId;
  readonly state: SessionState;
  readonly phase: string;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface SessionResult<TOutput = object, TContext extends object = object> {
  readonly sessionId: SimulationSessionId;
  readonly runId: SimulationRunId;
  readonly output: SimulationResult<TOutput, TContext>;
  readonly diagnostics: readonly string[];
  readonly timeline: readonly string[];
  readonly pipeline: AdaptivePipelineResult<{
    stage: PipelinePhase;
    count: number;
    signalCount: number;
    signalDigest: string;
  }>;
  readonly graph: ReturnType<typeof buildSimulationGraph>;
}

const nowIso = (): string => new Date().toISOString();

const fallbackPlan = (sessionId: SimulationSessionId): SimulationPlan => ({
  id: asPlanId(`${sessionId}:fallback`),
  title: 'fallback-plan',
  sessionId,
  confidence: 0.4,
  state: 'candidate',
  steps: [],
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

const buildEnvelopeInput = (request: SessionRequest) => {
  const sessionId = asSessionId(`${request.tenantId}:${request.siteId}:${Date.now()}`);
  const plan = request.plans[0] ?? fallbackPlan(sessionId);
  const windows: SimulationWindow[] = request.signals.map((signal, index) => ({
    id: asSessionId(`${sessionId}:window:${index}`),
    from: nowIso(),
    to: new Date(Date.now() + (index + 1) * 45_000).toISOString(),
    timezone: signal.namespace,
    blackoutMinutes: [index],
  }));
  return {
    sessionId,
    plan,
    signals: request.signals,
    windows,
    topology: normalizeTopology(request.topology),
    metadata: {
      tenantId: request.tenantId,
      siteId: request.siteId,
      planCount: request.plans.length,
    },
  };
};

const resolveTimeline = (phase: string): SessionState =>
  phase === 'complete' ? 'complete' : phase === 'ready' ? 'ready' : phase === 'failed' ? 'failed' : 'running';

const pipelineStages = [
  {
    id: 'pipeline:discover',
    inputShape: 'discover',
    outputShape: 'discover',
    run: async (
      input: { readonly signalCount: number; readonly signalDigest: string },
      _traceId: string,
    ) => ({
      stage: 'pipeline:discover' as const,
      count: input.signalCount + 1,
      signalCount: input.signalCount,
      signalDigest: `${input.signalDigest}:discover`,
    }),
  },
  {
    id: 'pipeline:simulate',
    inputShape: 'simulate',
    outputShape: 'simulate',
    run: async (
      input: { readonly signalCount: number; readonly signalDigest: string },
      _traceId: string,
    ) => ({
      stage: 'pipeline:simulate' as const,
      count: input.signalCount + 2,
      signalCount: input.signalCount,
      signalDigest: `${input.signalDigest}:simulate`,
    }),
  },
  {
    id: 'pipeline:validate',
    inputShape: 'validate',
    outputShape: 'validate',
    run: async (
      input: { readonly signalCount: number; readonly signalDigest: string },
      _traceId: string,
    ) => ({
      stage: 'pipeline:validate' as const,
      count: input.signalCount + 3,
      signalCount: input.signalCount,
      signalDigest: `${input.signalDigest}:validate`,
    }),
  },
] as const satisfies readonly PipelineStage<
  { readonly signalCount: number; readonly signalDigest: string },
  { readonly stage: PipelinePhase; readonly count: number; readonly signalCount: number; readonly signalDigest: string }
>[];

export const describeAdaptiveOutput = (result: SessionResult<object, object>): string => {
  return `${result.sessionId}:${result.output.summary.health}:${result.output.summary.signalCount}:${result.pipeline.output.count}`;
};

export const buildAdaptiveConfig = (input: {
  tenantId: string;
  siteId: string;
  zone: string;
  severityBudget: number;
  requestedBy: string;
},
): SimulationConfig => ({
  sessionId: asSessionId(`${input.tenantId}:${input.siteId}`),
  input: {
    tenantId: input.tenantId,
    siteId: input.siteId,
    zone: input.zone,
    severityBudget: input.severityBudget,
    requestedBy: input.requestedBy,
  },
  topology: normalizeTopology(input.siteId),
  phaseSequence: ['discover', 'shape', 'simulate', 'validate', 'recommend', 'execute', 'verify', 'close'],
  plugins: [{ kind: 'recovery/ops/sim/normalize', version: '1.0.0' }],
  expectedOutput: {},
  inputSnapshot: {
    tenantId: input.tenantId,
    siteId: input.siteId,
    zone: input.zone,
    severityBudget: input.severityBudget,
    requestedBy: input.requestedBy,
  },
});

export const runAdaptiveSession = async <
  TContext extends object,
>(
  request: SessionRequest,
  context: TContext,
): Promise<SessionResult<object, TContext>> => {
  const envelopeInput = buildEnvelopeInput(request);
  const envelope = buildSimulationEnvelope(
    {
      ...envelopeInput,
      metadata: envelopeInput.metadata,
    },
    context,
    'discover',
  );

  const graph = buildSimulationGraph(envelope.envelope, envelopeInput.topology);
  const graphSummary = summarizeGraph(graph, envelope.summary);

  const diagnostics: string[] = [
    `topology=${envelopeInput.topology}`,
    `plan=${envelopeInput.plan.id}`,
    `route=${graphSummary.routeDigest}`,
    `signals=${envelope.summary.signalCount}`,
  ];

  const registry = new AdaptivePluginRegistry(
    buildPluginsFromConfig({
      tenant: request.tenantId,
      labels: envelopeInput.signals.map((signal) => signal.id),
      profile: envelopeInput.topology,
    }),
  );

  await using _scope = registry;

  const pluginContext = {
    namespace: `${request.tenantId}:${request.siteId}`,
  } as const;
  const pluginOutput = [
    ...(await registry.runPhase('discover', pluginContext, {
      topology: envelopeInput.topology,
      signalCount: request.signals.length,
    })),
    ...(await registry.runPhase('validate', pluginContext, {
      topology: envelopeInput.topology,
      signalCount: request.signals.length,
    })),
  ];

  diagnostics.push(`plugins=${pluginOutput.length}`);
  const candidates = pluginOutput.map((entry, index) => ({
    id: envelopeInput.plan.id as SimulationPlanId,
    score: Number((0.55 + index * 0.1).toFixed(2)),
    topology: envelopeInput.topology,
    rationale: `${entry.phase}:${entry.pluginId}`,
    metadata: {
      plugin: entry.pluginId,
      elapsed: entry.elapsedMs,
      pluginPhase: entry.phase,
    },
  }));

  const pipeline = await runAdaptivePipeline(
    pipelineStages,
    {
      signalCount: request.signals.length,
      signalDigest: `signals:${envelopeInput.signals.length}`,
    } as const,
  );

  const base = createSimulationEnvelopeResult(
    envelope,
    {
      stage: pipeline.output.stage,
      count: pipeline.output.count,
      signalCount: pipeline.output.signalCount,
      signalDigest: pipeline.output.signalDigest,
    },
    buildSummary(envelope.envelope),
  );

  const selectedPlanId = envelopeInput.plan.id;
  const output = appendCandidate(base, selectedPlanId, candidates.length, `plan:${envelopeInput.plan.title}`);
  const graphDiag = buildGraphDiagnostics(graph);

  return {
    sessionId: envelope.id,
    runId: asRunId(`run:${randomUUID()}`),
    output: {
      ...output,
      candidates,
      selectedPlanId,
      context: envelope.context,
      summary: envelope.summary,
      output: output.output,
    },
    diagnostics: [...diagnostics, `graph=${graphDiag.fingerprint}`, `pipeline=${pipeline.timeline.length}`],
    timeline: [
      `state=${resolveTimeline('running')}`,
      `plan=${selectedPlanId}`,
      ...graphSummary.nodes,
    ],
    pipeline: {
      ...pipeline,
      output: {
        stage: pipeline.output.stage,
        count: pipeline.output.count,
        signalCount: pipeline.output.signalCount,
        signalDigest: pipeline.output.signalDigest,
      },
    },
    graph,
  };
};

export const inspectSessionState = (sessionId: SimulationSessionId, phase: string): SimulationSessionState => ({
  sessionId,
  state: resolveTimeline(phase),
  phase,
  createdAt: nowIso(),
});
