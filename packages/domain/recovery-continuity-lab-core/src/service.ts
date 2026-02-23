import {
  ContinuityControlContext,
  ContinuityPlan,
  ContinuitySignal,
  ContinuityRunPayload,
  ContinuityRunResult,
  UtcTimestamp,
} from './types';
import { runScenarioSimulation } from './simulator';
import { resolveAdapters } from './adapters';
import { buildTelemetryReport } from './telemetry';

export interface ServiceConfig {
  readonly baseRisk: number;
  readonly signalThreshold: number;
  readonly constraintWeight: number;
}

export interface ServiceInputs {
  readonly context: ContinuityControlContext;
  readonly plan: ContinuityPlan;
  readonly signals: ReadonlyArray<ContinuitySignal>;
  readonly observedAt: UtcTimestamp;
}

export interface ServiceDiagnostics {
  readonly runId: string;
  readonly createdAt: UtcTimestamp;
  readonly summary: {
    readonly meanRisk: number;
    readonly maxCoverage: number;
    readonly violationCount: number;
  };
}

const defaultConfig: ServiceConfig = {
  baseRisk: 0.65,
  signalThreshold: 0.02,
  constraintWeight: 0.3,
};

const buildPayload = <T>(value: T, producedAt: UtcTimestamp): ContinuityRunPayload<T> => ({
  planId: `${Date.now()}-plan`,
  inputState: value,
  producedAt,
});

export class ContinuityLabService {
  private readonly adapters = resolveAdapters();

  constructor(private readonly config: ServiceConfig = defaultConfig) {}

  async run(input: ServiceInputs): Promise<ContinuityRunResult> {
    const outcome = runScenarioSimulation(
      {
        context: input.context,
        plan: input.plan,
        signals: input.signals,
        executedAt: input.observedAt,
      },
      this.config,
    );

    const result: ContinuityRunResult = {
      scenarioId: input.plan.planId,
      planId: input.plan.planId,
      outcomes: [outcome],
      diagnostics: [`risk=${outcome.risk}`, `coverage=${outcome.coverage}`, `violations=${outcome.violations.length}`],
    };

    await this.adapters.persistence.saveResult(result);
    const payload: ContinuityRunPayload<ContinuityRunResult> = buildPayload(result, input.observedAt);
    await this.adapters.persistence.loadRunPayload(payload.planId);
    return result;
  }

  async describe(outcome: ContinuityRunResult): Promise<string> {
    const latestSignals = outcome.outcomes[0]?.recommendedActions
      ? outcome.outcomes[0].recommendedActions
      : [];
    const report = buildTelemetryReport(outcome, []);
    return `Continuity run ${outcome.scenarioId}: risk ${report.riskScore}, coverage ${report.coverageScore}, violations ${report.violationCount}, signals ${(latestSignals as unknown[]).length}`;
  }

  summarize(payload: ContinuityRunPayload<ContinuityRunResult>): ServiceDiagnostics {
    const outcomes = payload.inputState.outcomes;
    const meanRisk = outcomes.length > 0 ? outcomes.reduce((acc, outcome) => acc + outcome.risk, 0) / outcomes.length : 0;
    const maxCoverage = outcomes.length > 0 ? outcomes.reduce((acc, outcome) => acc + outcome.coverage, 0) / outcomes.length : 0;
    return {
      runId: payload.planId,
      createdAt: payload.producedAt,
      summary: {
        meanRisk: Number(meanRisk.toFixed(3)),
        maxCoverage: Number(maxCoverage.toFixed(3)),
        violationCount: outcomes.reduce((acc, outcome) => acc + outcome.violations.length, 0),
      },
    };
  }
}
