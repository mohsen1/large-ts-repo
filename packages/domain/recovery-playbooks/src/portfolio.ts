import { withBrand } from '@shared/core';
import { z } from 'zod';
import type {
  DeepMerge,
  Brand,
} from '@shared/type-level';
import type {
  RecoveryPlaybook,
  RecoveryPlaybookContext,
  RecoveryPlaybookQuery,
  RecoveryPlaybookStatus,
  RecoveryPlaybookId,
  RecoveryPlanId,
  RecoveryStepId,
  PlaybookSelectionPolicy,
  RecoveryPlanExecution,
  PlaybookSignal,
  PlaybookExecutionReport,
} from './models';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const stableId = (parts: readonly string[]): string =>
  parts
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    .filter(Boolean)
    .join('-');

export type PlaybookCluster = 'greenfield' | 'steady-state' | 'incident-heavy' | 'risk-driven';
export type ReadinessBand = 'gold' | 'silver' | 'bronze' | 'red';

export interface PlaybookSignalWeights {
  readonly severity: number;
  readonly urgency: number;
  readonly blastRadius: number;
  readonly tenantValue: number;
  readonly automationCoverage: number;
}

export interface PortfolioSlice<T> {
  readonly sliceId: Brand<string, 'PlaybookSliceId'>;
  readonly cluster: PlaybookCluster;
  readonly status: RecoveryPlaybookStatus;
  readonly readiness: ReadinessBand;
  readonly playbooks: readonly T[];
  readonly generatedAt: string;
  readonly notes: readonly string[];
}

export interface PlaybookPortfolio {
  readonly portfolioId: Brand<string, 'PlaybookPortfolioId'>;
  readonly tenantId: string;
  readonly horizonHours: number;
  readonly slices: readonly PortfolioSlice<RecoveryPlaybookId>[];
  readonly signalProfile: PlaybookSignalWeights;
  readonly riskSurface: number;
}

export interface PortfolioQuery {
  readonly tenantId: string;
  readonly clusters?: readonly PlaybookCluster[];
  readonly readiness?: ReadinessBand;
  readonly minScore?: number;
  readonly maxCount?: number;
}

export interface PortfolioRecommendation {
  readonly portfolioId: string;
  readonly playbookId: RecoveryPlaybookId;
  readonly score: number;
  readonly rationale: readonly string[];
  readonly readiness: ReadinessBand;
  readonly estimatedMinutes: number;
  readonly dependencyDepth: number;
  readonly riskSignal: number;
}

export interface PortfolioBuildOptions {
  readonly tenantId: string;
  readonly horizonHours: number;
  readonly weights: PlaybookSignalWeights;
  readonly maxCount: number;
}

export interface PortfolioDiff {
  readonly previousId?: string;
  readonly currentId: string;
  readonly added: readonly RecoveryPlaybookId[];
  readonly removed: readonly RecoveryPlaybookId[];
  readonly unchanged: readonly RecoveryPlaybookId[];
}

export interface ReadinessScoreContext {
  readonly plan: RecoveryPlaybook | undefined;
  readonly context: RecoveryPlaybookContext;
  readonly policy: PlaybookSelectionPolicy;
  readonly signals: readonly PlaybookSignal[];
}

const DEFAULT_WEIGHTS: PlaybookSignalWeights = {
  severity: 0.34,
  urgency: 0.24,
  blastRadius: 0.2,
  tenantValue: 0.12,
  automationCoverage: 0.1,
};

const readinessFromSteps = (stepCount: number): ReadinessBand =>
  stepCount >= 22 ? 'bronze' : stepCount >= 14 ? 'silver' : stepCount >= 8 ? 'gold' : 'red';

const readinessFromSignals = (signals: readonly PlaybookSignal[]): number =>
  clamp(
    signals.reduce((acc, signal) => {
      const score = typeof signal.value === 'number' ? signal.value : signal.value ? 1 : 0;
      const weighted = score * signal.weight;
      return acc + weighted;
    }, 0),
    0,
    1,
  );

const scoreByPolicy = (playbook: RecoveryPlaybook, policy: PlaybookSelectionPolicy): number => {
  const allowed = policy.allowedStatuses.includes(playbook.status);
  const requiredSatisfied = policy.requiredLabels.every((label) => playbook.labels.includes(label));
  const forbidden = playbook.labels.some((label) => policy.forbiddenChannels.includes(label));
  const base = allowed && requiredSatisfied && !forbidden ? 1 : 0;
  return clamp(base * (1 - policy.maxStepsPerRun / 25), 0, 1);
};

const estimateRisk = (playbook: RecoveryPlaybook, context: RecoveryPlaybookContext, signals: readonly PlaybookSignal[]): number => {
  const signalScore = readinessFromSignals(signals);
  const severity = playbook.severityBands.includes('p0') ? 1 : playbook.severityBands.includes('p1') ? 0.8 : 0.45;
  const regionCount = Math.min(1, context.affectedRegions.length / 8);
  const ownerPriority = context.triggeredBy.includes('sre') ? 0.25 : 0.05;
  return clamp(
    (severity * 0.5) + (regionCount * 0.2) + (signalScore * 0.2) + ownerPriority,
    0,
    1,
  );
};

const planDuration = (playbook: RecoveryPlaybook): number => playbook.steps.reduce((acc, step) => acc + step.durationMinutes, 0);

const clusterFromContext = (context: RecoveryPlaybookContext): PlaybookCluster => {
  const severity = context.affectedRegions.length + (context.tenantId.length % 4);
  if (severity >= 8) return 'incident-heavy';
  if (severity >= 4) return 'risk-driven';
  if (severity >= 2) return 'steady-state';
  return 'greenfield';
};

const buildSliceId = (portfolioId: string, cluster: string): Brand<string, 'PlaybookSliceId'> =>
  withBrand(`${portfolioId}-${cluster}-${Date.now()}`, 'PlaybookSliceId');

export const buildPlaybookPortfolio = (
  playbooks: readonly RecoveryPlaybook[],
  context: RecoveryPlaybookContext,
  options: PortfolioBuildOptions,
): PlaybookPortfolio => {
  const portfolioId = withBrand(stableId([options.tenantId, 'portfolio', String(options.horizonHours)]), 'PlaybookPortfolioId');
  const query = createRecoveryQueryFromContext(context);
  const candidates = playbooks.filter((playbook) => matchesQuery(playbook, query));
  const ranked = candidates
    .map((playbook) => ({
      playbook,
      score: scorePlaybook(playbook, context, options.weights, {
        policy: {
          maxStepsPerRun: options.maxCount,
          allowedStatuses: ['published'],
          requiredLabels: query.labels ?? ['automated'],
          forbiddenChannels: ['manual'],
        },
        maxMinutes: Math.max(1, options.maxCount * 12),
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const grouped: Record<PlaybookCluster, RecoveryPlaybook[]> = {
    'greenfield': [],
    'steady-state': [],
    'incident-heavy': [],
    'risk-driven': [],
  };
  for (const item of ranked) {
    const cluster = clusterFromContext(context);
    grouped[cluster].push(item.playbook);
  }

  const slices = (Object.entries(grouped) as Array<[PlaybookCluster, RecoveryPlaybook[]]>)
    .map(([cluster, catalog]) => ({
      sliceId: buildSliceId(portfolioId, cluster),
      cluster,
      status: 'published' as RecoveryPlaybookStatus,
      readiness: readinessFromSteps(catalog.reduce((acc, playbook) => Math.max(acc, playbook.steps.length), 0)),
      playbooks: catalog.slice(0, Math.max(1, options.maxCount)).map((playbook) => playbook.id) as readonly RecoveryPlaybookId[],
      generatedAt: new Date().toISOString(),
      notes: [
        `cluster=${cluster}`,
        `candidate-count=${catalog.length}`,
        `horizon=${options.horizonHours}`,
      ],
    }));

  return {
    portfolioId: withBrand(portfolioId, 'PlaybookPortfolioId'),
    tenantId: options.tenantId,
    horizonHours: options.horizonHours,
    slices,
    signalProfile: options.weights,
    riskSurface: options.horizonHours + 1,
  };
};

export const scorePlaybook = (
  playbook: RecoveryPlaybook,
  context: RecoveryPlaybookContext,
  weights: PlaybookSignalWeights = DEFAULT_WEIGHTS,
  options?: { policy?: PlaybookSelectionPolicy; maxMinutes?: number },
): number => {
  const policy = options?.policy ?? {
    maxStepsPerRun: 20,
    allowedStatuses: ['published', 'deprecated'],
    requiredLabels: [],
    forbiddenChannels: [],
  };

  const policyScore = scoreByPolicy(playbook, policy);
  const risk = estimateRisk(playbook, context, context.tenantId ? [{ name: 'tenant', value: context.tenantId.length / 15, weight: weights.tenantValue }] : []);
  const duration = planDuration(playbook);
  const durationScore = clamp(
    1 - (duration / Math.max(1, Number(options?.maxMinutes ?? 360))),
    0,
    0.2,
  );
  const stepScore = clamp(playbook.steps.length / 24, 0, 1);
  const windowFit = playbook.windows.length > 0 ? 0.8 : 0.4;
  const agePenalty = Math.max(0, 1 - (Date.now() - Date.parse(playbook.updatedAt)) / (1000 * 60 * 60 * 24 * 30 * 12));
  return clamp(
    policyScore * 0.4 + weights.severity * risk + weights.urgency * windowFit + weights.blastRadius * agePenalty + weights.automationCoverage * stepScore + durationScore,
    0,
    1,
  );
};

export const buildRecommendations = (
  portfolio: PlaybookPortfolio,
  catalog: readonly RecoveryPlaybook[],
  query: PortfolioQuery,
): readonly PortfolioRecommendation[] => {
  const byId = new Map<RecoveryPlaybookId, RecoveryPlaybook>(catalog.map((playbook) => [playbook.id, playbook]));
  const context: RecoveryPlaybookContext = {
    tenantId: query.tenantId,
    serviceId: 'portfolio-generator',
    incidentType: 'incident',
    affectedRegions: ['global'],
    triggeredBy: query.tenantId,
  };
  const weights = portfolio.signalProfile;
  const policy: PlaybookSelectionPolicy = {
    maxStepsPerRun: 18,
    allowedStatuses: ['published'],
    requiredLabels: query.readiness ? ['automated'] : [],
    forbiddenChannels: query.readiness === 'red' ? ['manual'] : [],
  };
  return portfolio.slices
    .flatMap((slice) =>
      slice.playbooks
        .flatMap((playbookId) => byId.get(playbookId) ?? [])
        .map((playbook) => {
          const score = scorePlaybook(playbook, context, weights, { policy, maxMinutes: query.maxCount ? query.maxCount * 12 : 600 });
          const estimatedMinutes = planDuration(playbook);
          const dependencyDepth = computeDependencyDepth(playbook);
          const readiness = readinessFromSteps(playbook.steps.length);
          return {
            portfolioId: String(portfolio.portfolioId),
            playbookId: playbook.id,
            score,
            rationale: [
              `status=${playbook.status}`,
              `cluster=${slice.cluster}`,
              `steps=${playbook.steps.length}`,
              `estimated=${estimatedMinutes}`,
            ],
            readiness,
            estimatedMinutes,
            dependencyDepth,
            riskSignal: score,
          };
        }),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, query.maxCount ?? 12);
};

export const comparePortfolio = (
  current: PlaybookPortfolio,
  previous?: PlaybookPortfolio,
): PortfolioDiff => {
  const previousSet = new Set(previous ? previous.slices.flatMap((slice) => slice.playbooks) : []);
  const currentIds = current.slices.flatMap((slice) => slice.playbooks);
  const added: RecoveryPlaybookId[] = [];
  const unchanged: RecoveryPlaybookId[] = [];
  for (const id of currentIds) {
    if (previousSet.has(id)) {
      unchanged.push(id);
    } else {
      added.push(id);
    }
  }
  const removed: RecoveryPlaybookId[] = previous
    ? previous.slices.flatMap((slice) => slice.playbooks).filter((id) => !currentIds.includes(id))
    : [];
  return {
    previousId: previous?.portfolioId,
    currentId: current.portfolioId,
    added,
    removed,
    unchanged,
  };
};

export const toExecutionReport = (
  run: RecoveryPlanExecution,
  planMinutes: number,
  warnings: readonly string[],
): PlaybookExecutionReport => {
  const recoveredCount = run.telemetry.recoveredStepIds.length;
  const hasFailed = run.telemetry.failures > 0;
  return {
    run,
    warnings,
    errors: run.telemetry.failures > 0
      ? [{
        stepId: recoveredCount > 0 ? run.selectedStepIds[0] as RecoveryStepId : ('' as RecoveryStepId),
        reason: 'synthetic-observer',
        recoverable: true,
        when: new Date().toISOString(),
      }]
      : [],
    elapsedMinutes: hasFailed ? planMinutes * 1.2 : planMinutes,
  };
};

export const createRecoveryQueryFromContext = (context: RecoveryPlaybookContext): RecoveryPlaybookQuery => ({
  tenantId: withBrand(context.tenantId, 'TenantId'),
  serviceId: withBrand(context.serviceId, 'ServiceId'),
  status: 'published',
  labels: [context.tenantId, context.incidentType, ...context.affectedRegions],
  categories: [context.incidentType],
  severityBands: ['p0', 'p1', 'p2'],
  limit: 50,
});

const matchesQuery = (playbook: RecoveryPlaybook, query: RecoveryPlaybookQuery): boolean => {
  if (query.status && playbook.status !== query.status) return false;
  if (query.labels && query.labels.length > 0) {
    const required = new Set(query.labels);
    if (!query.labels.every((label) => playbook.labels.includes(label))) return false;
  }
  return true;
};

const computeDependencyDepth = (playbook: RecoveryPlaybook): number => {
  const seen = new Set<RecoveryStepId>();
  const walk = (stepId: RecoveryStepId): number => {
    if (seen.has(stepId)) return 0;
    seen.add(stepId);
    const step = playbook.steps.find((item) => item.id === stepId);
    if (!step) return 0;
    if (step.dependencies.length === 0) return 1;
    return 1 + Math.max(...step.dependencies.map((dependency) => walk(dependency.dependsOn)));
  };
  return Math.max(0, ...playbook.steps.map((step) => walk(step.id as RecoveryStepId)));
};

export const ReadinessBandSchema = z.enum(['gold', 'silver', 'bronze', 'red']);
export const PlaybookSignalWeightsSchema = z.object({
  severity: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  blastRadius: z.number().min(0).max(1),
  tenantValue: z.number().min(0).max(1),
  automationCoverage: z.number().min(0).max(1),
});

export type ReadinessBandInput = z.infer<typeof ReadinessBandSchema>;
export type PlaybookSignalWeightsInput = z.infer<typeof PlaybookSignalWeightsSchema>;

export const PortfolioQuerySchema = z.object({
  tenantId: z.string().min(1),
  clusters: z.array(z.enum(['greenfield', 'steady-state', 'incident-heavy', 'risk-driven'])).optional(),
  readiness: ReadinessBandSchema.optional(),
  minScore: z.number().min(0).max(1).optional(),
  maxCount: z.number().int().min(1).max(300).optional(),
});

export const isReadinessBand = (value: unknown): value is ReadinessBand => ReadinessBandSchema.safeParse(value).success;

export const buildPortfolioId = (tenantId: string, planId: RecoveryPlanId): Brand<string, 'PlaybookPortfolioId'> =>
  withBrand(`${tenantId}:${planId}`, 'PlaybookPortfolioId');
