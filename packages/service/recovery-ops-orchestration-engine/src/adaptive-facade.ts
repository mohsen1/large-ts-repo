import { randomUUID } from 'node:crypto';
import {
  runAdaptiveLabSession,
  buildAdaptiveReport,
  describeAdaptiveRun,
  selectTopology,
  type AdaptiveLabInput,
  type AdaptiveLabRun,
} from './adaptive-lab';
import { AdaptiveSimulation } from '@domain/recovery-ops-orchestration-lab';
import { ok, fail, type Result } from '@shared/result';

export interface StudioAdaptiveInput {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly requestedBy: string;
  readonly signals: readonly AdaptiveSimulation.SimulationSignal[];
  readonly plans: readonly AdaptiveSimulation.SimulationPlan[];
  readonly topology: AdaptiveSimulation.SimulationTopology;
}

export interface AdaptiveStudioOutput {
  readonly seed: string;
  readonly startedAt: number;
  readonly result: AdaptiveLabRun;
  readonly report: string;
}

const toAdaptiveInput = (input: StudioAdaptiveInput): AdaptiveLabInput => ({
  tenantId: input.tenant,
  siteId: input.workspace,
  scenarioId: input.scenario,
  requestedBy: input.requestedBy,
  signals: input.signals,
  plans: input.plans,
  topology: selectTopology([input.topology, input.workspace, input.tenant]),
});

export const runStudioAdaptiveSuite = async (
  request: StudioAdaptiveInput,
): Promise<AdaptiveStudioOutput> => {
  const response = await runAdaptiveLabSession(toAdaptiveInput(request));
  if (!response.ok) {
    throw response.error;
  }

  const lab = response.value;
  return {
    seed: `${request.tenant}:${request.workspace}:${request.scenario}`,
    startedAt: Date.now(),
    result: lab,
    report: `${JSON.stringify(buildAdaptiveReport(lab))}::${describeAdaptiveRun(lab)}`,
  };
};

export const runAdaptiveSuite = async (
  input: StudioAdaptiveInput,
): Promise<Result<AdaptiveStudioOutput, Error>> => {
  try {
    const response = await runAdaptiveLabSession(toAdaptiveInput(input));
    if (!response.ok) {
      return fail(response.error);
    }

    const lab = response.value;
    return ok({
      seed: `${input.tenant}:${input.workspace}:${input.scenario}`,
      startedAt: Date.now(),
      result: lab,
      report: `${JSON.stringify(buildAdaptiveReport(lab))}::${describeAdaptiveRun(lab)}`,
    });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('adaptive-suite-failed'));
  }
};

export const runAdaptiveBatchSuite = async (
  requests: readonly StudioAdaptiveInput[],
): Promise<readonly AdaptiveStudioOutput[]> => {
  const runs = await Promise.all(requests.map((request) => runStudioAdaptiveSuite(request)));
  return runs.toSorted((left, right) => right.startedAt - left.startedAt);
};

export const buildAdaptiveFingerprint = async (request: StudioAdaptiveInput): Promise<string> => {
  const topology = selectTopology([request.topology, request.tenant, request.workspace]);
  const signature = request.signals
    .toSorted((left, right) => right.score - left.score)
    .reduce((acc, signal) => `${acc}|${signal.id}`, `plans=${request.plans.length}`);
  return `${request.tenant}-${request.scenario}-${topology}-${signature.length}-${randomUUID()}`;
};

export const explainAdaptiveRun = (run: AdaptiveLabRun): string => {
  const timeline = `timeline=${run.pipeline.timeline.length}`;
  return `${run.sessionId}:${run.runId}:${run.output.candidates.length}:${timeline}:${run.output.summary.health}:${describeAdaptiveRun(run)}`;
};

export { describeAdaptiveRun };

export const withAdaptiveRunner = async <T>(runner: () => Promise<T>): Promise<T> => runner();

export const buildAdaptiveReportLines = (run: AdaptiveLabRun): readonly string[] => [
  `session=${run.sessionId}`,
  `run=${run.runId}`,
  `candidates=${run.output.candidates.length}`,
  `timeline=${run.pipeline.timeline.length}`,
];
