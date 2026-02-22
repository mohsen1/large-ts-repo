import type { PolicyDecisionSummary, PolicyScoreCard, PolicyExecutionContext } from './policy-types';

export interface PolicyDecisionCatalog {
  readonly label: string;
  readonly tags: readonly string[];
  readonly priorities: readonly string[];
  readonly severity: PolicyDecisionSummary['criticality'];
  readonly rationale: readonly string[];
}

export interface PolicyDecisionCatalogResult {
  readonly decision: PolicyDecisionSummary['decision'];
  readonly confidence: number;
  readonly catalog: PolicyDecisionCatalog;
  readonly policySignals: readonly string[];
}

const catalogEntries = [
  {
    label: 'default-allow',
    tags: ['allow', 'policy', 'safe'],
    priorities: ['stability', 'throughput'],
    severity: 'low' as const,
    rationale: ['low-risk input', 'minimal-impact'],
  },
  {
    label: 'guarded',
    tags: ['block', 'review', 'compliance'],
    priorities: ['containment'],
    severity: 'medium' as const,
    rationale: ['medium risk', 'operator visibility'],
  },
  {
    label: 'critical',
    tags: ['block', 'incident-command'],
    priorities: ['emergency', 'manual'],
    severity: 'critical' as const,
    rationale: ['critical pattern', 'mandatory hold'],
  },
];

const severityFromScore = (score: number): PolicyDecisionSummary['criticality'] => {
  if (score >= 80) return 'low';
  if (score >= 55) return 'medium';
  if (score >= 30) return 'high';
  return 'critical';
};

export const buildDecisionCatalog = (decision: PolicyDecisionSummary['decision'], scoreCard: PolicyScoreCard): PolicyDecisionCatalogResult => {
  const bucket = scoreCard.compositeScore >= 66 ? 0 : scoreCard.compositeScore >= 33 ? 1 : 2;
  const catalog = catalogEntries[bucket] ?? catalogEntries[2];

  return {
    decision,
    confidence: Number((scoreCard.compositeScore / 100).toFixed(4)),
    catalog: {
      ...catalog,
      severity: severityFromScore(scoreCard.compositeScore),
    },
    policySignals: [
      `decision=${decision}`,
      `severity=${catalog.severity}`,
      `score=${scoreCard.compositeScore}`,
    ],
  };
};

export const decisionCatalogFromContext = (context: PolicyExecutionContext, scoreCard: PolicyScoreCard): PolicyDecisionCatalogResult => {
  const decision = scoreCard.compositeScore >= 62 ? 'allow' : 'block';
  const rationaleScore = Math.max(0, Math.min(1, context.signals.length / 10));
  const summary: PolicyDecisionSummary = {
    decision,
    decisionReason: `composite=${scoreCard.compositeScore} signals=${context.signals.length}`,
    confidence: Number((0.4 + rationaleScore * 0.6).toFixed(4)),
    criticality: severityFromScore(scoreCard.compositeScore),
    findings: [`signals=${context.signals.length}`, `readiness=${context.readinessPlan.riskBand}`],
  };

  return buildDecisionCatalog(decision, scoreCard);
};
