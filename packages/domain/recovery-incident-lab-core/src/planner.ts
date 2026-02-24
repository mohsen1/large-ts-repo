import type { IncidentLabPlan, IncidentLabScenario, LabGraph, LabNodeLink, IncidentLabRun, StepId } from './types';
import { buildLabTopology, orderByDependencies, criticalPath, calculateNodePressure, graphToText } from './topology';
import { createClock } from './types';

export interface PlanDraftInput {
  readonly scenario: IncidentLabScenario;
  readonly orderedBy: 'topology' | 'reverse';
  readonly requestedBy: string;
}

export interface PlanDraft {
  readonly plan: IncidentLabPlan;
  readonly graph: LabGraph;
  readonly selectedSteps: readonly StepId[];
  readonly reasoning: readonly string[];
}

export interface QueueSnapshot {
  readonly total: number;
  readonly ready: number;
  readonly running: number;
  readonly failed: number;
}

export const estimateWindowMinutes = (scenario: IncidentLabScenario): number => {
  const base = scenario.steps.reduce((acc, step) => Math.max(acc, step.expectedDurationMinutes), 0);
  const signalWeight = Math.max(1, scenario.severity.length);
  return base + signalWeight + scenario.steps.length;
};

export const draftPlan = (input: PlanDraftInput): PlanDraft => {
  const graph = buildLabTopology(input.scenario.steps);
  const topology = orderByDependencies(graph);
  const reverse = criticalPath(graph);

  const order = input.orderedBy === 'topology' ? topology : reverse;
  const plan: IncidentLabPlan = {
    id: `${input.scenario.id}:plan:${Date.now()}` as unknown as IncidentLabPlan['id'],
    scenarioId: input.scenario.id,
    labId: input.scenario.labId,
    selected: order,
    queue: order,
    state: 'draft',
    orderedAt: createClock().now(),
    scheduledBy: input.requestedBy,
  };

  const pressure = calculateNodePressure(graph);
  const highPressureCount = Object.values(pressure).filter((item) => item >= 3).length;
  const reasoning = [
    `selected=${order.length} steps`,
    `mode=${input.orderedBy}`,
    `links=${graph.links.length}`,
    `highPressure=${highPressureCount}`,
    `graph=${graph.nodes.length} nodes`,
  ];

  return {
    plan,
    graph,
    selectedSteps: order,
    reasoning,
  };
};

export const expandQueue = (plan: IncidentLabPlan, limit: number): readonly string[] => {
  return [...plan.queue.slice(0, limit)].map((step, index) => `${index + 1}. ${String(step)}`);
};

export const summarizeRun = (run: IncidentLabRun): QueueSnapshot => {
  const total = run.results.length;
  const ready = run.results.filter((result) => result.status === 'done').length;
  const running = run.results.filter((result) => result.status === 'skipped').length;
  const failed = run.results.filter((result) => result.status === 'failed').length;
  return { total, ready, running, failed };
};

export const validateOrder = (plan: IncidentLabPlan): readonly string[] => {
  if (plan.queue.length === 0) {
    return ['queue empty'];
  }
  const hasDupes = new Set(plan.queue);
  if (hasDupes.size !== plan.queue.length) {
    return ['duplicate steps'];
  }
  if (!plan.scenarioId) {
    return ['missing scenario'];
  }
  return [];
};

export const graphDebug = (graph: LabGraph): string => [
  `nodes=${graph.nodes.length}`,
  `links=${graph.links.length}`,
  graphToText(graph),
].join('\n');

export const computeCriticalLinks = (graph: LabGraph): readonly LabNodeLink[] =>
  [...graph.links].sort((left, right) => right.criticality - left.criticality);
