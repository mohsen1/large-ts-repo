import type { DrillMode, DrillPriority, DrillScenario, DrillTemplate } from './types';

export type ScenarioAxis = 'impact' | 'complexity' | 'automation' | 'dependency' | 'criticality';

export interface ScenarioScore {
  readonly scenarioId: string;
  readonly templateId: string;
  readonly axis: ScenarioAxis;
  readonly score: number;
  readonly rationale: string;
}

export interface ScenarioMatrixCell {
  readonly scenario: DrillScenario;
  readonly score: number;
  readonly priorities: {
    mode: DrillMode;
    priority: DrillPriority;
    weights: Readonly<Record<ScenarioAxis, number>>;
  };
}

export interface ScenarioMatrix {
  readonly tenantId: string;
  readonly templateId: string;
  readonly generatedAt: string;
  readonly cells: readonly ScenarioMatrixCell[];
  readonly profile: {
    readonly totalScore: number;
    readonly averageComplexity: number;
    readonly riskIndicators: readonly string[];
  };
}

const scenarioAxes: readonly ScenarioAxis[] = ['impact', 'complexity', 'automation', 'dependency', 'criticality'];

const weightedAxis = (scenario: DrillScenario, axis: ScenarioAxis): number => {
  const stepCount = scenario.steps.length;
  const approvalLoad = scenario.steps.reduce((sum, step) => sum + step.requiredApprovals, 0);
  const serviceBreadth = scenario.steps.reduce((sum, step) => sum + step.targetServices.length, 0);
  const ownershipSignal = scenario.owners.length * 4;
  const constraintSignal = scenario.steps.reduce((sum, step) => sum + step.constraints.length, 0);
  const commandSignal = scenario.steps.reduce((sum, step) => sum + step.command.length, 0);
  const base = scenario.objective.length + scenario.summary.length + ownershipSignal + commandSignal + serviceBreadth;

  const impactFactor = scenario.impact === 'critical' ? 4 : scenario.impact === 'high' ? 3 : scenario.impact === 'medium' ? 2 : 1;
  const complexityFactor = Math.max(1, Math.floor((base + approvalLoad + constraintSignal) / 25) + scenario.prerequisites.length);

  switch (axis) {
    case 'impact':
      return Math.max(0, Math.min(10, impactFactor * 2 + scenario.prerequisites.length));
    case 'complexity':
      return Math.max(0, Math.min(10, complexityFactor));
    case 'automation':
      return scenario.steps.every((step) => step.requiredApprovals <= 1) && approvalLoad <= stepCount ? 8 : 5;
    case 'dependency':
      return Math.max(0, Math.min(10, scenario.prerequisites.length + serviceBreadth));
    case 'criticality':
      return Math.max(0, Math.min(10, impactFactor + ownershipSignal / 2 + approvalLoad));
    default:
      return 5;
  }
};

const axisWeightByMode: Record<DrillMode, Readonly<Record<ScenarioAxis, number>>> = {
  tabletop: {
    impact: 0.9,
    complexity: 0.5,
    automation: 0.2,
    dependency: 0.7,
    criticality: 1,
  },
  'game-day': {
    impact: 1,
    complexity: 0.9,
    automation: 0.6,
    dependency: 0.8,
    criticality: 1.1,
  },
  'automated-chaos': {
    impact: 1.2,
    complexity: 1.1,
    automation: 1.4,
    dependency: 0.9,
    criticality: 0.7,
  },
  'customer-sim': {
    impact: 1.1,
    complexity: 0.7,
    automation: 0.5,
    dependency: 1,
    criticality: 1.2,
  },
};

const normalizeAxisWeights = (weights: Readonly<Record<ScenarioAxis, number>>): Readonly<Record<ScenarioAxis, number>> => {
  const total = (weights.impact + weights.complexity + weights.automation + weights.dependency + weights.criticality) || 1;
  const normalized = {
    impact: weights.impact / total,
    complexity: weights.complexity / total,
    automation: weights.automation / total,
    dependency: weights.dependency / total,
    criticality: weights.criticality / total,
  };
  return {
    impact: Number(normalized.impact.toFixed(3)),
    complexity: Number(normalized.complexity.toFixed(3)),
    automation: Number(normalized.automation.toFixed(3)),
    dependency: Number(normalized.dependency.toFixed(3)),
    criticality: Number(normalized.criticality.toFixed(3)),
  };
};

export const buildScenarioWeights = (
  mode: DrillMode,
  priority: DrillPriority,
): Readonly<Record<ScenarioAxis, number>> => {
  const base = axisWeightByMode[mode];
  const multiplier = priority === 'critical' ? 1.6 : priority === 'platinum' ? 1.4 : priority === 'gold' ? 1.2 : 1;
  return {
    impact: Number((base.impact * multiplier).toFixed(3)),
    complexity: Number((base.complexity * multiplier).toFixed(3)),
    automation: Number((base.automation * multiplier).toFixed(3)),
    dependency: Number((base.dependency * multiplier).toFixed(3)),
    criticality: Number((base.criticality * multiplier).toFixed(3)),
  };
};

export const projectScenarioCell = (template: DrillTemplate, scenario: DrillScenario): ScenarioMatrixCell => {
  const weights = buildScenarioWeights(template.mode, template.priority);
  const normalized = normalizeAxisWeights(weights);
  const weightedScore = scenarioAxes.reduce(
    (sum, axis) => sum + weightedAxis(scenario, axis) * normalized[axis],
    0,
  );

  const indicators: string[] = [];
  if (scenario.prerequisites.length > 2) indicators.push('heavy-dependencies');
  if (scenario.owners.includes('platform')) indicators.push('platform-owned');
  if (scenario.steps.some((step) => step.command.includes('rollback'))) indicators.push('rollback-driven');
  if (scenario.steps.some((step) => step.targetServices.length > 4)) indicators.push('broad-surface');
  const fallback = scenario.steps.find((step) => step.targetServices.length === 0);
  if (fallback) indicators.push(`missing-target:${fallback.id}`);

  return {
    scenario,
    score: Math.round(weightedScore * 100) / 100,
    priorities: {
      mode: template.mode,
      priority: template.priority,
      weights: {
        impact: normalized.impact,
        complexity: normalized.complexity,
        automation: normalized.automation,
        dependency: normalized.dependency,
        criticality: normalized.criticality,
      },
    },
  };
};

export const buildScenarioMatrix = (template: DrillTemplate): ScenarioMatrix => {
  const cells = template.scenarios.map((scenario) => projectScenarioCell(template, scenario));
  const totalScore = cells.reduce((acc, item) => acc + item.score, 0);
  const averageComplexity = cells.length === 0 ? 0 : Number((cells.reduce((acc, item) => acc + item.scenario.prerequisites.length, 0) / cells.length).toFixed(2));
  const riskIndicators = Array.from(new Set(cells.flatMap((cell) => cell.scenario.prerequisites.slice(0, 2))));

  return {
    tenantId: template.tenantId,
    templateId: template.id,
    generatedAt: new Date().toISOString(),
    cells: cells.sort((left, right) => right.score - left.score),
    profile: {
      totalScore: Number(totalScore.toFixed(2)),
      averageComplexity,
      riskIndicators: riskIndicators.slice(0, 8),
    },
  };
};

export const topScenarioScores = (template: DrillTemplate, maxItems = 3): readonly ScenarioScore[] => {
  const matrix = buildScenarioMatrix(template);
  return matrix.cells.slice(0, maxItems).map((cell, index) => ({
    scenarioId: cell.scenario.id,
    templateId: template.id,
    axis: scenarioAxes[index % scenarioAxes.length],
    score: cell.score,
    rationale: `${template.mode} template weighted ${Math.round(cell.priorities.weights[scenarioAxes[index % scenarioAxes.length]] * 100)}% on ${
      cell.scenario.id
    }`,
  }));
};
