import { AdaptivePolicy, AdaptiveDecision } from '@domain/adaptive-ops';
import {
  AdaptivePlaybookRuntime,
  PlaybookRunInput,
  PlaybookRunOutcome,
  SignalKind,
  SignalSample,
} from '@domain/adaptive-ops';
import { HealthSnapshot, computeRiskTier, type RunForecast } from '@domain/adaptive-ops-metrics';

export type PlaybookEnginePolicyState = {
  tenantId: string;
  policyId: string;
  policyName: string;
  accepted: boolean;
  confidence: number;
  actionCount: number;
};

export interface PlaybookEngineResult {
  outcome: PlaybookRunOutcome | null;
  forecast: RunForecast | null;
  loading: boolean;
  lastRunId: string | null;
  error: string | null;
}

export type PlaybookFilter = {
  tenantId: string;
  preferredKinds: readonly SignalKind[];
  maxActions: number;
  maxForecastMinutes: number;
};

const defaultFilter: PlaybookFilter = {
  tenantId: 'tenant-a',
  preferredKinds: ['error-rate', 'latency', 'availability', 'manual-flag'],
  maxActions: 12,
  maxForecastMinutes: 30,
};

type SignalState = 'idle' | 'bootstrapping' | 'running' | 'ready' | 'error';

const metricsForDecisions = (decisions: readonly AdaptiveDecision[]): HealthSnapshot => {
  if (decisions.length === 0) {
    return { tenantId: 'unknown', runId: 'none', score: 0, riskTier: 'safe', details: 'no decisions' };
  }
  const score = decisions.reduce((acc, decision) => acc + decision.confidence, 0) / decisions.length;
  return {
    tenantId: `${decisions[0].policyId}`,
    runId: `${decisions[0].incidentId}`,
    score,
    riskTier: computeRiskTier(score),
    details: `signals=${decisions.length}`,
  };
};

export class PlaybookEngine {
  private runtime: AdaptivePlaybookRuntime | null = null;
  private state: SignalState = 'idle';
  private lastError: string | null = null;
  private filter: PlaybookFilter = defaultFilter;
  private outcome: PlaybookRunOutcome | null = null;
  private latestForecast: RunForecast | null = null;
  private readonly outcomes: PlaybookRunOutcome[] = [];

  get currentOutcome(): PlaybookRunOutcome | null {
    return this.outcome;
  }

  get currentForecast(): RunForecast | null {
    return this.latestForecast;
  }

  get loading(): boolean {
    return this.state === 'running' || this.state === 'bootstrapping';
  }

  get lastRunId(): string | null {
    return this.outcome?.runId ?? null;
  }

  get status(): SignalState {
    return this.state;
  }

  get metrics() {
    return this.outcome ? metricsForDecisions(this.outcome.decisions) : null;
  }

  get error(): string | null {
    return this.lastError;
  }

  get policyState(): PlaybookEnginePolicyState[] {
    return this.outcome
      ? this.outcome.policyStates.map((entry) => ({
          tenantId: this.filter.tenantId,
          policyId: entry.policyId,
          policyName: `policy-${entry.policyId}`,
          accepted: entry.accepted,
          confidence: entry.riskScore,
          actionCount: entry.actionCount,
        }))
      : [];
  }

  get history(): readonly PlaybookRunOutcome[] {
    return [...this.outcomes];
  }

  setFilter(next: Partial<PlaybookFilter>) {
    this.filter = { ...this.filter, ...next };
  }

  async bootstrap(policies: readonly AdaptivePolicy[]) {
    this.state = 'bootstrapping';
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.runtime = new AdaptivePlaybookRuntime(this.filter.tenantId, ['manual-flag', ...this.filter.preferredKinds], undefined, this.filter.maxActions);
    this.state = 'idle';
  }

  async run(policies: readonly AdaptivePolicy[], signals: readonly SignalSample[]) {
    if (!this.runtime) {
      await this.bootstrap(policies);
    }
    if (!this.runtime) {
      throw new Error('runtime unavailable');
    }
    this.state = 'running';
    this.lastError = null;

    const input: PlaybookRunInput<readonly AdaptivePolicy[], readonly SignalSample[]> = {
      tenantId: this.filter.tenantId,
      policies,
      signals: signals.filter((signal) => this.filter.preferredKinds.includes(signal.kind)),
      preferredKinds: this.filter.preferredKinds,
      maxActionCount: this.filter.maxActions,
      stageOrder: ['ingest', 'transform', 'evaluate', 'simulate', 'commit'],
    };

    try {
      const outcome = await this.runtime.execute(input);
      this.outcome = outcome;
      this.outcomes.unshift(outcome);
      this.state = 'ready';
      return outcome;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'playbook execution failed';
      this.state = 'error';
      return this.outcome;
    }
  }

  async forecastRun(runId: string, horizonMinutes: number) {
    if (!this.outcome) return null;
    const metrics = this.outcome.decisions[0];
    if (!metrics) return null;
    const baseSignalCount = this.outcome.actions.length + this.outcome.traces.length;
    const tenantId = this.filter.tenantId;
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.latestForecast = {
      runId,
      tenantId,
      points: [
        {
          timestamp: new Date().toISOString(),
          projectedRisk: 0.12,
          expectedRecoveryMinutes: Math.max(5, Math.floor(baseSignalCount / 4)),
          dominantPolicyId: this.outcome.topPolicyId,
          confidence: 0.71,
        },
      ],
      recommendation: baseSignalCount > horizonMinutes ? 'scale' : baseSignalCount > 0 ? 'observe' : 'noop',
    };
    return this.latestForecast;
  }
}

export const createPlaybookEngine = (filter?: Partial<PlaybookFilter>) => {
  const engine = new PlaybookEngine();
  if (filter) {
    engine.setFilter(filter);
  }
  return engine;
};

export const hydratePlaybookResult = (engine: PlaybookEngine): PlaybookEngineResult => ({
  outcome: engine.currentOutcome,
  forecast: engine.currentForecast,
  loading: engine.loading,
  lastRunId: engine.lastRunId,
  error: engine.error,
});
