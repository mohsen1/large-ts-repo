import { rankSignals, buildHypothesisScore, weightedSignalModel } from './signal-weights';
import type {
  RecoveryPlanCandidate,
  RecoveryHypothesis,
  SituationalSignal,
  RecoveryWorkloadNode,
  SituationalSnapshot,
  SituationalAssessment,
  PlanningContext,
  PlanSelector,
  ResultWindow,
  ScoreModel,
  ISODateTime,
  CommandResult,
} from './situation-types';

const createPlanId = () => `plan-${Math.random().toString(36).slice(2, 10)}`;
const asIso = (value: string): ISODateTime => value as ISODateTime;

const buildHypotheses = (
  node: RecoveryWorkloadNode,
  signals: readonly SituationalSignal[],
): readonly RecoveryHypothesis[] => {
  const ranked = rankSignals(signals);
  const commandBuckets = [
    `Restart-${node.service}`,
    `Failover-${node.region}`,
    `ScaleOut-${node.service}`,
    `Isolate-${node.name}`,
    `Probe-${node.dependencyGraph.length}`,
  ];

  return commandBuckets
    .map((command, index) => {
      const evidence = signals.filter((signal) => signal.tags.some((tag) => command.includes(tag)));
      const sourceSignalIds = ranked.filter((signalId) => evidence.some((entry) => entry.signalId === signalId));
      const weighted = weightedSignalModel(signals[index % Math.max(1, signals.length)], 'recover');
      const sideEffects = evidence.map((signal) => signal.summary);
      const score = buildHypothesisScore(
        {
          hypothesisId: `hyp-${index}`,
          label: command,
          evidenceWeight: weighted.weight,
          commands: [command],
          likelyImpactPercent: node.criticality * 11,
          sideEffects,
        },
        signals,
      );

      return {
        hypothesisId: `h-${index}`,
        label: command,
        evidenceWeight: score,
        commands: [command],
        likelyImpactPercent: Math.min(95, node.criticality * 15 + index * 3),
        sideEffects,
      } as RecoveryHypothesis;
    })
    .sort((left, right) => right.evidenceWeight - left.evidenceWeight)
    .slice(0, 4);
};

const normalize = (snapshot: SituationalSnapshot): ResultWindow<number> => {
  const degradation = Math.max(0, (100 - snapshot.availabilityPercent) / 100);
  const loadPressure = (snapshot.cpuUtilization + snapshot.memoryUtilization) / 200;
  const latency = Math.min(1, snapshot.latencyP95Ms / 2000);
  const current = Number((degradation * 0.42 + loadPressure * 0.36 + latency * 0.22).toFixed(6));

  return {
    current,
    previous: current,
    delta: degradation,
  };
};

const scoreModels = (
  snapshot: SituationalSnapshot,
  signals: readonly SituationalSignal[],
  context: PlanningContext,
): ScoreModel => {
  const normalized = normalize(snapshot);
  const confidence = signals.length ? signals.reduce((acc, signal) => acc + signal.confidence, 0) / signals.length : 0;
  const reliability = Number((1 - normalized.current).toFixed(4));
  const recoverability = Number(((1 - normalized.delta) * (1 - snapshot.errorBudget)).toFixed(4));
  const urgency = Number((snapshot.cpuUtilization / 100 + snapshot.memoryUtilization / 100 + snapshot.activeTrafficRatio).toFixed(4));
  const operationalRisk = Number((normalized.current * (context.environment === 'prod' ? 1.2 : 0.9)).toFixed(4));

  return {
    reliability: Math.max(0, Math.min(1, reliability)),
    recoverability: Math.max(0, Math.min(1, recoverability)),
    urgency: Math.max(0, Math.min(1, urgency)),
    operationalRisk: Math.max(0, Math.min(1, operationalRisk)),
  };
};

export const buildPlanFromContext = (
  node: RecoveryWorkloadNode,
  snapshot: SituationalSnapshot,
  signals: readonly SituationalSignal[],
  context: PlanningContext,
  options?: {
    selector?: PlanSelector;
  },
): SituationalAssessment => {
  const hypotheses = buildHypotheses(node, signals);
  const scores = scoreModels(snapshot, signals, context);
  const recoveryMinutes = Math.max(
    2,
    Math.round((snapshot.latencyP95Ms + snapshot.cpuUtilization * 2 + node.recoverySlaMinutes) / (scores.recoverability + 0.25)),
  );
  const confidence = Math.min(
    1,
    scores.reliability * 0.25 + scores.urgency * 0.35 + scores.recoverability * 0.25 + (context.environment === 'prod' ? 0.05 : 0.2),
  );

  const sortedPlans: RecoveryPlanCandidate[] = [...hypotheses]
    .map((hypothesis, index) => ({
      planId: createPlanId(),
      workloadNodeId: node.nodeId,
      title: `Plan-${index + 1} for ${node.name}`,
      description: `${context.policyTag} guided recovery sequence for ${node.name}`,
      sourceSignalIds: signals.slice(0, 4).map((signal) => signal.signalId),
      hypotheses: [hypothesis, ...hypotheses.filter((candidate) => candidate.hypothesisId !== hypothesis.hypothesisId)],
      estimatedRestorationMinutes: recoveryMinutes + index * 12,
      confidence,
      createdAt: asIso(new Date().toISOString()),
    } satisfies RecoveryPlanCandidate))
    .sort((left, right): number => right.confidence - left.confidence);

  const selector = options?.selector ?? ((plans) => plans[0]!);
  const fallback: RecoveryPlanCandidate = {
    planId: createPlanId(),
    workloadNodeId: node.nodeId,
    title: `fallback-${node.name}`,
    description: 'Generated from fallback path',
    sourceSignalIds: signals.map((signal) => signal.signalId),
    hypotheses: [],
    estimatedRestorationMinutes: recoveryMinutes,
    confidence,
    createdAt: asIso(new Date().toISOString()),
  };

  const selectedPlan = selector(sortedPlans.length > 0 ? sortedPlans : [fallback]);
  const startedAt = asIso(new Date().toISOString());
  const command: CommandResult = {
    commandId: `cmd-${Math.random().toString(36).slice(2, 10)}`,
    status: 'queued',
    startedAt,
    details: `Execute recovery command pack for ${node.name}`,
    dryRun: false,
  };

  return {
    assessmentId: `ass-${Math.random().toString(36).slice(2, 10)}`,
    phase: scores.urgency > 0.6 ? 'assess' : 'mitigate',
    status: 'queued',
    workload: node,
    snapshot,
    signalCount: signals.length,
    weightedConfidence: confidence,
    plan: selectedPlan,
    commands: [command],
  };
};
