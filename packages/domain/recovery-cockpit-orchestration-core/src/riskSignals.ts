import { RecoveryIntent, RecoveryStep, IntentPriority, IntentScope } from './intentDefinition';

export type RiskCategory =
  | 'capacity'
  | 'dependency'
  | 'security'
  | 'observability'
  | 'policy'
  | 'timing';

export type RiskDimension = Readonly<{
  category: RiskCategory;
  level: number;
  rationale: string;
  mitigations: ReadonlyArray<string>;
}>;

export type RiskVector = Readonly<{
  priorityWeight: number;
  scopeMultiplier: number;
  dimensions: ReadonlyArray<RiskDimension>;
  confidence: number;
  asOf: string;
}>;

export type RiskAssessment = Readonly<{
  intentId: string;
  vector: RiskVector;
  compositeScore: number;
  recommendation: 'execute' | 'throttle' | 'escalate' | 'block';
}>;

const now = () => new Date().toISOString();

const scopeWeight = (scope: IntentScope): number =>
  scope === 'platform' ? 1.4 : scope === 'fleet' ? 1.2 : scope === 'region' ? 1.05 : 1;

const priorityWeight = (priority: IntentPriority): number =>
  priority === 'critical' ? 1.4 : priority === 'high' ? 1.2 : priority === 'medium' ? 1.1 : 0.9;

const stepRiskSignal = (step: RecoveryStep): number => {
  const base = step.riskAdjustment / 100;
  const complexity = Math.min(1, step.requiredCapabilities.length * 0.08);
  const duration = Math.min(1, step.expectedMinutes / 240);
  return Number(((base + complexity + duration) / 3).toFixed(3));
};

const capacityDimension = (steps: readonly RecoveryStep[]): RiskDimension => {
  const totalExpected = steps.reduce((acc, step) => acc + step.expectedMinutes, 0);
  const level = Math.min(100, 15 + totalExpected / 8);
  const mitigations =
    totalExpected > 180
      ? ['Split plan into smaller batches', 'Stagger dependencies by 5-minute windows']
      : ['Current plan load remains under policy budget'];
  return {
    category: 'capacity',
    level,
    rationale: `Total expected runtime ${totalExpected}m`,
    mitigations,
  };
};

const dependencyDimension = (steps: readonly RecoveryStep[]): RiskDimension => {
  const maxDeps = Math.max(0, ...steps.map((step) => step.requiredCapabilities.length), 0);
  const level = Math.min(100, maxDeps * 16);
  const mitigations =
    maxDeps > 3
      ? ['Introduce preflight capability checks', 'Fallback to cached dependency registry']
      : ['Dependencies are low-risk'];
  return {
    category: 'dependency',
    level,
    rationale: `Largest dependency fan-in ${maxDeps}`,
    mitigations,
  };
};

const securityDimension = (steps: readonly RecoveryStep[]): RiskDimension => {
  const sensitiveWords = steps.filter((step) => /revoke|reimage|wipe/i.test(step.action)).length;
  const level = Math.min(100, sensitiveWords * 25);
  const mitigations =
    sensitiveWords > 0
      ? ['Attach change-control ticket', 'Require manual second review']
      : ['Action set is non-destructive'];
  return {
    category: 'security',
    level,
    rationale: `Sensitive action count ${sensitiveWords}`,
    mitigations,
  };
};

const observabilityDimension = (steps: readonly RecoveryStep[]): RiskDimension => {
  const commandCount = steps.length;
  const hasVisibility = steps.every((step) => step.requiredCapabilities.some((cap) => cap.includes('telemetry')));
  const level = Math.max(10, 100 - commandCount * 2 - (hasVisibility ? 35 : 0));
  const mitigations = hasVisibility
    ? ['Observability signals already present']
    : ['Attach telemetry and heartbeat checks for each step'];

  return {
    category: 'observability',
    level,
    rationale: `Telemetry coverage ${hasVisibility ? 'adequate' : 'incomplete'}`,
    mitigations,
  };
};

const policyDimension = (intent: RecoveryIntent): RiskDimension => {
  const explicitControl = intent.tags.includes('needs-approval') || intent.tags.includes('hotfix');
  const level = explicitControl ? 30 : 5;
  return {
    category: 'policy',
    level,
    rationale: `Policy tags [${intent.tags.join(', ')}]`,
    mitigations: explicitControl ? ['Require cross-team approval', 'Attach rollback plan'] : ['Policy tags indicate standard flow'],
  };
};

const timingDimension = (intent: RecoveryIntent): RiskDimension => {
  const start = new Date(intent.requestedAt).getTime();
  const isScheduledWindow = intent.startAt ? new Date(intent.startAt).getTime() : start;
  const gap = Math.max(0, isScheduledWindow - Date.now()) / 1000 / 60;
  const level = gap > 60 ? 12 : 55;
  return {
    category: 'timing',
    level,
    rationale: `Execution window in ${Math.round(gap)}m`,
    mitigations: gap > 60 ? ['Time window allows dry-run', 'Increase prechecks'] : ['Consider deferring to off-peak'],
  };
};

const mapRecommendation = (score: number): RiskAssessment['recommendation'] => {
  if (score >= 80) return 'execute';
  if (score >= 60) return 'throttle';
  if (score >= 40) return 'escalate';
  return 'block';
};

export const evaluateRiskVector = (intent: RecoveryIntent): RiskVector => {
  const weights = intent.steps.length > 0 ? intent.steps.map(stepRiskSignal) : [0.15];
  const base = weights.reduce((acc, weight) => acc + weight, 0) / weights.length;
  const dimensions = [
    capacityDimension(intent.steps),
    dependencyDimension(intent.steps),
    securityDimension(intent.steps),
    observabilityDimension(intent.steps),
    policyDimension(intent),
    timingDimension(intent),
  ];

  const confidence = Number((Math.min(1, 0.5 + intent.steps.length * 0.08)).toFixed(3));

  return {
    priorityWeight: priorityWeight(intent.priority),
    scopeMultiplier: scopeWeight(intent.scope),
    dimensions,
    confidence,
    asOf: now(),
  };
};

export const evaluateRisk = (intent: RecoveryIntent): RiskAssessment => {
  const vector = evaluateRiskVector(intent);
  const dimensionScore =
    vector.dimensions.reduce((acc, dimension) => {
      const bounded = Math.max(1, Math.min(100, dimension.level));
      return acc + bounded;
    }, 0) / vector.dimensions.length;

  const compositeScore =
    Number(
      Math.min(100, dimensionScore * vector.priorityWeight * (intent.steps.length ? Math.log2(1 + vector.scopeMultiplier) : 1)).toFixed(
        3,
      ),
    );

  return {
    intentId: intent.intentId,
    vector,
    compositeScore,
    recommendation: mapRecommendation(compositeScore),
  };
};

export const sortByRisk = (assessments: readonly RiskAssessment[]): RiskAssessment[] =>
  [...assessments].sort((left, right) => right.compositeScore - left.compositeScore);

export const summarizeRisks = (assessment: RiskAssessment): string =>
  `${assessment.intentId} risk ${assessment.compositeScore.toFixed(1)} (${assessment.recommendation})`;
