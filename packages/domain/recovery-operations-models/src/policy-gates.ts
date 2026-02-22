import type { RecoverySignal, IncidentFingerprint } from './types';
import { z } from 'zod';

export type PolicyDecision = 'allow' | 'warn' | 'block';
export type PolicyScope = 'global' | 'regional' | 'service';

export interface PolicyMetricBand {
  readonly min: number;
  readonly max: number;
  readonly label: 'green' | 'amber' | 'red' | 'critical';
}

export interface PolicyContext {
  readonly tenant: string;
  readonly signalDensity: number;
  readonly signalConfidence: number;
  readonly riskBand: 'green' | 'amber' | 'red' | 'critical';
  readonly readinessWindowHours: number;
}

export interface GateInput {
  readonly scope: PolicyScope;
  readonly context: PolicyContext;
  readonly fingerprint?: IncidentFingerprint;
  readonly signals: readonly RecoverySignal[];
}

export interface GateResult {
  readonly decision: PolicyDecision;
  readonly reasonCode: string;
  readonly score: number;
  readonly triggered: readonly string[];
  readonly acceptedAt?: string;
}

export interface PolicyRule<TInput extends GateInput = GateInput, TOutput extends GateResult = GateResult> {
  readonly id: string;
  readonly scope: PolicyScope;
  readonly priority: number;
  readonly evaluate: (input: TInput) => TOutput;
}

export type PolicyLedger<TInput extends GateInput> = ReadonlyArray<PolicyRule<TInput>>;

const confidenceBucket = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
};

const severityBuckets: readonly PolicyMetricBand[] = [
  { min: 0, max: 0.3, label: 'green' },
  { min: 0.3, max: 0.6, label: 'amber' },
  { min: 0.6, max: 0.85, label: 'red' },
  { min: 0.85, max: 1.5, label: 'critical' },
] as const;

const classifySeverity = (score: number): 'green' | 'amber' | 'red' | 'critical' => {
  const band = severityBuckets.find((entry) => score >= entry.min && score < entry.max);
  return band?.label ?? 'critical';
};

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  return fallback;
};

const weightedSignalScore = (signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) return 0;

  const total = signals.reduce((sum, signal) => {
    const severity = typeof signal.severity === 'number' ? signal.severity : 0;
    const confidence = typeof signal.confidence === 'number' ? signal.confidence : 0;
    return sum + severity * confidence;
  }, 0);

  return Number((total / signals.length).toFixed(4));
};

const parseScope = z.union([z.literal('global'), z.literal('regional'), z.literal('service')]);

const withBrandedDecision = (value: string): PolicyDecision => {
  if (value === 'allow' || value === 'warn' || value === 'block') {
    return value;
  }
  return 'warn';
};

export const buildDefaultPolicyContext = (tenant: string, signals: readonly RecoverySignal[]): PolicyContext => {
  const confidence = signals.length
    ? signals.reduce((sum, signal) => sum + confidenceBucket(signal.confidence), 0) / signals.length
    : 0;
  const density = signals.length;
  const topSeverity = weightedSignalScore(signals);

  return {
    tenant,
    signalDensity: density,
    signalConfidence: confidence,
    riskBand: classifySeverity(topSeverity),
    readinessWindowHours: Math.max(1, Math.ceil(density / 5)),
  };
};

export const policyGates: PolicyLedger<GateInput> = [
  {
    id: 'gate.low_signal_load',
    scope: 'global',
    priority: 10,
    evaluate: (input) => {
      const score = weightedSignalScore(input.signals);
      const decision: PolicyDecision = score < 3.5 ? 'allow' : 'warn';
      return {
        decision,
        reasonCode: `signal-load:${score}`,
        score,
        triggered: ['signal-load'],
      };
    },
  },
  {
    id: 'gate.signal-confidence',
    scope: 'global',
    priority: 20,
    evaluate: (input) => {
      const confidence = input.context.signalConfidence;
      const decision: PolicyDecision = confidence < 0.4 ? 'block' : confidence < 0.65 ? 'warn' : 'allow';
      return {
        decision,
        reasonCode: `confidence:${confidence}`,
        score: confidence * 10,
        triggered: ['signal-confidence'],
        acceptedAt: confidence >= 0.65 ? new Date().toISOString() : undefined,
      };
    },
  },
  {
    id: 'gate.readiness-window',
    scope: 'regional',
    priority: 30,
    evaluate: (input) => {
      const score = input.context.readinessWindowHours;
      const decision: PolicyDecision = score > 24 ? 'warn' : 'allow';
      return {
        decision,
        reasonCode: `readiness-window:${score}`,
        score,
        triggered: ['readiness-window'],
      };
    },
  },
  {
    id: 'gate.risk-threshold',
    scope: 'service',
    priority: 40,
    evaluate: (input) => {
      const riskBand = input.context.riskBand;
      const score = riskBand === 'red' ? 0.95 : riskBand === 'amber' ? 0.55 : 0.2;
      const decision: PolicyDecision = riskBand === 'red' ? 'block' : riskBand === 'amber' ? 'warn' : 'allow';
      return {
        decision,
        reasonCode: `risk-band:${riskBand}`,
        score,
        triggered: ['risk-band'],
      };
    },
  },
];

const sortedByPriority = <TInput extends GateInput>(rules: PolicyLedger<TInput>): PolicyLedger<TInput> =>
  [...rules].sort((a, b) => b.priority - a.priority);

export const normalizeGateInput = (input: GateInput, tenant: string): GateInput => ({
  ...input,
  scope: parseScope.parse(input.scope),
  context: {
    ...input.context,
    tenant,
  },
});

export const runPolicyLedger = (input: GateInput, scope: PolicyScope = 'global'): GateResult[] => {
  const rules = sortedByPriority(policyGates).filter((rule) => rule.scope === scope || rule.scope === 'global');
  const context = buildDefaultPolicyContext(input.context.tenant, input.signals);
  const enriched: GateInput = normalizeGateInput(
    {
      ...input,
      context: {
        ...context,
        tenant: input.context.tenant,
      },
    },
    input.context.tenant,
  );

  return rules.map((rule) => rule.evaluate(enriched)).map((result) => ({
    ...result,
    decision: withBooleanDecision(result.decision),
    reasonCode: result.reasonCode,
    score: result.score,
    triggered: result.triggered,
    acceptedAt: result.acceptedAt ?? (toBoolean(true, false) ? result.acceptedAt : undefined),
  }));
};

export const reduceGateResults = (results: readonly GateResult[]): GateResult => {
  const hasBlock = results.some((result) => result.decision === 'block');
  if (hasBlock) {
    return {
      decision: 'block',
      reasonCode: 'blocking-rule',
      score: 1,
      triggered: ['reduce'],
    };
  }

  const hasWarn = results.some((result) => result.decision === 'warn');
  if (hasWarn) {
    return {
      decision: 'warn',
      reasonCode: 'warning-rule',
      score: 0.6,
      triggered: ['reduce'],
    };
  }

  return {
    decision: 'allow',
    reasonCode: 'policy-ok',
    score: 0.1,
    triggered: ['reduce'],
  };
};

const withBooleanDecision = (value: string | PolicyDecision): PolicyDecision => {
  if (value === 'block' || value === 'warn' || value === 'allow') {
    return value;
  }
  return 'warn';
};

export const buildPolicyEnvelope = (
  input: GateInput,
  scope: PolicyScope = 'global',
): GateResult[] => {
  return runPolicyLedger(input, scope);
};
