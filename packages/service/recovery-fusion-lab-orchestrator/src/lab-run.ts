import type {
  FusionLabExecutionRequest,
  FusionLabExecutionResult,
  FusionLabRunSpec,
  LabTimelineFrame,
  FusionLabWorkspace,
} from './types';
import {
  asLabRunId,
  buildCommands,
  buildSchedulerOutput,
  createRunEnvelope,
  planFromTopology,
  synthesizeSignals,
  type LabCommand,
  type LabMetricPoint,
  type LabSignal,
  type LabWave,
} from '@domain/recovery-fusion-lab-core';
import { ok } from '@shared/result';

const phases = ['capture', 'plan', 'simulate', 'execute', 'observe'] as const;

export interface RunAccumulator {
  readonly request: FusionLabExecutionRequest;
  readonly runId: ReturnType<typeof asLabRunId>;
  readonly frames: readonly LabTimelineFrame[];
  readonly waves: readonly LabWave[];
  readonly signals: readonly LabSignal[];
  readonly metrics: readonly LabMetricPoint[];
}

export const runFrameIterator = async function* (
  request: FusionLabExecutionRequest,
): AsyncGenerator<LabTimelineFrame> {
  const generated: readonly LabTimelineFrame[] = [
    { at: new Date().toISOString(), event: 'fusion-lab.capture', phase: 'capture' },
    { at: new Date().toISOString(), event: 'fusion-lab.plan', phase: 'plan' },
    { at: new Date().toISOString(), event: 'fusion-lab.execute', phase: 'execute' },
    { at: new Date().toISOString(), event: 'fusion-lab.observe', phase: 'observe' },
  ];

  for (const phase of generated) {
    await Promise.resolve();
    yield phase;
  }

  for (const row of planFromTopology(request.workspaceId, request.topology, 'parallel')) {
    for (const _command of row.commands) {
      yield {
        at: new Date().toISOString(),
        event: 'fusion-lab.execute',
        phase: 'execute',
      };
    }
  }
};

export const planExecution = (
  request: FusionLabExecutionRequest,
): { readonly waves: readonly LabWave[]; readonly signals: readonly LabSignal[]; readonly metrics: readonly LabMetricPoint[] } => {
  const scheduler = buildSchedulerOutput(request.workspaceId, request.topology);
  const rawSignals = synthesizeSignals(request.workspaceId, phases);
  const rawMetrics = scheduler.waves.length === 0
    ? []
    : [
        {
          path: 'metric:run:depth' as const,
          value: scheduler.waves.length,
          unit: 'count',
          source: request.workspaceId,
          createdAt: new Date().toISOString(),
        },
      ];

  return {
    waves: scheduler.waves,
    signals: rawSignals,
    metrics: rawMetrics,
  };
};

export const enrichSignals = (
  request: FusionLabExecutionRequest,
  signals: readonly LabSignal[],
): readonly LabSignal[] =>
  signals.map((signal, index) => ({
    ...signal,
    payload: {
      ...(signal.payload as Record<string, unknown>),
      sequence: index,
      workspace: request.workspaceId,
      tenant: request.context.tenant,
    },
  }));

export const buildExecutionTrace = (
  request: FusionLabExecutionRequest,
  waves: readonly LabWave[],
): readonly LabTimelineFrame[] =>
  waves.flatMap((wave): readonly LabTimelineFrame[] => [
    {
      at: new Date().toISOString(),
      event: 'fusion-lab.plan',
      phase: wave.phase,
    },
    {
      at: new Date().toISOString(),
      event: 'fusion-lab.execute',
      phase: wave.phase,
    },
  ]);

export const reduceRun = (request: FusionLabExecutionRequest, spec: FusionLabRunSpec): RunAccumulator => {
  const runId = asLabRunId(request.workspaceId);
  const scheduler = buildSchedulerOutput(request.workspaceId, request.topology);
  const signals = enrichSignals(request, synthesizeSignals(request.workspaceId, phases));
  return {
    request,
    runId,
    frames: buildExecutionTrace(request, scheduler.waves),
    waves: scheduler.waves,
    signals,
    metrics: [
      {
        path: 'metric:run:commands' as const,
        value: buildCommands(request.workspaceId, scheduler.waves, 'execute').length,
        unit: 'count',
        source: request.workspaceId,
        createdAt: new Date().toISOString(),
      },
    ],
  };
};

export const executePlan = (request: FusionLabExecutionRequest): FusionLabExecutionResult => {
  const plan = planExecution(request);
  const trace = buildExecutionTrace(request, plan.waves);
  const summary = {
    runId: asLabRunId(request.workspaceId),
    totalSignals: plan.signals.length,
    criticalSignals: plan.signals.filter((signal) => signal.severity >= 4).length,
    commandCount: plan.waves.flatMap((wave) => wave.commandIds).length,
    medianSignalLatencyMs: plan.metrics.length === 0 ? 0 : plan.metrics[0]?.value ?? 0,
    riskDelta: 0.2,
    confidence: 0.91,
    telemetry: plan.metrics,
  };
  const allCommands: readonly LabCommand[] = plan.waves.flatMap((wave) =>
    buildCommands(request.workspaceId, [wave], wave.phase ?? 'plan'),
  );
  return {
    runId: asLabRunId(request.workspaceId),
    status: 'completed',
    waves: plan.waves,
    signals: plan.signals,
    commands: allCommands,
    metrics: plan.metrics,
    summary,
    commandTrace: trace.map((frame) => frame.event),
    traceDigest: trace.reduce((acc, frame) => `${acc}|${frame.event}`, createRunEnvelope([request.workspaceId])),
  };
};

export const runWorkspace = async (request: FusionLabExecutionRequest): Promise<FusionLabExecutionResult> => {
  const accumulator = reduceRun(request, {
    workspaceId: request.workspaceId,
    tenantId: request.tenantId,
    mode: request.mode,
    maxParallelism: request.topology.nodes.length + request.topology.edges.length,
    traceLevel: request.traceLevel,
  });

  for await (const _frame of runFrameIterator(request)) {
    void _frame;
  }

  const report = executePlan(request);
  return {
    ...report,
    runId: accumulator.runId,
    commandTrace: [...accumulator.frames.map((frame) => frame.event), ...report.commandTrace],
  };
};

export const reportLike = (spec: FusionLabRunSpec, request: FusionLabExecutionRequest): FusionLabExecutionResult => ({
  runId: asLabRunId(`${request.workspaceId}#${spec.mode}`),
  status: 'running',
  waves: [],
  signals: [],
  commands: [],
  metrics: [],
  summary: {
    runId: asLabRunId(`${request.workspaceId}#report`),
    totalSignals: 0,
    criticalSignals: 0,
    commandCount: 0,
    medianSignalLatencyMs: 0,
    riskDelta: 0,
    confidence: 0.3,
    telemetry: [],
  },
  commandTrace: [],
  traceDigest: createRunEnvelope([request.workspaceId, request.context.tenant]),
});

export const runFramesToRecords = async function* (request: FusionLabExecutionRequest): AsyncGenerator<string> {
  const plan = await Promise.resolve(planExecution(request));
  for (const wave of plan.waves) {
    yield `plan:${wave.id}`;
  }
};

export const finalizeRun = (result: FusionLabExecutionResult) => ok(result);

export const toWorkspaceResult = (
  request: FusionLabExecutionRequest,
  spec: FusionLabRunSpec,
  result: FusionLabExecutionResult,
): FusionLabWorkspace => ({
  runId: asLabRunId(request.workspaceId),
  status: 'warming',
  spec,
  result,
  plan: {
    runId: asLabRunId(request.workspaceId),
    createdAt: new Date().toISOString(),
    waves: result.waves,
    signals: result.signals,
    commands: result.commands,
  },
});
