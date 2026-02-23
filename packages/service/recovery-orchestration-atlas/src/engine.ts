import {
  buildCandidatePlans,
  simulatePlanExecution,
  type RecoveryAtlasDecisionContext,
  type RecoveryAtlasSnapshot,
  type RecoveryAtlasPlan,
  type RecoveryAtlasRunReport,
  type RecoveryAtlasFilter,
  type RecoveryAtlasIncidentId,
  type RecoveryAtlasWindowId,
  bestPlanOrFallback,
  normalizeScore,
  filterNodes,
} from '@domain/recovery-operations-atlas';
import { type AtlasStoreEnvelope, asAtlasStoreId } from '@data/recovery-atlas-store';
import { createAtlasRepository, type AtlasRepository } from '@data/recovery-atlas-store/repository';

export interface AtlasPlanDecision {
  readonly snapshot: RecoveryAtlasSnapshot;
  readonly allPlans: readonly RecoveryAtlasPlan[];
  readonly bestPlan?: RecoveryAtlasPlan;
  readonly diagnostics: readonly string[];
  readonly confidence: number;
}

export interface AtlasRunSimulation {
  readonly plan: RecoveryAtlasPlan;
  readonly report: RecoveryAtlasRunReport;
  readonly quality: number;
}

interface AtlasRunbookInput {
  readonly repository?: AtlasRepository;
  readonly seed?: number;
}

const defaultRepository = (): AtlasRepository => createAtlasRepository();

const deriveDecisionContext = (
  snapshot: RecoveryAtlasSnapshot,
  filter: RecoveryAtlasFilter,
): RecoveryAtlasDecisionContext => ({
  incidentId: snapshot.incidentId,
  candidateWindowIds: snapshot.windows.map((window) => window.id),
  maxStepBudget: 12,
  resilienceBias: 0.7,
  allowedRegions: [...new Set(filterNodes(snapshot.graph.nodes, filter).map((node) => node.region))],
  allowDegraded: true,
});

const confidenceFromPlans = (plans: readonly RecoveryAtlasPlan[]): number => {
  if (plans.length === 0) return 0;
  const normalized = plans.map((plan) => normalizeScore(100 - plan.estimatedMinutes + plan.priority));
  return normalizeScore(normalized.reduce((sum, value) => sum + value, 0) / plans.length);
};

export const runAtlasPlanner = (
  snapshots: readonly RecoveryAtlasSnapshot[],
  options: AtlasRunbookInput = {},
): readonly AtlasPlanDecision[] => {
  const repository = options.repository ?? defaultRepository();

  return snapshots.map((snapshot) => {
    const filter = snapshot.graph.nodes.length > 0 ? { componentPrefix: snapshot.graph.nodes[0].component.slice(0, 2) } : {};
    const context = deriveDecisionContext(snapshot, filter);

    const result = buildCandidatePlans({
      snapshot,
      context,
      seed: options.seed ?? 0,
    });

    const bestPlan = bestPlanOrFallback(result.plans);
    const diagnostics = result.telemetry.map((event) => event.message);

    repository.upsertSnapshot({
      id: asAtlasStoreId(snapshot.id),
      snapshot,
      tenantId: snapshot.tenantId,
      updatedAt: new Date().toISOString(),
    });

    result.telemetry.forEach((event) => repository.appendEvent(snapshot.id, event));

    return {
      snapshot,
      allPlans: result.plans,
      bestPlan,
      diagnostics,
      confidence: confidenceFromPlans(result.plans),
    };
  });
};

export const simulateAtlasDecision = (snapshot: RecoveryAtlasSnapshot): AtlasRunSimulation | undefined => {
  const { plans, bestPlanId } = buildCandidatePlans({
    snapshot,
    context: {
      incidentId: snapshot.incidentId,
      candidateWindowIds: snapshot.windows.map((window) => window.id),
      maxStepBudget: 12,
      resilienceBias: 0.5,
      allowedRegions: ['global', 'us-east-1'],
      allowDegraded: false,
    },
    seed: 17,
  });

  const best = plans.find((plan) => plan.id === bestPlanId) ?? plans[0];
  if (!best) return undefined;

  const report = simulatePlanExecution(best);

  return {
    plan: best,
    report,
    quality: report.passed ? 1 : 0,
  };
};

export const queryByIncident = (repository: AtlasRepository, incidentId: RecoveryAtlasIncidentId): readonly RecoveryAtlasPlan[] => {
  const record = repository.latestForIncident(incidentId);
  return record ? [...record.snapshot.plans] : [];
};

export const queryByWindow = (repository: AtlasRepository, windowId: RecoveryAtlasWindowId): readonly RecoveryAtlasPlan[] => {
  const snapshot = repository.listFor(undefined).find((entry) => entry.snapshot.id === windowId);
  return snapshot ? [...snapshot.snapshot.plans] : [];
};

export const createAtlasEngine = (seed?: AtlasStoreEnvelope) => {
  const repository = createAtlasRepository(seed);
  return {
    run: (snapshots: readonly RecoveryAtlasSnapshot[]) => runAtlasPlanner(snapshots, { repository }),
    simulate: (snapshot: RecoveryAtlasSnapshot) => simulateAtlasDecision(snapshot),
    repository,
  };
};
