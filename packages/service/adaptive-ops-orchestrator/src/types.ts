import { AdaptiveDecision, AdaptivePolicy, SignalSample, AdaptiveAction } from '@domain/adaptive-ops';
import { SignalDigest, PolicyGraphNode, HealthSignal } from '@domain/adaptive-ops-metrics';

export interface CommandInput {
  tenantId: string;
  windowMs: number;
  policies: readonly AdaptivePolicy[];
  signals: readonly SignalSample[];
  dryRun: boolean;
  maxActions: number;
}

export interface CommandPlan {
  tenantId: string;
  requestedWindowMs: number;
  filteredPolicies: readonly AdaptivePolicy[];
  activePolicies: readonly AdaptivePolicy[];
  candidateActions: readonly AdaptiveAction[];
  decisions: readonly AdaptiveDecision[];
  topAction: AdaptiveAction | null;
  runId: string | null;
  policyGraph?: readonly PolicyGraphNode[];
  healthSignals?: readonly HealthSignal[];
  signalDigests?: readonly SignalDigest[];
}

export interface CommandMetrics {
  signalKinds: readonly string[];
  policyCount: number;
  actionCount: number;
  topConfidence: number;
  avgConfidence: number;
  uniqueSignalKinds: number;
  healthSignalCount?: number;
}

export interface CommandResult {
  ok: boolean;
  plan: CommandPlan;
  metrics: CommandMetrics;
  error: string | null;
}
