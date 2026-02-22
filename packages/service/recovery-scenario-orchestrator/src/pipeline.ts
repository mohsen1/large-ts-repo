import { fail, ok, type Result } from '@shared/result';
import {
  buildAggregateResult,
  buildScenarioDiagnostics,
  buildScenarioSummary,
  type CandidateDiagnosticResult,
  type ScenarioScenarioRecord,
} from './diagnostics';

type Trace = readonly string[];

export interface PipelineInput {
  readonly tenantId: string;
  readonly signalIds: readonly string[];
  readonly templates: readonly unknown[];
  readonly signals: readonly {
    tenantId: string;
    incidentId: string;
    signal: string;
    value: number;
    timestamp: string;
  }[];
  readonly now?: () => string;
}

export interface PipelineOutput {
  readonly tenantId: string;
  readonly runId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly diagnostics: readonly CandidateDiagnosticResult[];
  readonly profile: ReturnType<typeof buildAggregateResult>;
  readonly summary: ReturnType<typeof buildScenarioSummary>;
  readonly traces: Trace;
}

const defaultNow = (): string => new Date().toISOString();

const buildRecord = (input: PipelineInput): ScenarioScenarioRecord => ({
  tenantId: input.tenantId,
  signalIds: input.signalIds,
  templates: input.templates,
  signals: input.signals.map((signal) => ({
    tenantId: signal.tenantId,
    incidentId: signal.incidentId,
    signal: signal.signal,
    value: signal.value,
    timestamp: signal.timestamp,
  })),
  now: input.now ?? defaultNow,
  defaultProfile: {
    minSignals: Math.max(1, input.signalIds.length),
    minConfidence: 10,
    maxRiskScore: 88,
    maxWindowMinutes: 220,
    minWindowMinutes: 10,
    allowUnverified: true,
  },
  constraintsState: {
    profile: {
      minSignals: Math.max(1, input.signalIds.length),
      minConfidence: 10,
      maxRiskScore: 88,
      maxWindowMinutes: 220,
      minWindowMinutes: 10,
      allowUnverified: true,
    },
    disabled: input.tenantId.length % 2 === 1 ? ['advisory-mode'] : [],
    featureFlags: ['pipeline-v1'],
  },
});

export class ScenarioExecutionPipeline {
  #traces: string[];

  constructor(tenantId: string) {
    this.#traces = [`pipeline:initialized:${tenantId}`];
  }

  async run(input: PipelineInput): Promise<Result<PipelineOutput, string>> {
    const startedAt = defaultNow();
    const record = buildRecord(input);

    const diagnostics = buildScenarioDiagnostics(record);
    this.#traces.push(`pipeline:diagnostics:${diagnostics.length}`);

    const profile = buildAggregateResult(input.tenantId, diagnostics);
    if (!profile.ok) {
      this.#traces.push(`pipeline:aggregate-failed:${profile.error}`);
      return fail(profile.error);
    }

    const summary = buildScenarioSummary(input.tenantId, diagnostics);
    if (!summary.ok) {
      this.#traces.push(`pipeline:summary-failed:${summary.error}`);
      return fail(summary.error);
    }

    this.#traces.push(`pipeline:success:${input.tenantId}`);
    return ok({
      tenantId: input.tenantId,
      runId: `${input.tenantId}:${startedAt}`,
      startedAt,
      endedAt: (input.now ?? defaultNow)(),
      diagnostics,
      profile,
      summary,
      traces: this.#traces,
    });
  }
}

export const runScenarioPipeline = async (input: PipelineInput): Promise<Result<PipelineOutput, string>> => {
  const pipeline = new ScenarioExecutionPipeline(input.tenantId);
  return pipeline.run(input);
};
