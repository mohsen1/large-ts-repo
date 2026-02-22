import { z } from 'zod';
import {
  buildExecutionEnvelope,
  evaluateScenario,
  type IncidentContext,
  type RecoveryScenario,
  ScenarioFilter,
} from '@domain/recovery-scenario-engine';
import { InMemoryScenarioStore, findBestTimelineMatch } from '@data/recovery-scenario-store';
import { ScenarioAdapter, type AdapterConfig } from '@infrastructure/recovery-scenario-orchestration-adapters';
import { MemoryTraceCollector } from '@infrastructure/recovery-scenario-orchestration-adapters';
import type { Result } from '@shared/result';
import { ok, err } from '@shared/result';
import { toTrace } from '@infrastructure/recovery-scenario-orchestration-adapters';

const SignalPayload = z.object({
  incidentId: z.string(),
  scenarioId: z.string(),
  tenantId: z.string(),
  service: z.string(),
  region: z.string(),
  detectedAt: z.string().datetime(),
  signals: z.array(
    z.object({
      metric: z.string(),
      value: z.number(),
      unit: z.string(),
      dimension: z.record(z.string()),
      observedAt: z.string().datetime(),
    }),
  ),
  rawMetadata: z.record(z.unknown()),
});

export interface OrchestratorServices {
  adapterConfig: AdapterConfig;
}

export interface OrchestratorOptions {
  services: OrchestratorServices;
  store: InMemoryScenarioStore;
}

export interface OrchestratorOutcome {
  runId: string;
  publishedCount: number;
  timelineSize: number;
}

export class RecoveryScenarioOrchestrator {
  #adapter: ScenarioAdapter;
  #store: InMemoryScenarioStore;
  #traces: MemoryTraceCollector;

  constructor(options: OrchestratorOptions) {
    this.#adapter = new ScenarioAdapter(options.services.adapterConfig);
    this.#store = options.store;
    this.#traces = new MemoryTraceCollector();
  }

  async evaluateAndRun(tenant: string, rawContext: unknown): Promise<Result<OrchestratorOutcome, string>> {
    const parsed = SignalPayload.safeParse(rawContext);
    if (!parsed.success) {
      return err('invalid-context');
    }

    const scenarios = this.#store.queryScenarios({ tenantId: parsed.data.tenantId as any, state: 'triage' });
    const context = this.#toIncidentContext(parsed.data);

    const envelopes = scenarios
      .map((scenario) => buildExecutionEnvelope(scenario, context))
      .filter((envelope) => evaluateScenario(envelope.scenario, context).confidence > 40);

    const published = await this.#adapter.publishBatch(envelopes);

    for (const envelope of envelopes) {
      this.#traces.push({
        scenarioId: envelope.scenario.id,
        incidentId: envelope.context.incidentId,
        decision: envelope.decision,
        metrics: envelope.metrics,
        emittedAt: new Date().toISOString(),
      });
    }

    return ok({
      runId: `${tenant}:${context.incidentId}:${Date.now()}`,
      publishedCount: published.length,
      timelineSize: envelopes.length,
    });
  }

  async evaluateWithFilter(filter: ScenarioFilter): Promise<Result<number, string>> {
    const scenarios = this.#store.queryScenarios(filter);
    const published = await this.#adapter.publishBatch(
      scenarios.map((scenario) =>
        buildExecutionEnvelope(scenario, {
          incidentId: `incident-${Date.now()}`,
          scenarioId: scenario.id,
          tenantId: scenario.tenantId,
          service: 'default',
          region: 'us-east-1',
          detectedAt: new Date().toISOString(),
          signals: [],
          rawMetadata: { severity: 'medium', retryBudget: 0 },
        }),
      ),
    );
    return ok(published.length);
  }

  flushTraces(): string[] {
    return this.#traces.flush().map(toTrace);
  }

  private _toRunId(scenario: RecoveryScenario): string {
    return `${scenario.tenantId}:${scenario.id}:${Date.now()}`;
  }

  #toIncidentContext(parsed: z.infer<typeof SignalPayload>): IncidentContext {
    return {
      incidentId: parsed.incidentId,
      scenarioId: parsed.scenarioId,
      tenantId: parsed.tenantId,
      service: parsed.service,
      region: parsed.region,
      detectedAt: parsed.detectedAt,
      signals: parsed.signals,
      rawMetadata: parsed.rawMetadata,
    };
  }

  latestTimeline(incidentId: string) {
    return findBestTimelineMatch(this.#store, incidentId);
  }

  scenarioRunId(scenario: RecoveryScenario): string {
    return this._toRunId(scenario);
  }
}
