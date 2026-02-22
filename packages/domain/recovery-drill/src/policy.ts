import { z } from 'zod';

 import type { DrillPolicyGate, DrillTemplate, RecoveryDrillTemplateId, RecoveryDrillTenantId, DrillMode, DrillStatus, DrillPriority, DrillImpact } from './types';

export type DrillPolicyAction = 'hold' | 'approve' | 'reject' | 'fallback';

export interface DrillPolicyRule {
  readonly templateId: RecoveryDrillTemplateId;
  readonly tenantId: RecoveryDrillTenantId;
  readonly enabled: boolean;
  readonly allowMode: readonly DrillMode[];
  readonly maxOpenRuns: number;
  readonly minScore: number;
  readonly maxPriority: DrillPriority;
  readonly allowedImpacts: readonly DrillImpact[];
}

export interface DrillPolicyInput {
  readonly tenantId: RecoveryDrillTenantId;
  readonly template: DrillTemplate;
  readonly topScore: number;
  readonly openRunCount: number;
  readonly tenantLoad: number;
}

export interface DrillPolicyDecision {
  readonly tenantId: RecoveryDrillTenantId;
  readonly templateId: RecoveryDrillTemplateId;
  readonly action: DrillPolicyAction;
  readonly score: number;
  readonly mode: DrillMode;
  readonly gates: readonly DrillPolicyGate[];
  readonly notes: readonly string[];
}

const policyRuleSchema = z.object({
  templateId: z.string().min(1),
  tenantId: z.string().min(1),
  enabled: z.boolean().default(true),
  allowMode: z.array(z.enum(['tabletop', 'game-day', 'automated-chaos', 'customer-sim'])).nonempty(),
  maxOpenRuns: z.number().int().nonnegative().default(3),
  minScore: z.number().min(0).default(0),
  maxPriority: z.enum(['bronze', 'silver', 'gold', 'platinum', 'critical']).default('critical'),
  allowedImpacts: z.array(z.enum(['low', 'medium', 'high', 'critical'])).default(['low', 'medium']),
});

const PRIORITY_ORDER: Record<DrillPriority, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
  critical: 5,
};

const makeGate = (code: string, passed: boolean, details: string): DrillPolicyGate => ({
  code,
  passed,
  details,
});

const classifyStatus = (status: DrillStatus): 'running' | 'closed' => {
  if (status === 'queued' || status === 'running' || status === 'paused') {
    return 'running';
  }
  return 'closed';
};

export const parsePolicyRule = (value: unknown): DrillPolicyRule => {
  const parsed = policyRuleSchema.parse(value) as { templateId: string; tenantId: string; enabled: boolean; allowMode: readonly DrillMode[]; maxOpenRuns: number; minScore: number; maxPriority: DrillPriority; allowedImpacts: readonly DrillImpact[] };
  return {
    ...parsed,
    templateId: parsed.templateId as RecoveryDrillTemplateId,
    tenantId: parsed.tenantId as RecoveryDrillTenantId,
  };
};

export const evaluatePolicyDecision = (
  input: DrillPolicyInput,
  rule: Pick<DrillPolicyRule, 'enabled' | 'allowMode' | 'maxOpenRuns' | 'minScore' | 'maxPriority' | 'allowedImpacts'>,
): DrillPolicyDecision => {
  const { template } = input;

  if (!rule.enabled) {
    return {
      tenantId: input.tenantId,
      templateId: template.id,
      action: 'hold',
      score: 0,
      mode: template.mode,
      gates: [makeGate('policy-enabled', false, 'policy disabled')],
      notes: ['manual-until-policy-enabled'],
    };
  }

  const modeGate = makeGate(
    'template-mode',
    rule.allowMode.includes(template.mode),
    `mode=${template.mode} allowed=${rule.allowMode.join('|')}`,
  );

  const scoreGate = makeGate('minimum-score', input.topScore >= rule.minScore, `score=${input.topScore} min=${rule.minScore}`);

  const loadGate = makeGate(
    'open-run-load',
    input.openRunCount < rule.maxOpenRuns && input.tenantLoad < 0.95,
    `openRuns=${input.openRunCount}/${rule.maxOpenRuns} load=${input.tenantLoad.toFixed(2)}`,
  );

  const priorityGate = makeGate(
    'priority',
    PRIORITY_ORDER[template.priority] <= PRIORITY_ORDER[rule.maxPriority],
    `priority=${template.priority} max=${rule.maxPriority}`,
  );

  const impactGate = makeGate(
    'impact',
    template.scenarios.every((scenario) => rule.allowedImpacts.includes(scenario.impact as DrillImpact)),
    `scenarioCount=${template.scenarios.length}`,
  );

  const gates = [modeGate, scoreGate, loadGate, priorityGate, impactGate];
  const allPassed = gates.every((gate) => gate.passed);

  const action: DrillPolicyAction = allPassed
    ? 'approve'
    : scoreGate.passed
      ? 'fallback'
      : 'reject';

  const notes = gates
    .filter((gate) => !gate.passed)
    .map((gate) => `failed:${gate.code}`)
    .concat(`statusHint=${classifyStatus('queued')}`);

  return {
    tenantId: input.tenantId,
    templateId: template.id,
    action,
    score: input.topScore,
    mode: template.mode,
    gates,
    notes,
  };
};

export const summarizePolicyDecisions = (decisions: readonly DrillPolicyDecision[]) => {
  const aggregate = {
    total: decisions.length,
    approved: 0,
    rejected: 0,
    held: 0,
  };

  for (const item of decisions) {
    if (item.action === 'approve') aggregate.approved += 1;
    else if (item.action === 'reject') aggregate.rejected += 1;
    else aggregate.held += 1;
  }

  const byMode = {
    tabletop: decisions.filter((item) => item.mode === 'tabletop').length,
    'game-day': decisions.filter((item) => item.mode === 'game-day').length,
    'automated-chaos': decisions.filter((item) => item.mode === 'automated-chaos').length,
    'customer-sim': decisions.filter((item) => item.mode === 'customer-sim').length,
  };

  return {
    ...aggregate,
    byMode,
  };
};

export const toPolicyEnvelope = (decision: DrillPolicyDecision): DrillPolicyGate[] => {
  return [
    ...decision.gates,
    makeGate('policy-result', decision.action === 'approve', `action=${decision.action}`),
  ];
};
