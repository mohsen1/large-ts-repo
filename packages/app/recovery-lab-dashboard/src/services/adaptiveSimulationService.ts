import type {
  AdaptiveLabRun,
  StudioAdaptiveInput,
  AdaptiveStudioOutput,
} from '@service/recovery-ops-orchestration-engine';
import {
  buildAdaptiveFingerprint,
  runAdaptiveBatchSuite,
  runStudioAdaptiveSuite,
} from '@service/recovery-ops-orchestration-engine';
import { describeAdaptiveRun } from '@service/recovery-ops-orchestration-engine';
import {
  AdaptiveSimulation,
} from '@domain/recovery-ops-orchestration-lab';

interface SignalRecord {
  readonly id: string;
  readonly tier: AdaptiveSimulation.SimulationSignal['tier'];
  readonly score: number;
  readonly confidence: number;
  readonly namespace: string;
  readonly tags: readonly { key: string; value: string }[];
}

const mapSignal = (signal: SignalRecord): AdaptiveSimulation.SimulationSignal => ({
  id: signal.id as AdaptiveSimulation.SimulationSignal['id'],
  namespace: signal.namespace,
  tier: signal.tier,
  title: `signal-${signal.id}`,
  score: signal.score,
  confidence: signal.confidence,
  tags: signal.tags,
});

const mapPlan = (plan: {
  readonly id: string;
  readonly title: string;
  readonly sessionId: string;
  readonly confidence: number;
}): AdaptiveSimulation.SimulationPlan => ({
  id: plan.id as AdaptiveSimulation.SimulationPlan['id'],
  title: plan.title,
  sessionId: plan.sessionId as AdaptiveSimulation.SimulationPlan['sessionId'],
  confidence: plan.confidence,
  state: 'candidate',
  steps: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export interface AdaptiveSimulationRequest {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly requestedBy: string;
  readonly topology: AdaptiveSimulation.SimulationTopology;
  readonly signals: readonly SignalRecord[];
  readonly plans: readonly {
    readonly id: string;
    readonly title: string;
    readonly sessionId: string;
    readonly confidence: number;
  }[];
}

export interface AdaptiveSimulationPlan {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly {
    readonly id: string;
    readonly name: string;
    readonly command: string;
    readonly expectedMinutes: number;
  }[];
}

export interface AdaptiveSimulationOutput {
  readonly seed: string;
  readonly startedAt: number;
  readonly result: AdaptiveLabRun;
  readonly report: string;
  readonly fingerprint: string;
  readonly diagnostics: readonly string[];
}

const mapAdaptiveStudioRequest = (request: AdaptiveSimulationRequest): StudioAdaptiveInput => ({
  tenant: request.tenant,
  workspace: request.workspace,
  scenario: request.scenario,
  requestedBy: request.requestedBy || 'operator',
  signals: request.signals.map(mapSignal),
  plans: request.plans.map(mapPlan),
  topology: request.topology,
});

export const runAdaptiveSimulationSuite = async (
  request: AdaptiveSimulationRequest,
): Promise<AdaptiveSimulationOutput> => {
  const output = await runStudioAdaptiveSuite(mapAdaptiveStudioRequest(request));
  const diagnostics = [
    `topology=${request.topology}`,
    `signals=${output.result.output.summary.signalCount}`,
    `candidates=${output.result.output.candidates.length}`,
  ];
  return {
    seed: output.seed,
    startedAt: output.startedAt,
    result: output.result,
    report: output.report,
    fingerprint: `${request.tenant}:${request.scenario}:${output.result.sessionId}`,
    diagnostics,
  };
};

export const runAdaptiveSimulationBatch = async (
  requests: readonly AdaptiveSimulationRequest[],
): Promise<readonly AdaptiveSimulationOutput[]> => {
  const outputs = await runAdaptiveBatchSuite(requests.map(mapAdaptiveStudioRequest));
  return outputs.map((entry, index) => ({
    seed: entry.seed,
    startedAt: entry.startedAt,
    result: entry.result,
    report: entry.report,
    fingerprint: `${entry.seed}-${index}`,
    diagnostics: [
      `batch=${index}`,
      `candidates=${entry.result.output.candidates.length}`,
      `risk=${entry.result.output.summary.riskIndex}`,
    ],
  })).toSorted((left, right) => right.startedAt - left.startedAt);
};

export const formatAdaptiveOutput = (output: AdaptiveSimulationOutput): string =>
  `seed=${output.seed} diagnostics=${output.diagnostics.length} report=${output.fingerprint}`;

export const buildSimulationSeed = async (input: AdaptiveSimulationRequest): Promise<string> =>
  buildAdaptiveFingerprint(mapAdaptiveStudioRequest(input));

export const describeAdaptiveOutput = (output: AdaptiveSimulationOutput): string => {
  return `${output.seed}:${output.diagnostics.join(',').slice(0, 120)}:${describeAdaptiveRun(output.result)}`;
};

export const summarizeAdaptiveOutput = (output: AdaptiveSimulationOutput): string =>
  `runId=${output.result.runId} session=${output.result.sessionId} diagnostics=${output.diagnostics.length}`;
