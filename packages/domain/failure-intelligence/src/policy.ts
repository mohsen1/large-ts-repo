import { normalizeSeverity, type PlanRisk, type FailureSignal, type PolicyDecision, type IncidentFingerprint } from './models';

export { type PolicyDecision } from './models';

export interface DecisionRule {
  id: string;
  shape: string;
  minimumSeverity: number;
  windowMs: number;
  action: 'mitigate' | 'isolate' | 'throttle' | 'patch' | 'fallback' | 'page';
  weight: number;
}

const defaultRules: DecisionRule[] = [
  { id: 'security-spike', shape: 'security', minimumSeverity: 3, windowMs: 2 * 60_000, action: 'isolate', weight: 0.85 },
  { id: 'availability-plateau', shape: 'availability', minimumSeverity: 2, windowMs: 6 * 60_000, action: 'mitigate', weight: 0.67 },
  { id: 'error-pressure', shape: 'error-rate', minimumSeverity: 2, windowMs: 4 * 60_000, action: 'throttle', weight: 0.61 },
  { id: 'latency-spiral', shape: 'latency', minimumSeverity: 1, windowMs: 3 * 60_000, action: 'fallback', weight: 0.44 },
];

const resolveRisk = (value: number): PlanRisk =>
  value >= 0.8 ? 'critical' : value >= 0.65 ? 'high' : value >= 0.45 ? 'moderate' : 'low';

export const evaluateWindowSignals = (signals: readonly FailureSignal[], rule: DecisionRule): FailureSignal[] => {
  const now = Date.now();
  const minTs = now - rule.windowMs;
  return signals.filter(
    (signal) => signal.shape === rule.shape && (normalizeSeverity(signal.severity) >= rule.minimumSeverity) &&
      new Date(signal.createdAt).getTime() >= minTs,
  );
};

export const evaluateRuleDecision = (signals: readonly FailureSignal[], rule: DecisionRule): PolicyDecision | undefined => {
  const candidates = evaluateWindowSignals(signals, rule).filter((signal) => normalizeSeverity(signal.severity) >= rule.minimumSeverity);
  if (candidates.length < 1) return;

  const confidence = Math.min(
    1,
    (candidates.reduce((sum, signal) => sum + normalizeSeverity(signal.severity), 0) / (candidates.length * 4))
      * rule.weight
      + Math.min(1, candidates.length / 8),
  );

  const fingerprint = summarizeCandidates(candidates, rule.id);

  return {
    ruleId: rule.id,
    reason: `${rule.id} on ${candidates[0]?.component ?? 'unknown'} (${candidates.length})`,
    risk: resolveRisk(confidence),
    confidence,
    actions: [
      { name: rule.action, confidence },
      { name: 'page', confidence: Math.max(0.2, confidence - 0.2) },
    ],
  };
}

const summarizeCandidates = (signals: readonly FailureSignal[], ruleId: string): IncidentFingerprint => {
  const tenantId = signals[0]?.tenantId;
  const counts = signals.reduce<Record<string, number>>((acc, signal) => {
    acc[signal.component] = (acc[signal.component] ?? 0) + 1;
    return acc;
  }, {});
  const [component = 'unknown'] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];

  return {
    tenantId: tenantId as any,
    component,
    rootCause: ruleId,
    score: signals.length / 10,
    severity: 'moderate',
  };
};

export const collectDecisions = (signals: readonly FailureSignal[]): PolicyDecision[] => {
  return defaultRules
    .map((rule) => evaluateRuleDecision(signals, rule))
    .filter((decision): decision is PolicyDecision => decision !== undefined)
    .sort((a, b) => b.confidence - a.confidence);
};
