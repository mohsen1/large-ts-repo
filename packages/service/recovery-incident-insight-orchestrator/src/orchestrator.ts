import { randomUUID } from 'crypto';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import {
  type RecoveryIncidentInsightsStoreRepository,
  type RunExecution,
  InMemoryRecoveryIncidentInsightsStore,
} from '@data/recovery-incident-insights-store/src/repository';
import { generateForecast, type IncidentForecast, buildPolicyDecision, deriveReadiness } from '@domain/recovery-incident-insights/src';
import type { RunIncidentInsightsWithBundleInput, RunResult } from './commands';
import type { IncidentNotifier } from '@infrastructure/recovery-incident-notifier/src/types';
import { runForecastWorkflow } from './workflow';
import { validateBundle } from './validation';

interface OrchestratorDependencies {
  repository?: RecoveryIncidentInsightsStoreRepository;
  notifier: IncidentNotifier;
  expectedWindowMinutes: number;
}

export class RecoveryIncidentInsightOrchestrator {
  private readonly repository: RecoveryIncidentInsightsStoreRepository;
  private readonly notifier: IncidentNotifier;
  private readonly expectedWindowMinutes: number;

  constructor(dependencies: OrchestratorDependencies) {
    this.repository = dependencies.repository ?? new InMemoryRecoveryIncidentInsightsStore();
    this.notifier = dependencies.notifier;
    this.expectedWindowMinutes = dependencies.expectedWindowMinutes;
  }

  async run(input: RunIncidentInsightsWithBundleInput): Promise<Result<RunResult, Error>> {
    const startedAt = new Date().toISOString();
    const parsed = validateBundle({
      ...input,
      runId: input.runId,
      tenantId: input.tenantId,
      incidentId: input.incidentId,
      candidateWindowMinutes: input.candidateWindowMinutes,
      runForecast: input.runForecast,
      dryRun: input.dryRun,
      bundle: input.bundle,
    });
    if (!parsed.ok) return fail(parsed.error);

    const runId = `run:${parsed.value.runId}` as RunExecution['runId'];
    await this.repository.saveRunExecution({
      runId,
      tenantId: parsed.value.tenantId as RunExecution['tenantId'],
      incidentId: parsed.value.incidentId as RunExecution['incidentId'],
      status: 'running',
      startedAt,
      steps: ['bundle-ingest', 'policy-check', 'forecast', 'notify'],
    });

    const bundle = parsed.value.bundle;
    const workflow = runForecastWorkflow({
      bundle,
      candidateWindowMinutes: parsed.value.candidateWindowMinutes ?? this.expectedWindowMinutes,
    });

    const storeSignalsResult = await this.repository.appendBundle(bundle);
    if (!storeSignalsResult.ok) return fail(storeSignalsResult.error);
    const forecastStoreResult = parsed.value.runForecast ? await this.repository.saveForecast(workflow.forecast) : ok('');
    if (!forecastStoreResult.ok) return fail(forecastStoreResult.error);

    const readiness = deriveReadiness(bundle);
    const notifyReadiness = await this.notifier.publishReadiness({
      tenantId: readiness.tenantId,
      incidentId: readiness.incidentId,
      readinessScore: readiness.score,
      state: readiness.state,
      observedUntil: readiness.observedUntil,
      generatedAt: new Date().toISOString(),
    });
    const forecastNotify = parsed.value.runForecast
      ? await this.notifier.publishForecast({
          tenantId: bundle.tenantId,
          forecastId: workflow.forecast.forecastId,
          bundleId: bundle.bundleId,
          planConfidence: workflow.forecast.forecastWindow.confidence,
          actions: workflow.forecast.recommendations.length,
        })
      : ok('forecast-disabled');

    const finishedAt = new Date().toISOString();
    if (!notifyReadiness.ok || !forecastNotify.ok) {
      await this.repository.saveRunExecution({
        runId,
        tenantId: parsed.value.tenantId as RunExecution['tenantId'],
        incidentId: parsed.value.incidentId as RunExecution['incidentId'],
        status: 'failed',
        startedAt,
        finishedAt,
        steps: ['bundle-ingest', 'policy-check', 'forecast', 'notify'],
      });
      return fail(new Error(notifyReadiness.ok ? forecastNotify.error.message : notifyReadiness.error.message));
    }

    await this.repository.saveRunExecution({
      runId,
      tenantId: parsed.value.tenantId as RunExecution['tenantId'],
      incidentId: parsed.value.incidentId as RunExecution['incidentId'],
      status: 'complete',
      startedAt,
      finishedAt,
      steps: ['bundle-ingest', 'policy-check', 'forecast', 'notify'],
    });

    return ok({
      runId,
      tenantId: bundle.tenantId,
      bundleId: bundle.bundleId,
      forecastId: workflow.forecast.forecastId,
      readinessState: readiness.state,
      policyDecisions: workflow.policies.outcomes.length,
      notified: notifyReadiness.ok && forecastNotify.ok,
      startedAt,
      finishedAt,
    });
  }

  async dryRunFromSignals(input: RunIncidentInsightsWithBundleInput): Promise<Result<IncidentForecast, Error>> {
    const parsed = validateBundle({
      ...input,
      runId: input.runId,
      tenantId: input.tenantId,
      incidentId: input.incidentId,
      candidateWindowMinutes: input.candidateWindowMinutes,
      runForecast: input.runForecast,
      dryRun: input.dryRun,
      bundle: input.bundle,
    });
    if (!parsed.ok) return fail(parsed.error);
    const forecast = generateForecast(
      parsed.value.bundle,
      parsed.value.candidateWindowMinutes ?? this.expectedWindowMinutes,
      randomUUID(),
    );
    return ok(forecast);
  }

  async policyCheck(incidentId: string): Promise<Result<ReturnType<typeof buildPolicyDecision>, Error>> {
    const runs = await this.repository.findBundles({ incidentId, limit: 1 });
    const [latest] = runs;
    if (!latest) return fail(new Error('no-bundle'));
    return ok(buildPolicyDecision(latest.bundle, this.expectedWindowMinutes));
  }
}
