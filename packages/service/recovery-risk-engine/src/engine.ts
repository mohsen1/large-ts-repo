import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';

import {
  buildRiskAssessment,
  calculateWindow,
  sliceSignalsByWindow,
  type EvidenceWindow,
  type RiskAssessment,
  type RiskContext,
  type RiskRunId,
  type RiskSignal,
} from '@domain/recovery-risk-models';
import type { RecoveryPolicy } from '@domain/recovery-policy';
import type { RecoveryProgram, RecoveryRunState } from '@domain/recovery-orchestration';
import { asRiskSignalEnvelope } from '@data/recovery-risk-store';
import type {
  RecoveryRiskProfileSnapshot,
  RecoveryRiskRepository,
  RiskHistoryPage,
  RiskQuery,
} from '@data/recovery-risk-store';
import type { RecoveryPolicyRepository } from '@data/recovery-policy-store';
import {
  RiskOrchestrator,
  type OrchestrationOutcome,
} from '@service/recovery-risk-orchestrator/src/runner';
import type {
  RiskConstraint,
  RiskScenario,
  ScenarioSignal,
  StrategyCommandInput,
  StrategyProfile,
} from '@domain/recovery-risk-strategy';

export interface RunRiskContext {
  runId: RiskRunId;
  program: RecoveryProgram;
  runState: RecoveryRunState;
  tenant: RecoveryProgram['tenant'];
  policies: readonly RecoveryPolicy[];
  signals: readonly RiskSignal[];
}

export interface RiskEngineDecision {
  readonly assessment: RiskAssessment;
  readonly recommendations: readonly string[];
  readonly shouldAbort: boolean;
  readonly shouldDefer: boolean;
  readonly recommendationsFromSignals: number;
}

export interface RiskEngineDependencies {
  riskRepository: RecoveryRiskRepository;
  policyRepository: RecoveryPolicyRepository;
}

export class RecoveryRiskEngine {
  private readonly orchestrator = new RiskOrchestrator();

  constructor(private readonly deps: RiskEngineDependencies) {}

  async evaluate(context: RunRiskContext): Promise<Result<RiskEngineDecision, Error>> {
    const now = new Date().toISOString();
    const window: EvidenceWindow = {
      from: context.runState.startedAt ?? now,
      to: now,
      includeRecoveries: true,
      limit: 300,
    };

    const domainContext: RiskContext = {
      programId: context.program.id,
      runId: context.runId,
      tenant: context.tenant,
      currentStatus: context.runState.status,
      allowedWindow: calculateWindow(context.runId, 0),
    };

    const factors = context.policies.map((policy) => ({
      name: `policy:${policy.name}`,
      dimension: 'compliance' as const,
      impact:
        policy.severity === 'critical'
          ? 1
          : policy.severity === 'error'
            ? 0.75
            : policy.severity === 'warn'
              ? 0.5
              : 0.4,
      confidence: policy.enabled ? 0.9 : 0.3,
      evidence: policy.description,
    }));

    const signals = sliceSignalsByWindow(context.signals, window);
    const assessment = buildRiskAssessment(domainContext, signals, factors);

    const strategyInput = this.toStrategyInput(context, signals);
    const orchestrated = await this.runOrchestrator(strategyInput);
    if (!orchestrated.ok) {
      return fail(orchestrated.error);
    }

    const decision: RiskEngineDecision = {
      assessment,
      recommendations: this.adaptRecommendations(assessment, orchestrated.value),
      shouldAbort: orchestrated.value.result.severityBand === 'black',
      shouldDefer:
        orchestrated.value.result.severityBand === 'red' || orchestrated.value.result.severityBand === 'yellow',
      recommendationsFromSignals: signals.length,
    };

    await this.persistArtifacts(context, assessment, signals);
    return ok(decision);
  }

  async recentRuns(query: RiskQuery): Promise<RiskHistoryPage> {
    const runId = query.runId;
    if (!runId) {
      return {
        items: [],
        hasMore: false,
        total: 0,
        nextCursor: undefined,
      };
    }

    const latest = await this.deps.riskRepository.findLatest(runId);
    const items = latest ? [latest] : [];
    return {
      items,
      hasMore: false,
      total: items.length,
      nextCursor: undefined,
    };
  }

  private adaptRecommendations(
    assessment: RiskAssessment,
    outcome: OrchestrationOutcome,
  ): readonly string[] {
    return [
      ...assessment.findings.map((finding) => `${finding.factorName}: ${finding.recommendation}`),
      outcome.decision,
      outcome.publishStatus,
      outcome.timelineSummary,
    ];
  }

  private async runOrchestrator(input: StrategyCommandInput): Promise<Result<OrchestrationOutcome, Error>> {
    return this.orchestrator.run(input);
  }

  private toStrategyInput(context: RunRiskContext, signals: readonly RiskSignal[]): StrategyCommandInput {
    const profileId = `${context.runId}:profile` as StrategyProfile['profileId'];

    const constraints: readonly RiskConstraint[] = context.policies.map((policy) => ({
      constraintId: `${policy.id}:constraint` as RiskConstraint['constraintId'],
      strategyId: profileId,
      dimension: 'compliance',
      minimum: 0,
      maximum: 100,
      state: policy.enabled ? 'enforced' : 'inactive',
      note: policy.description,
      touchedBy: 'risk-engine',
      createdAt: new Date().toISOString(),
    }));

    const scenario: RiskScenario = {
      scenarioId: `${context.runId}:scenario` as RiskScenario['scenarioId'],
      strategyId: profileId,
      title: `scenario-${context.runId}`,
      severityBias: context.policies.length,
      constraints,
      budgets: [
        {
          name: 'compute-budget',
          resourceClass: 'compute',
          softCap: 100,
          hardCap: 120,
          headroomPercent: 10,
          allocatedAt: new Date().toISOString(),
        },
      ],
      policyHandle: `${context.runId}:policy` as RiskScenario['policyHandle'],
      tags: ['auto', 'recovery-risk'],
    };

    const profile: StrategyProfile = {
      profileId,
      name: `run-${context.runId}`,
      description: `Auto-generated profile for ${context.program.name}`,
      owner: 'owner' as StrategyProfile['owner'],
      scenarios: [scenario],
      weights: [
        { dimension: 'blastRadius', weight: 0.45, priority: 3 },
        { dimension: 'recoveryLatency', weight: 0.3, priority: 2 },
        { dimension: 'compliance', weight: 0.25, priority: 1 },
      ],
      active: true,
      createdAt: new Date().toISOString(),
    };

    const convertedSignals = signals.map<ScenarioSignal>((signal) => ({
      id: `${signal.id}:bridge` as ScenarioSignal['id'],
      scenarioId: scenario.scenarioId,
      signalName: signal.metricName,
      score: signal.value * 100,
      observedAt: signal.observedAt,
      confidence: signal.weight === 1 ? 'high' : signal.weight > 0.5 ? 'medium' : 'low',
      metadata: {
        source: signal.source,
        runId: `${signal.runId}`,
      },
    }));

    return {
      strategy: profile,
      scenario,
      signals: convertedSignals,
      budgets: scenario.budgets,
      constraints,
    };
  }

  private async persistArtifacts(
    context: RunRiskContext,
    assessment: RiskAssessment,
    signals: readonly RiskSignal[],
  ): Promise<void> {
    const factors = assessment.findings.map((finding) => ({
      name: finding.factorName,
      dimension: finding.dimension,
      impact: finding.score / 100,
      confidence: 0.85,
      evidence: finding.recommendation,
    }));

    const snapshot: RecoveryRiskProfileSnapshot = {
      profileId: `${context.runId}:snapshot` as never,
      runId: context.runId,
      policy: context.policies.at(0),
      assessment,
      window: calculateWindow(context.runId, 0),
      factors,
      createdAt: new Date().toISOString(),
    };

    for (const signal of signals.slice(0, 4)) {
      const encoded = asRiskSignalEnvelope(signal).envelope;
      await this.deps.riskRepository.appendSignal(encoded);
    }

    await this.deps.riskRepository.saveSnapshot(snapshot);
  }
}
