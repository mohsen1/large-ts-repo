import { withBrand } from '@shared/core';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RunSession } from '@domain/recovery-operations-models';
import { deserialize, serialize, createEnvelope } from '@shared/protocol';
import { ok, fail, type Result } from '@shared/result';
import type { CadenceExecutionWindow, CadencePlanCandidate, CadenceRunPlan } from '@domain/recovery-operations-cadence';
import {
  buildCandidateFromRun,
  planCandidate,
  validateCadenceRunPlan,
  envelopeForCadencePlan,
} from '@domain/recovery-operations-cadence';
import {
  createCadenceAdapter,
  type CadenceAdapter,
  type CadenceAdapterConfig,
} from '@infrastructure/recovery-operations-cadence-bridge';

interface CadenceCoordinatorWindowTemplate {
  readonly owner: string;
  readonly timezone: string;
  readonly maxParallelism: number;
  readonly maxRetries: number;
  readonly requiredApprovals: number;
}

interface CadenceCoordinatorDependencies {
  readonly repository: RecoveryOperationsRepository;
  readonly windows: Record<string, CadenceCoordinatorWindowTemplate>;
  readonly adapter?: CadenceAdapter;
  readonly adapterConfig?: Pick<CadenceAdapterConfig, 'topicArn' | 'region'>;
}

interface CadenceRunConfig {
  readonly run: RecoveryRunState;
  readonly session: RunSession;
  readonly signalEnvelope: string;
}

interface CadenceSlotSeed {
  readonly id: string;
  readonly command: string;
  readonly windowIndex: number;
  readonly estimatedMinutes: number;
  readonly tags: readonly string[];
  readonly weight: number;
}

export interface CadenceCoordinatorReport {
  readonly planId: string;
  readonly runId: string;
  readonly score: number;
  readonly status: 'ready' | 'blocked' | 'deferred';
  readonly routeCount: number;
  readonly timeline: readonly string[];
  readonly snapshot: string;
}

const seedSlots: readonly CadenceSlotSeed[] = [
  {
    id: 'primary-check',
    command: 'validate-primary-path',
    windowIndex: 0,
    estimatedMinutes: 12,
    tags: ['health', 'critical'],
    weight: 0.6,
  },
  {
    id: 'failover-switch',
    command: 'cutover-to-safe-path',
    windowIndex: 1,
    estimatedMinutes: 18,
    tags: ['failover', 'execution'],
    weight: 0.8,
  },
  {
    id: 'closure-validation',
    command: 'verify-closeout',
    windowIndex: 2,
    estimatedMinutes: 9,
    tags: ['verify', 'closeout'],
    weight: 0.4,
  },
];

const parseSignalEnvelope = (raw: string): boolean => {
  try {
    const envelope = deserialize<unknown>(raw);
    return envelope && typeof envelope === 'object';
  } catch {
    return false;
  }
};

const resolveTemplates = (
  run: RecoveryRunState,
  windows: Record<string, CadenceCoordinatorWindowTemplate>,
): { ids: readonly string[]; definitions: Record<string, CadenceCoordinatorWindowTemplate> } => {
  const ids = ['window-1', 'window-2', 'window-3'].map((base) => `${run.runId}:${base}`);
  const definitions = ids.reduce<Record<string, CadenceCoordinatorWindowTemplate>>((acc, id, index) => {
    const fallback = {
      owner: `owner-${index + 1}`,
      timezone: 'UTC',
      maxParallelism: 2 + index,
      maxRetries: 3 + index,
      requiredApprovals: index,
    };

    acc[id] = windows[id] ?? windows[id.replace(`${run.runId}:`, '')] ?? fallback;
    return acc;
  }, {});

  return { ids, definitions };
};

const buildWindowModels = (
  run: RecoveryRunState,
  windowsCfg: Record<string, CadenceCoordinatorWindowTemplate>,
): CadenceRunPlan['windows'] => {
  const { ids, definitions } = resolveTemplates(run, windowsCfg);
  const now = Date.now();

  return ids.map((id, index) => {
    const template = definitions[id] ?? {
      owner: `owner-${index + 1}`,
      timezone: 'UTC',
      maxParallelism: 1,
      maxRetries: 3,
      requiredApprovals: 0,
    };

    return {
      id: withBrand(id, 'CadenceWindowId'),
      title: `Window-${index + 1}`,
      startsAt: new Date(now + index * 120_000).toISOString(),
      endsAt: new Date(now + (index + 1) * 120_000).toISOString(),
      timezone: template.timezone,
      maxParallelism: template.maxParallelism,
      maxRetries: template.maxRetries,
      requiredApprovals: template.requiredApprovals,
    };
  });
};

const buildSlotModels = (run: RecoveryRunState, windows: CadenceRunPlan['windows']): CadenceRunPlan['slots'] => {
  return seedSlots.map((seed, index) => {
    const slotWindow = windows[Math.min(seed.windowIndex, Math.max(0, windows.length - 1))];
    const id = withBrand(`${run.runId}:${seed.id}`, 'CadenceSlotId');

    const dependencies = index === 0 ? [] : [withBrand(`${run.runId}:${seedSlots[index - 1]?.id}`, 'CadenceSlotId')];

    return {
      id,
      windowId: slotWindow?.id ?? withBrand(`fallback:${run.runId}`, 'CadenceWindowId'),
      stepId: `step-${seed.id}` as CadenceRunPlan['slots'][number]['stepId'],
      plannedFor: new Date().toISOString(),
      planId: withBrand(`plan-${run.runId}`, 'RunPlanId'),
      command: seed.command,
      weight: seed.weight,
      tags: ['coordinator', ...seed.tags],
      requires: dependencies,
      estimatedMinutes: seed.estimatedMinutes,
    };
  });
};

const toExecutionTimeline = (plan: CadenceRunPlan): readonly string[] => {
  const executionWindows: readonly CadenceExecutionWindow[] =
    plan.windows
      .map((window, index) => {
        const slots = plan.slots.filter((slot) => slot.windowId === window.id);
        return {
          runId: plan.runId,
          window,
          slots,
          index,
          total: slots.length,
        };
      })
      .filter((entry) => entry.total > 0);

  return executionWindows.map((window) => `${window.window.id}:${window.total}:${window.index}`);
};

export class RecoveryCadenceCoordinator {
  private readonly adapter: CadenceAdapter;

  constructor(private readonly deps: CadenceCoordinatorDependencies) {
    this.adapter =
      deps.adapter ??
      createCadenceAdapter({
        repository: deps.repository,
        topicArn: deps.adapterConfig?.topicArn,
        region: deps.adapterConfig?.region,
      });
  }

  async buildPlan(input: CadenceRunConfig): Promise<Result<CadenceCoordinatorReport, string>> {
    const isValidEnvelope = parseSignalEnvelope(input.signalEnvelope);
    if (!isValidEnvelope) {
      return fail('INVALID_ENV', 'Failed to parse cadence signal envelope');
    }

    const windows = buildWindowModels(input.run, this.deps.windows);
    const slots = buildSlotModels(input.run, windows);
    const candidate: CadencePlanCandidate = buildCandidateFromRun(
      input.run,
      input.session,
      windows,
      slots,
      'automation',
    );

    const plan = planCandidate(candidate);
    const validation = validateCadenceRunPlan(plan);
    if (!validation.ok) {
      return fail('POLICY_BLOCKED', `Cadence policy rejected: ${validation.reasons.join(' | ')}`);
    }

    const published = await this.adapter.publish(plan);
    if (!published.ok) {
      return fail(published.error, 'Cadence publish adapter failed');
    }

    const timeline = toExecutionTimeline(plan);
    const routeCount = timeline.length;
    const snapshot = JSON.stringify(envelopeForCadencePlan(plan));

    return ok({
      planId: String(plan.id),
      runId: String(plan.runId),
      score: plan.readinessScore,
      status: plan.outcome === 'ready' ? 'ready' : 'deferred',
      routeCount,
      timeline,
      snapshot,
    });
  }

  async replayByTenant(tenant: string): Promise<Result<number, string>> {
    const replayed = await this.adapter.replayLatestByTenant(tenant);
    return replayed;
  }

  async replay(plan: CadenceRunPlan): Promise<Result<string, string>> {
    return this.adapter.replay(plan);
  }

  createPlanEnvelope(plan: CadenceRunPlan): string {
    const envelope = createEnvelope('recovery.operations.cadence.run', {
      plan,
      snapshotAt: new Date().toISOString(),
    });
    return serialize(envelope);
  }
}

export const createCadenceCoordinator = (deps: CadenceCoordinatorDependencies): RecoveryCadenceCoordinator => {
  return new RecoveryCadenceCoordinator(deps);
};
