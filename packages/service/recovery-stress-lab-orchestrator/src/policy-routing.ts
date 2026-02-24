import {
  type CommandRunbook,
  type CommandRunbookId,
  type RecoverySignal,
  type TenantId,
  type StressRunState,
  type WorkloadTopology,
  type OrchestrationPlan,
  compileValidationBundle,
} from '@domain/recovery-stress-lab';
import { rankRunbooksByReadiness } from './analytics';

export interface RoutingInput {
  readonly tenantId: TenantId;
  readonly band: 'low' | 'medium' | 'high' | 'critical';
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly topology: WorkloadTopology;
  readonly plan: OrchestrationPlan | null;
  readonly state: StressRunState | null;
}

export interface RoutePolicy {
  readonly runbookId: CommandRunbookId;
  readonly score: number;
  readonly active: boolean;
  readonly rationale: string;
}

export interface RoutingDecision {
  readonly tenantId: TenantId;
  readonly policies: readonly RoutePolicy[];
  readonly blockedByPolicy: readonly string[];
  readonly readyForSimulation: boolean;
}

const classifyReadiness = (
  runbook: CommandRunbook,
  index: number,
  state: StressRunState | null,
  band: RoutingInput['band'],
): string => {
  if (runbook.steps.length === 0) {
    return 'disabled:empty-runbook';
  }
  if (band === 'critical' && index > 1) {
    return state?.selectedBand === 'critical' ? 'high-priority' : 'deferred-critical';
  }
  if (band === 'low' && runbook.steps.length > 8) {
    return 'deferred-low-band';
  }
  return state?.selectedSignals.length ? 'active' : 'standby';
};

const mapSignalDensity = (signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) {
    return 0;
  }
  const score = signals.reduce((acc, signal) => {
    if (signal.severity === 'critical') return acc + 4;
    if (signal.severity === 'high') return acc + 3;
    if (signal.severity === 'medium') return acc + 2;
    return acc + 1;
  }, 0);

  return Number((score / Math.max(1, signals.length)).toFixed(4));
};

export const buildPolicyRouting = (input: RoutingInput): RoutingDecision => {
  const validation = compileValidationBundle(input.tenantId, {
    topology: input.topology,
    runbooks: input.runbooks,
    signals: input.signals,
    band: input.band,
    plan: input.plan ?? undefined,
    signalDigest: undefined,
  });

  const ranked = rankRunbooksByReadiness(input.runbooks);
  const rankedByScore = ranked
    .map((entry) => ({
      runbook: input.runbooks.find((candidate) => candidate.id === entry.id),
      score: entry.score,
    }))
    .filter((entry): entry is { runbook: CommandRunbook; score: number } => Boolean(entry.runbook))
    .map((entry, index) => {
      const runbook = entry.runbook;
      return {
        runbookId: runbook.id,
        score: entry.score,
        active: index < 5,
        rationale: classifyReadiness(runbook, index, input.state, input.band),
      };
    })
    .slice(0, 20);

  const blockers = [...validation.issues, ...validation.breakdown.topology.issues, ...validation.breakdown.runbooks.issues]
    .map((issue) => `${issue.code}:${issue.message}`);

  return {
    tenantId: input.tenantId,
    policies: rankedByScore,
    blockedByPolicy: blockers,
    readyForSimulation: input.plan !== null && validation.valid && mapSignalDensity(input.signals) >= 1,
  };
};

export const summarizeRouting = (decision: RoutingDecision): readonly string[] => [
  `tenant=${decision.tenantId}`,
  `policies=${decision.policies.length}`,
  `active=${decision.policies.filter((policy) => policy.active).length}`,
  `blocked=${decision.blockedByPolicy.length}`,
  `ready=${decision.readyForSimulation}`,
  ...decision.blockedByPolicy.slice(0, 8),
];
