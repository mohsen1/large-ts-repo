import { assessPlan, makeDefaultConstraints } from './constraints';
import { buildTopology, toTimeline } from './topology';
import type {
  CadenceCommand,
  CadenceDraft,
  CadenceForecast,
  CadencePlan,
  CadenceWorkspaceState,
  CadenceConstraintSet,
  FabricSignalEnvelope,
} from './types';
import { scoreWindows, scheduleWindows, mergeSignals, assignSlots } from './scheduler';
import { buildForecastFromPlan } from './telemetry';

export interface PlanBlueprint {
  readonly state: CadenceWorkspaceState;
  readonly command: CadenceCommand;
  readonly signals: readonly FabricSignalEnvelope[];
}

export interface PlanProjection {
  readonly plan: CadencePlan;
  readonly draft: CadenceDraft;
  readonly forecast: CadenceForecast;
  readonly slotSignature: string;
}

export const buildDraftPlan = (blueprint: PlanBlueprint, constraintsOverride?: Partial<CadenceConstraintSet>): PlanProjection => {
  const constraints = {
    ...makeDefaultConstraints(blueprint.state.workspaceId),
    ...constraintsOverride,
  };

  const topology = buildTopology(blueprint.state.nodeCatalog, constraints);
  const plannedWindows = [
    ...toTimeline(topology, blueprint.command.mode),
    ...scheduleWindows(blueprint.signals, blueprint.command.mode),
  ].slice(0, constraints.maxWindowMinutes);

  const plan: CadencePlan = {
    planId: blueprint.command.planId,
    workspaceId: blueprint.state.workspaceId,
    generatedAt: new Date().toISOString(),
    windows: plannedWindows,
    nodeOrder: plannedWindows.flatMap((window) => window.nodeIds),
    constraints,
    metadata: {
      owner: blueprint.command.operatorId,
      priority: Math.max(0.1, blueprint.command.requestedThroughput / 10),
      mode: blueprint.command.mode,
      requestedThroughput: blueprint.command.requestedThroughput,
    },
  };

  const draft: CadenceDraft = {
    draftId: `draft:${Date.now()}` as const,
    generatedBy: blueprint.command.operatorId,
    createdAt: new Date().toISOString(),
    candidatePlan: plan,
    violations: assessPlan(plan),
  };

  const slots = scoreWindows(plannedWindows);
  const buckets = assignSlots(plannedWindows, constraints.maxParallelWindows);
  const signature = mergeSignals(slots);

  return {
    plan,
    draft,
    forecast: buildForecastFromPlan(plan),
    slotSignature: [signature.join('|'), `buckets:${buckets.size}`].join('|'),
  };
};

export const createPlan = (state: CadenceWorkspaceState, command: CadenceCommand, signals: readonly FabricSignalEnvelope[]) => {
  return buildDraftPlan({ state, command, signals }, makeDefaultConstraints(state.workspaceId));
};
