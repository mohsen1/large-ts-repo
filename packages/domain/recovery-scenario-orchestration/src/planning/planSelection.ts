import { clamp, toPercent } from '@shared/util';
import type { ConstraintSnapshot, RecoveryBlueprint, RecoveryPlan, ScenarioIntent, OrchestratorContext } from '../types';
import { calculateConfidence } from '../adapters';
import { buildConstraintCoverage, resolveConstraintGaps, type ConstraintGap } from './constraintResolution';
import { withBrand } from '@shared/core';

export interface ScenarioTemplate {
  readonly id: string;
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly title: string;
  readonly intentLabels: readonly string[];
  readonly tags: readonly string[];
  readonly blueprint: RecoveryBlueprint;
}

export interface ScenarioScore {
  readonly templateId: string;
  readonly confidence: number;
  readonly risk: number;
  readonly readiness: number;
  readonly rationale: readonly string[];
}

export interface SelectionInput {
  readonly templates: readonly ScenarioTemplate[];
  readonly intent: ScenarioIntent;
  readonly snapshots: readonly ConstraintSnapshot[];
}

export interface SelectionResult {
  readonly candidates: readonly { readonly template: ScenarioTemplate; readonly score: ScenarioScore }[];
  readonly winner: ScenarioTemplate;
  readonly backup: readonly ScenarioTemplate[];
  readonly plans: readonly RecoveryPlan[];
}

const templateRisk = (template: ScenarioTemplate, snapshots: readonly ConstraintSnapshot[]): number => {
  const coverage = buildConstraintCoverage(snapshots).met / Math.max(1, snapshots.length);
  const match = template.intentLabels.includes(template.scenarioId) ? 1 : 0.5;
  const labelMatch = template.intentLabels.includes(template.scenarioId)
    ? 1
    : toPercent(template.intentLabels.length, Math.max(1, template.tags.length + 1)) / 100;
  return clamp(match * labelMatch * coverage, 0, 1);
};

const templateReadiness = (template: ScenarioTemplate): number => {
  return clamp((template.blueprint.actions.length + template.tags.length) / 20, 0, 1);
};

const scoreTemplate = (template: ScenarioTemplate, intent: ScenarioIntent, snapshots: readonly ConstraintSnapshot[]): ScenarioScore => {
  const readiness = templateReadiness(template);
  const risk = templateRisk(template, snapshots);
  const intentWeight = intent.label.includes('critical') ? 1.15 : 1.0;
  const confidence = calculateConfidence(snapshots) * intentWeight;
  const context: OrchestratorContext = {
    tenantId: withBrand(template.tenantId, 'TenantId'),
    requestedBy: template.tags[0] ?? template.tenantId,
    startedBy: withBrand(template.tenantId, 'ActorId'),
    startedAt: new Date().toISOString(),
    tags: [...intent.owners, ...template.tags],
  };
  const penalties = resolveConstraintGaps({
    constraints: [...template.blueprint.constraints],
    snapshots,
    signalData: [],
    intent,
    context,
  });
  const worstGap = penalties[0];
  const gapPenalty = (worstGap?.score ?? 0) * 0.2;

  const rationale: string[] = [];
  if (readiness > 0.7) rationale.push('high readiness');
  if (risk > 0.6) rationale.push('good intent signal alignment');
  if (template.blueprint.priority >= 4) rationale.push('priority-sensitive');
  if (worstGap && worstGap.gap > 0.7) rationale.push(`constraint pressure on ${worstGap.constraint.key}`);

  return {
    templateId: template.id,
    confidence: clamp(confidence, 0, 1),
    risk: clamp(risk, 0, 1),
    readiness,
    rationale,
  };
};

const buildPlan = (template: ScenarioTemplate): RecoveryPlan => ({
  id: `${template.tenantId}:plan:${template.id}` as RecoveryPlan['id'],
  tenantId: template.tenantId as RecoveryPlan['tenantId'],
  incidentId: `${template.tenantId}:incident:${template.scenarioId}` as RecoveryPlan['incidentId'],
  scenarioId: template.scenarioId as RecoveryPlan['scenarioId'],
  blueprintId: template.blueprint.id,
  state: 'planned',
  runbookVersion: `${template.id}-v1`,
  actions: template.blueprint.actions as RecoveryPlan['actions'],
  confidence: 0.5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tags: [...template.tags],
});

export const selectScenarioTemplates = (input: SelectionInput): readonly { readonly template: ScenarioTemplate; readonly score: ScenarioScore }[] => {
  if (input.templates.length === 0) {
    return [];
  }
  return input.templates
    .map((template) => ({
      template,
      score: scoreTemplate(template, input.intent, input.snapshots),
    }))
    .sort((left, right) => {
      const leftValue = left.score.confidence + left.score.readiness - left.score.risk;
      const rightValue = right.score.confidence + right.score.readiness - right.score.risk;
      if (leftValue === rightValue) return right.score.confidence > left.score.confidence ? 1 : -1;
      return rightValue - leftValue;
    });
};

export const selectPrimaryTemplate = (input: SelectionInput): ScenarioTemplate => {
  const ranked = selectScenarioTemplates(input);
  const selected = ranked[0];
  if (!selected) {
    throw new Error('no templates available');
  }
  return selected.template;
};

export const buildPlanSet = (templates: readonly ScenarioTemplate[]): readonly RecoveryPlan[] =>
  templates.map((template) => buildPlan(template));

export const selectAndPlan = (input: SelectionInput): SelectionResult => {
  const ranked = selectScenarioTemplates(input);
  const winner = ranked[0]?.template;
  if (!winner) {
    throw new Error('empty template catalog');
  }

  const planTemplates = ranked.slice(0, 3).map((entry) => entry.template);
  return {
    candidates: ranked,
    winner,
    backup: ranked.slice(1, 4).map((entry) => entry.template),
    plans: buildPlanSet(planTemplates),
  };
};
