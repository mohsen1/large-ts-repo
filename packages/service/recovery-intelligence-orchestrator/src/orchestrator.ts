import { S3Client } from '@aws-sdk/client-s3';
import { SNSClient } from '@aws-sdk/client-sns';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import {
  type IntelligenceRunRequest,
  type IntelligenceRunResult,
} from './commands';
import type { RecoverySignalBundle, RecoveryForecast, RecoveryRecommendation } from '@domain/recovery-intelligence/src';
import type { RecoveryIntelligenceRepository } from '@data/recovery-intelligence-store/src/repository';
import type { StoredActionPlan } from '@data/recovery-intelligence-store/src/models';
import { compilePlan } from './planner';
import { evaluateReadiness, normalizeDecision } from './evaluator';
import { archiveForecast, publishNotification } from './adapters';
import { buildRunbookFromActions } from '@data/recovery-intelligence-store/src/adapters';

interface RunDependencies {
  readonly repository: RecoveryIntelligenceRepository;
  readonly s3Client: S3Client;
  readonly snsClient: SNSClient;
  readonly archiveBucket: string;
  readonly notifyTopicArn?: string;
  readonly expectedMinutes?: number;
  readonly dryRun?: boolean;
}

export class RecoveryIntelligenceOrchestrator {
  private readonly repository: RecoveryIntelligenceRepository;
  private readonly s3Client: S3Client;
  private readonly snsClient: SNSClient;
  private readonly archiveBucket: string;
  private readonly notifyTopicArn?: string;
  private readonly expectedMinutes?: number;
  private readonly dryRun?: boolean;

  constructor(private readonly options: RunDependencies) {
    this.repository = options.repository;
    this.s3Client = options.s3Client;
    this.snsClient = options.snsClient;
    this.archiveBucket = options.archiveBucket;
    this.notifyTopicArn = options.notifyTopicArn;
    this.expectedMinutes = options.expectedMinutes;
    this.dryRun = options.dryRun;
  }

  async run(
    request: IntelligenceRunRequest,
  ): Promise<Result<IntelligenceRunResult, Error>> {
    const compile = compilePlan({
      bundle: request.bundle,
      expectedMinutes: request.planHorizonMinutes ?? this.expectedMinutes ?? 12,
      includeComplianceActions: true,
    });
    const evaluation = evaluateReadiness(compile.bundle);

    const normalized = normalizeDecision(evaluation.decision);
    const recommendation = {
      ...compile.recommendation,
      rationale: `${compile.recommendation.rationale}; normalized=${normalized}`,
    } as RecoveryRecommendation;

    await this.storeBundle(compile.bundle, compile.forecast, recommendation);

    if (request.dryRun || this.dryRun) {
      return ok({
        bundleId: compile.bundle.bundleId,
        forecast: compile.forecast,
        recommendation,
        status: 'ok',
        errors: [],
      });
    }

    const archiveResult = await this.archiveRunbook(recommendation, compile.forecast);
    if (!archiveResult.ok) return fail(archiveResult.error);

    if (this.notifyTopicArn) {
      const notifyResult = await this.publishReadinessAlert(compile.bundle, recommendation);
      if (!notifyResult.ok) return fail(notifyResult.error);
    }

    if (evaluation.decision.status === 'abort') {
      return ok({
        bundleId: compile.bundle.bundleId,
        forecast: compile.forecast,
        recommendation,
        status: 'error',
        errors: ['aborted-by-triage-policy'],
      });
    }

    return ok({
      bundleId: compile.bundle.bundleId,
      forecast: compile.forecast,
      recommendation,
      status: 'ok',
      errors: [],
    });
  }

  private async storeBundle(
    bundle: RecoverySignalBundle,
    forecast: RecoveryForecast,
    recommendation: RecoveryRecommendation,
  ): Promise<Result<void, Error>> {
    const runbook = buildRunbookFromActions(recommendation.actions);
    const storeResult = await this.repository.saveBundle(bundle);
    if (!storeResult.ok) return fail(storeResult.error);
    const forecastResult = await this.repository.saveForecast({
      forecastId: forecast.forecastId,
      bundleId: bundle.bundleId,
      forecast,
      generatedAt: new Date().toISOString(),
    });
    if (!forecastResult.ok) return fail(forecastResult.error);
    const recommendationResult = await this.repository.saveRecommendation({
      recommendationId: recommendation.recommendationId,
      tenantId: bundle.context.tenantId,
      bundleId: bundle.bundleId,
      recommendation,
      createdAt: new Date().toISOString(),
      status: 'active',
    });
    if (!recommendationResult.ok) return fail(recommendationResult.error);
    const actionPlanResult = await this.repository.upsertPlan({
      planId: `${bundle.bundleId}-runbook` as StoredActionPlan['planId'],
      tenantId: bundle.context.tenantId,
      bundleId: bundle.bundleId,
      actions: recommendation.actions,
      runbook,
      createdAt: new Date().toISOString(),
    });
    return actionPlanResult.ok ? ok(undefined) : fail(actionPlanResult.error);
  }

  private async archiveRunbook(recommendation: RecoveryRecommendation, forecast: RecoveryForecast): Promise<Result<string, Error>> {
    try {
      const etag = await archiveForecast(this.s3Client, this.archiveBucket, {
        recommendation,
        forecast,
      });
      return ok(etag);
    } catch (error) {
      return fail(error as Error);
    }
  }

  private async publishReadinessAlert(bundle: RecoverySignalBundle, recommendation: RecoveryRecommendation): Promise<Result<string, Error>> {
    if (!this.notifyTopicArn) return ok('notifications-disabled');
    try {
      const messageId = await publishNotification(this.snsClient, {
        channelArn: this.notifyTopicArn,
        tenantId: bundle.context.tenantId,
        bundleId: bundle.bundleId,
      });
      return ok(messageId);
    } catch (error) {
      return fail(error as Error);
    }
  }
}
