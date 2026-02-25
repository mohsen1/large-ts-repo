import { AdaptiveSimulation } from '@domain/recovery-ops-orchestration-lab';
import { asPlanId, asSessionId } from '@domain/recovery-ops-orchestration-lab/src/adaptive-simulation/types';
import {
  buildGraphDiagnostics,
  summarizeGraph,
  type SimulationGraph,
} from '@domain/recovery-ops-orchestration-lab/src/adaptive-simulation/graph';
import {
  buildSignalFingerprint,
  normalizeTopology,
} from '@domain/recovery-ops-orchestration-lab/src/adaptive-simulation/types';
import { collectIterable, mapIterable } from '@shared/stress-lab-runtime';
import {
  runAdaptiveSession,
  type SessionRequest,
  type SessionResult,
} from '@domain/recovery-ops-orchestration-lab/src/adaptive-simulation/session';
import { ok, fail, type Result } from '@shared/result';

export type AdaptiveLabReport = {
  readonly sessionId: AdaptiveSimulation.SimulationSessionId;
  readonly runId: AdaptiveSimulation.SimulationRunId;
  readonly planCount: number;
  readonly graphFingerprint: string;
  readonly summary: string;
};

export interface AdaptiveLabInput {
  readonly tenantId: string;
  readonly siteId: string;
  readonly scenarioId: string;
  readonly requestedBy: string;
  readonly signals: readonly AdaptiveSimulation.SimulationSignal[];
  readonly plans: readonly AdaptiveSimulation.SimulationPlan[];
  readonly topology: AdaptiveSimulation.SimulationTopology;
  readonly windowMinutes?: number;
}

export interface AdaptiveLabRun {
  readonly sessionId: AdaptiveSimulation.SimulationSessionId;
  readonly runId: AdaptiveSimulation.SimulationRunId;
  readonly selectedPlanId?: AdaptiveSimulation.SimulationPlanId;
  readonly output: SessionResult['output'];
  readonly graph: SimulationGraph;
  readonly pipeline: SessionResult['pipeline'];
  readonly diagnostics: readonly string[];
  readonly summary: string;
}

const toNamespace = (tenantId: string): `tenant:${string}` => `tenant:${tenantId}`;

const mapRequestContext = (input: AdaptiveLabInput) => ({
  namespace: toNamespace(input.tenantId),
  requestedBy: input.requestedBy,
  scenarioId: input.scenarioId,
  siteId: input.siteId,
  windowMinutes: input.windowMinutes ?? 6,
});

const asFallbackPlan = (input: AdaptiveLabInput): AdaptiveSimulation.SimulationPlan => ({
  id: asPlanId(`${input.tenantId}:fallback`),
  title: 'fallback',
  sessionId: asSessionId(`${input.tenantId}:${input.siteId}`),
  confidence: 0.5,
  state: 'candidate',
  steps: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const runAdaptiveLabSession = async (
  input: AdaptiveLabInput,
): Promise<Result<AdaptiveLabRun, Error>> => {
  try {
    await using _scope = new AsyncDisposableStack();
    const configTopology = normalizeTopology(input.topology);
    const request: SessionRequest = {
      tenantId: input.tenantId,
      siteId: input.siteId,
      topology: configTopology,
      signals: input.signals,
      plans: input.plans.length > 0 ? input.plans : [asFallbackPlan(input)],
      context: mapRequestContext(input),
    };

    const session = await runAdaptiveSession(request, mapRequestContext(input));
    const graphSummary = summarizeGraph(session.graph, session.output.summary);
    const graphDiagnostics = buildGraphDiagnostics(session.graph);
    const fingerprint = buildSignalFingerprint(input.signals);
    const report = `${session.output.summary.health}|${graphDiagnostics.nodeCount}|${graphSummary.signalDensity.toFixed(3)}|${graphSummary.riskBand}`;

    return ok({
      sessionId: session.sessionId,
      runId: session.runId,
      selectedPlanId: session.output.selectedPlanId,
      output: {
        ...session.output,
        context: {
          ...session.output.context,
          namespace: toNamespace(input.tenantId),
          fingerprint,
        },
      },
      graph: session.graph,
      pipeline: session.pipeline,
      diagnostics: [...session.diagnostics, `graph=${graphSummary.routeDigest}`, `fingerprint=${fingerprint}`],
      summary: report,
    });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('adaptive-lab-session-failed'));
  }
};

export const buildAdaptiveReport = (run: AdaptiveLabRun): AdaptiveLabReport => {
  const planCount = run.output.candidates.length;
  const graphFingerprint = buildGraphDiagnostics(run.graph).fingerprint;
  return {
    sessionId: run.sessionId,
    runId: run.runId,
    planCount,
    graphFingerprint,
    summary: `${run.summary}:${run.graph.nodes.length}:${planCount}`,
  };
};

export const selectTopology = (input: readonly string[]): AdaptiveSimulation.SimulationTopology =>
  input.includes('mesh') ? 'mesh' : input.includes('ring') ? 'ring' : input.includes('chain') ? 'chain' : 'grid';

export const describeAdaptiveRun = (run: AdaptiveLabRun): string => {
  const labels = collectIterable(mapIterable(run.pipeline.timeline, (entry, index) => `${index}:${entry}`));
  return [
    `session=${run.sessionId}`,
    `run=${run.runId}`,
    `candidates=${run.output.candidates.length}`,
    `signals=${run.output.summary.signalCount}`,
    ...labels,
  ].join(' | ');
};

export const describeAdaptiveOutput = (run: AdaptiveLabRun): string => describeAdaptiveRun(run);
