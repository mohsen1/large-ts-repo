import { RecoveryPlan, RecoveryAction } from '@domain/recovery-cockpit-models';
import { buildCapacityPlan, proposeCapacityDeltas, summarizeCapacity } from '@domain/recovery-cockpit-workloads';
import { buildTimeline } from './timeline';
import { buildExecutionStrategy, StrategyPlan } from './strategy';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';

export type DirectorPlan = {
  readonly planId: string;
  readonly timelineSummary: string;
  readonly topStrategy: StrategyPlan;
  readonly capacitySummary: string;
  readonly capacityMoveCount: number;
  readonly recommendations: readonly string[];
};

export type DirectorConfig = {
  readonly prioritizeCapacity: boolean;
  readonly includeSla?: boolean;
  readonly targetMode: 'safe' | 'balanced' | 'aggressive';
};

const defaultConfig: DirectorConfig = {
  prioritizeCapacity: true,
  includeSla: true,
  targetMode: 'balanced',
};

const mapByService = (actions: readonly RecoveryAction[]) => {
  const grouped = new Map<string, RecoveryAction[]>();
  for (const action of actions) {
    const bucket = grouped.get(action.serviceCode) ?? [];
    bucket.push(action);
    grouped.set(action.serviceCode, bucket);
  }
  return grouped;
};

const choosePriorityAction = (plan: RecoveryPlan): RecoveryAction => {
  const withLongest = [...plan.actions].sort((left, right) => right.expectedDurationMinutes - left.expectedDurationMinutes);
  return withLongest[0] ?? plan.actions[0] as RecoveryAction;
};

export const buildDirectorPlan = async (
  plans: readonly RecoveryPlan[],
  config: Partial<DirectorConfig> = {},
  store: InMemoryCockpitStore,
): Promise<DirectorPlan[]> => {
  const normalized: DirectorConfig = { ...defaultConfig, ...config };
  const outputs: DirectorPlan[] = [];

  for (const plan of plans) {
    const capacity = buildCapacityPlan(plan);
    const proposal = proposeCapacityDeltas(capacity, normalized.targetMode === 'aggressive' ? 'balanced' : normalized.targetMode === 'safe' ? 'sparse' : 'saturated');
    const timeline = buildTimeline(plan);
    const grouped = mapByService(plan.actions);
    const topService = [...grouped.entries()].sort((left, right) => right[1].length - left[1].length)[0]?.[0];

    const storedRuns = await store.listRuns(plan.planId);
    const runState = storedRuns.ok ? storedRuns.value.length.toString() : '0';
    const actionCount = plan.actions.length;
    const recommendations: string[] = [
      `topService=${topService ?? 'none'}`,
      `runs=${runState}`,
      `targetMode=${normalized.targetMode}`,
      `actionCount=${actionCount}`,
      `priorityAction=${choosePriorityAction(plan).id}`,
      ...proposal.suggestions,
    ];

    if (config.includeSla !== false) {
      recommendations.push(`slaScore=${actionCount > 10 ? 'complex' : 'simple'}`);
    }

    outputs.push({
      planId: plan.planId,
      timelineSummary: `${timeline.summary}`,
      topStrategy: buildExecutionStrategy(
        plan,
        normalized.targetMode === 'aggressive' ? 'fastest-first' : normalized.targetMode === 'safe' ? 'critical-first' : 'balanced',
      ),
      capacitySummary: summarizeCapacity(capacity),
      capacityMoveCount: proposal.moved,
      recommendations,
    });
  }

  return outputs;
};

export const mergeDirectorRecommendations = (plans: readonly DirectorPlan[]): string =>
  plans
    .map((entry) => `${entry.planId}:moves=${entry.capacityMoveCount};strategies=${entry.topStrategy.stages.length}`)
    .join(' | ');

export const prioritizePlans = (plans: readonly DirectorPlan[]): readonly DirectorPlan[] =>
  [...plans].sort((left, right) => right.capacityMoveCount - left.capacityMoveCount);
