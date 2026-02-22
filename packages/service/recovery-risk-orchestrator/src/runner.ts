import { fail, ok, type Result } from '@shared/result';
import { buildSignalPack, buildExecutionResult, classifySeverity } from '@domain/recovery-risk-strategy';
import { buildTimelineWindow, summarizeTimeline, buildSummary } from '@domain/recovery-risk-strategy/src/timeline';
import {
  gateInputFromCommand,
  summarizeConstraints,
  summarizeBudgets,
  decisionText,
} from '@domain/recovery-risk-strategy/src/policy-gates';
import { parsePublishedPack, makePayload, normalizeOutcome } from '@infrastructure/recovery-risk-connectors/src/transformers';
import { publishSafely, RiskSnsConnector } from '@infrastructure/recovery-risk-connectors';
import { SNSClient } from '@aws-sdk/client-sns';
import type { RiskConnector as ConnectorType } from '@infrastructure/recovery-risk-connectors';
import type {
  StrategyCommandInput,
  StrategyExecutionResult,
  StrategySignalPack,
  RiskStrategyId,
} from '@domain/recovery-risk-strategy';

export interface OrchestrationOutcome {
  readonly result: StrategyExecutionResult;
  readonly timelineSummary: string;
  readonly decision: string;
  readonly publishStatus: string;
}

export interface PlanInput {
  readonly strategyId: RiskStrategyId;
}

export class RiskOrchestrator {
  constructor(
    private readonly connectors: readonly ConnectorType[] = [],
    private readonly fallbackPublish = true,
  ) {}

  async run(input: StrategyCommandInput): Promise<Result<OrchestrationOutcome, Error>> {
    if (!input.strategy.active) {
      return fail(new Error('strategy-inactive'));
    }

    const decision = gateInputFromCommand(input);
    const pack = buildSignalPack(
      input.scenario.scenarioId,
      input.signals,
      input.constraints,
      input.budgets,
      input.strategy.weights,
    );

    const score = pack.vectors.reduce((acc, vector) => acc + vector.score * vector.weight, 0) /
      Math.max(1, pack.vectors.length || 1);

    const result = buildExecutionResult(
      `${input.strategy.profileId}:run` as any,
      input.strategy,
      pack,
      score,
      input.strategy.profileId,
      `${input.scenario.scenarioId}:seed` as any,
      [
        {
          runId: `${input.strategy.profileId}:run` as any,
          state: 'scored',
          timestamp: new Date().toISOString(),
          note: 'orchestrated',
        },
      ],
    );

    const window = buildTimelineWindow(result.run.runId, pack, result, [
      ['green', pack.vectors.length],
      ['yellow', 0],
      ['red', 0],
      ['black', score >= 90 ? 1 : 0],
    ] as const);

    buildSummary(result);
    const payload = makePayload(`${input.strategy.profileId}:connector`, 'strategy-result', 'critical', result.run, pack);
    const publishedPack = {
      envelope: payload,
      strategyRun: result.run,
      vectorPack: pack,
    };

    const allConnectors: readonly ConnectorType[] = this.connectors.length
      ? this.connectors
      : this.fallbackPublish
        ? [new RiskSnsConnector(new SNSClient({}), `arn:aws:sns:${input.scenario.scenarioId}`)]
        : [];

    for (const connector of allConnectors) {
      const published = await publishSafely(connector, publishedPack);
      if (!published.ok) {
        return fail(published.error);
      }
      normalizeOutcome(published);
    }

    const constraints = summarizeConstraints(input.constraints);
    const budgets = summarizeBudgets(input.budgets);
    return ok({
      result,
      timelineSummary: summarizeTimeline(window.ticks),
      decision: decisionText(decision),
      publishStatus: [constraints, budgets, `decision=${decision.allowed}`].join('|'),
    });
  }
}

export const hydrateFromEnvelope = (raw: unknown): Result<OrchestrationOutcome, Error> => {
  const parsed = parsePublishedPack(raw);
  if (!parsed.ok) {
    return fail(parsed.error);
  }

  const run = parsed.value.strategyRun;

  return ok({
    result: {
      run,
      vector: parsed.value.vectorPack,
      severityBand: classifySeverity(run.score),
      recommendation: `hydrated ${run.runId}`,
      logs: [
        {
          runId: run.runId,
          state: 'queued',
          timestamp: new Date().toISOString(),
          note: `hydrated ${parsed.value.envelope.connectorId}`,
        },
      ],
    },
    timelineSummary: 'hydrated',
    decision: 'hydrated',
    publishStatus: 'hydrated',
  });
};
