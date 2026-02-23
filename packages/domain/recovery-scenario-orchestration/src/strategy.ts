import { z } from 'zod';
import type {
  RecoveryRun,
  RecoveryState,
  RecoveryPlan,
  TenantId,
  ScenarioId,
  RecoveryBlueprint,
  ScenarioAction,
  ConstraintSnapshot,
} from './types';
import type { CandidateWindow } from './scheduler';
import { buildExecutionWindows, normalizeSchedule } from './scheduler';
import { hasBlockingConstraint } from './constraints';
import { calculateConfidence } from './adapters';

const actionSchema = z.string();

export interface StrategyResult {
  readonly plan: RecoveryPlan;
  readonly schedule: readonly RecoveryRun[];
  readonly readyToRun: boolean;
  readonly confidence: number;
}

export interface StrategyInput {
  readonly plan: RecoveryPlan;
  readonly signals: readonly {
    readonly id: string;
    readonly value: number;
  }[];
}

const stamp = (): string => new Date().toISOString();

const makeAction = (tenantId: TenantId, index: number): RecoveryBlueprint['actions'][number] =>
  ({
    id: `${tenantId}:action:${index}` as ScenarioAction['id'],
    code: `auto-${index}`,
    title: `Auto Action ${index}`,
    owner: 'ops',
    commandTemplate: `run:action:${index}`,
    requiredApprovals: Math.max(0, 1 - index),
    estimatedMinutes: Math.max(1, index + 1),
    status: 'ready',
    tags: ['generated'],
  } as RecoveryBlueprint['actions'][number]);

const toRun = (plan: RecoveryPlan, window: CandidateWindow): RecoveryRun => ({
  id: `${plan.id}:${window.action.id}` as RecoveryRun['id'],
  planId: plan.id,
  actorId: window.action.owner as RecoveryRun['actorId'],
  state: 'planned',
  startedAt: stamp(),
  updatedAt: stamp(),
  progress: 0,
  details: {
    actionCode: actionSchema.parse(window.action.code),
    actionId: String(window.action.id),
    order: String(window.order),
  },
});

export const buildPlanStub = (
  tenantId: TenantId,
  incidentId: string,
  scenarioId: ScenarioId,
  actionCount: number,
): RecoveryPlan => {
  const actions = Array.from({ length: actionCount }).map((_, index) => makeAction(tenantId, index));

  return {
    id: `${tenantId}:plan:${scenarioId}` as RecoveryPlan['id'],
    tenantId,
    incidentId: incidentId as RecoveryPlan['incidentId'],
    scenarioId,
    blueprintId: `${tenantId}:blueprint:${scenarioId}` as RecoveryPlan['blueprintId'],
    state: 'planned',
    runbookVersion: 'v1',
    actions,
    confidence: 0.3,
    createdAt: stamp(),
    updatedAt: stamp(),
    tags: ['generated'],
  } as RecoveryPlan;
};

export const buildStrategy = (input: StrategyInput, snapshots: readonly ConstraintSnapshot[]): StrategyResult => {
  const windows = normalizeSchedule(buildExecutionWindows(input.plan, snapshots));
  const schedule = windows.map((window) => toRun(input.plan, window));

  return {
    plan: {
      ...input.plan,
      confidence: calculateConfidence(snapshots),
      state: hasBlockingConstraint(snapshots) ? 'suspended' : ('running' as RecoveryState),
      updatedAt: stamp(),
    },
    schedule,
    readyToRun: !hasBlockingConstraint(snapshots),
    confidence: calculateConfidence(snapshots),
  };
};

export const summarizeStrategy = (
  strategy: StrategyResult,
): { readonly id: RecoveryPlan['id']; readonly runs: readonly RecoveryRun[]; readonly timestamp: string; readonly state: RecoveryState } => ({
  id: strategy.plan.id,
  runs: strategy.schedule,
  timestamp: stamp(),
  state: strategy.schedule.length === 0 ? 'planned' : strategy.readyToRun ? 'running' : 'resolved',
});
