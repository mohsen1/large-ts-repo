import {
  RecoveryIntent,
  simulateIntentRecovery,
  pickBestScenario,
  intentToEnvelope,
  logRiskFlagged,
  IntentTimeline,
} from '@domain/recovery-cockpit-orchestration-core';
import { InMemoryIntentStore, IntentEnvelopeStore, IntentStore } from '@data/recovery-cockpit-intent-store';
import { ok, fail, Result } from '@shared/result';
import { IntentGraphEngine } from './orchestrationGraph';
import { evaluatePolicy, PolicyConfig } from './policyEngine';

type CockpitAnalytics = { refresh(): Promise<void> };

type TimelineByIntent = Record<string, IntentTimeline>;

export type CockpitIntentOrchestratorConfig = PolicyConfig & {
  simulationEnabled: boolean;
  parallelism: number;
};

const defaultConfig = (override?: Partial<CockpitIntentOrchestratorConfig>): CockpitIntentOrchestratorConfig => ({
  maxActive: 8,
  allowThrottle: true,
  enforceManualReview: true,
  criticalMode: false,
  simulationEnabled: true,
  parallelism: 3,
  ...override,
});

const buildRejectionTimeline = (intentId: string, timeline: TimelineByIntent, reason: string): IntentTimeline => {
  const base = timeline[intentId] ?? { intentId, events: [] };
  return logRiskFlagged(base, 'policy-service', reason, 95);
};

export class CockpitIntentOrchestrator {
  private readonly config: CockpitIntentOrchestratorConfig;
  private readonly graph: IntentGraphEngine;

  constructor(
    private readonly store: InMemoryIntentStore & IntentEnvelopeStore & IntentStore,
    private readonly analytics: CockpitAnalytics,
    config: Partial<CockpitIntentOrchestratorConfig> = {},
  ) {
    this.config = defaultConfig(config);
    this.graph = new IntentGraphEngine(this.store, this.analytics);
  }

  async stage(intent: RecoveryIntent): Promise<Result<RecoveryIntent, Error>> {
    const decision = await evaluatePolicy(this.store, this.config, intent);
    const envelope = intentToEnvelope(intent);

    if (decision.action === 'reject') {
      const timeline = await this.store.listEnvelopes(intent.intentId);
      const previous = timeline.ok ? timeline.value : [];
      const known: TimelineByIntent = {
        [intent.intentId]: {
          intentId: intent.intentId,
          events: previous.map(() => ({
            eventId: `bootstrap-${intent.intentId}`,
            type: 'simulation-generated',
            at: new Date().toISOString(),
            intentId: intent.intentId,
            actor: 'system-bridge',
            message: 'existing record',
            payload: { count: previous.length },
          })),
        },
      };
      const rejected = buildRejectionTimeline(intent.intentId, known, decision.reason);
      const logged = logRiskFlagged(
        rejected,
        intent.operator,
        decision.reason,
        100,
      );
      void logged;
      await this.store.appendEnvelope(intent, envelope);
      return fail(new Error(`intent ${intent.intentId} rejected`));
    }

    const applied = await this.store.upsertIntent(intent);
    if (!applied.ok) {
      return fail(applied.error);
    }

    await this.store.appendEnvelope(intent, envelope);

    if (!this.config.criticalMode && this.config.simulationEnabled) {
      const report = simulateIntentRecovery(intent);
      const best = pickBestScenario(report);
      void best;
    }

    return ok(applied.value);
  }

  async schedule(): Promise<string[]> {
    const next = await this.graph.build();
    return next.nodes
      .filter((node) => node.status !== 'completed' && node.status !== 'aborted')
      .slice(0, Math.max(1, this.config.parallelism))
      .map((node) => node.intentId);
  }

  async heartbeat() {
    const graph = await this.graph.build();
    const timelineMap = new Map(graph.nodes.map((node) => [node.intentId, { intentId: node.intentId, events: [] }]));
    const report = await this.graph.heartbeat(timelineMap);
    await this.analytics.refresh();
    return report;
  }
}

export const createIntentOrchestrator = (
  store: InMemoryIntentStore & IntentEnvelopeStore & IntentStore,
  analytics: CockpitAnalytics,
  config: Partial<CockpitIntentOrchestratorConfig> = {},
) => new CockpitIntentOrchestrator(store, analytics, config);
