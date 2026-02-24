import { PluginContext, canonicalizeNamespace } from '@shared/stress-lab-runtime';
import {
  CommandRunbook,
  OrchestrationPlan,
  RecoverySignal,
  RecoverySimulationResult,
  WorkloadTarget,
  TenantId,
} from '@domain/recovery-stress-lab';
import {
  executeStudioPlugins,
  buildStudioPluginCatalog,
  buildStudioRegistry,
  type StudioRuntimeInput,
  type StudioStage,
} from './studio-plugin-registry';
import {
  mapIterable,
  collectIterable,
  zipLongest,
  PluginRegistry,
} from '@shared/stress-lab-runtime';

export interface StudioOrchestratorSnapshot {
  readonly tenantId: TenantId;
  readonly stage: StudioStage;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly ready: boolean;
}

export interface StudioOrchestratorInput {
  readonly tenantId: TenantId;
  readonly signals: readonly RecoverySignal[];
  readonly topology: readonly WorkloadTarget[];
  readonly runbooks: readonly CommandRunbook[];
}

export interface StudioOrchestratorResult {
  readonly snapshot: StudioOrchestratorSnapshot;
  readonly events: readonly string[];
  readonly plansTriage: readonly { readonly id: string; readonly priority: number }[];
  readonly manifestSignature: string;
}

export type OrchestratorHistoryItem = Readonly<{
  readonly at: string;
  readonly stage: StudioStage;
  readonly planSet: number;
}>;

const toContext = (tenantId: TenantId): PluginContext<Record<string, unknown>> => ({
  tenantId,
  requestId: `${tenantId}-${Date.now()}`,
  namespace: canonicalizeNamespace('recovery:stress:lab'),
  startedAt: new Date().toISOString(),
  config: {},
});

const priorityBySignal = (signal: RecoverySignal): number => {
  switch (signal.severity) {
    case 'critical':
      return 3;
    case 'high':
      return 2;
    case 'medium':
      return 1;
    default:
      return 0;
  }
};

const buildPriority = (runbooks: readonly CommandRunbook[]) =>
  runbooks
    .map((entry, index) => ({ id: String(entry.id), priority: (entry.steps.length + index) % 10 }))
    .sort((left, right) => right.priority - left.priority);

export class StressLabStudioOrchestrator {
  private registry: PluginRegistry | null = null;

  async bootstrap(tenantId: TenantId): Promise<PluginRegistry> {
    if (this.registry) {
      return this.registry;
    }

    this.registry = await buildStudioRegistry(tenantId);
    return this.registry;
  }

  async run(input: StudioOrchestratorInput): Promise<StudioOrchestratorResult> {
    const catalog = await buildStudioPluginCatalog(input.tenantId);
    const signature = catalog
      .map((entry) => `${entry.config.tenantId}:${entry.plugin.name}:${entry.config.order}`)
      .sort()
      .join('|');

    const context = toContext(input.tenantId);

    const payload: StudioRuntimeInput = {
      tenantId: input.tenantId,
      signals: input.signals,
      topology: input.topology,
      runbooks: input.runbooks,
    };

    const { plan, simulation, events } = await executeStudioPlugins(input.tenantId, context, payload);

    const histories = mapIterable(events, (entry, index) => ({
      at: new Date(Date.now() + index * 1000).toISOString(),
      stage: (index % 6 === 0
        ? 'input'
        : index % 6 === 1
          ? 'shape'
          : index % 6 === 2
            ? 'plan'
            : index % 6 === 3
              ? 'simulate'
              : index % 6 === 4
                ? 'recommend'
                : 'report') as StudioStage,
      planSet: index,
    }));

    const plansTriage = collectIterable(mapIterable([
      ...buildPriority(payload.runbooks),
      ...input.signals.map((signal) => ({ id: signal.id, priority: priorityBySignal(signal) })),
    ], (entry) => entry));

    const ready = Boolean(plan && simulation);
    const snapshot: StudioOrchestratorSnapshot = {
      tenantId: input.tenantId,
      stage: ready ? 'simulate' : 'recommend',
      plan,
      simulation,
      ready,
    };

    const _history = Array.from(histories);
    const _pairs = zipLongest(_history, _history);
    const _ = Array.from(_pairs);

    return {
      snapshot,
      events,
      plansTriage,
      manifestSignature: signature,
    };
  }
}

export const createStudioOrchestrator = (): StressLabStudioOrchestrator => new StressLabStudioOrchestrator();
