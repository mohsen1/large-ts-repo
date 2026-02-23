import { fail, ok, type Result } from '@shared/result';
import type { RecoveryPlaybookContext, RecoveryPlanExecution, PlaybookSelectionPolicy } from '@domain/recovery-playbooks';
import { InMemoryRecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import { RecoveryPlaybookOrchestrator } from './orchestrator';
import type { RecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import { RecoveryPlaybookCatalog } from './selection';
import { createMonitor, RecoveryPlaybookMonitor } from './telemetry';
import { PlaybookPortfolioManager, createPortfolioManager } from './portfolio';
import type { RunId } from './model';

interface OrchestratorConfig {
  readonly tenantId: string;
  readonly serviceBusEnabled?: boolean;
  readonly preferredLabels?: readonly string[];
}

export interface PlaybookLifecycleRequest {
  readonly tenantId: string;
  readonly context: RecoveryPlaybookContext;
  readonly policyOverrides?: Partial<PlaybookSelectionPolicy>;
}

export interface PlaybookLifecycleResult {
  readonly runId: string;
  readonly portfolioId: string;
  readonly warnings: readonly string[];
  readonly telemetryRef: string;
}

interface OrchestrationRuntime {
  readonly orchestrator: RecoveryPlaybookOrchestrator;
  readonly portfolioManager: PlaybookPortfolioManager;
  readonly monitor: RecoveryPlaybookMonitor;
  readonly policy: PlaybookSelectionPolicy;
}

const POLICY_DEFAULT: PlaybookSelectionPolicy = {
  maxStepsPerRun: 18,
  allowedStatuses: ['published'],
  requiredLabels: ['automated'],
  forbiddenChannels: ['manual-window'],
};

const buildPolicy = (
  overrides?: Partial<PlaybookSelectionPolicy>,
  preferredLabels?: readonly string[],
): PlaybookSelectionPolicy => {
  const requiredLabels = preferredLabels?.length
    ? [...preferredLabels]
    : overrides?.requiredLabels
      ?? POLICY_DEFAULT.requiredLabels;
  return {
    ...POLICY_DEFAULT,
    ...overrides,
    requiredLabels,
  };
};

const buildRuntime = (
  repository: RecoveryPlaybookRepository,
  config: OrchestratorConfig,
): OrchestrationRuntime => {
  const catalog = new RecoveryPlaybookCatalog(repository);
  const policy = buildPolicy(undefined, config.preferredLabels);
  const orchestrator = new RecoveryPlaybookOrchestrator({
    catalog,
    repository,
    profiles: config.preferredLabels,
    policy,
    tenantPriority: config.tenantId.length,
  });
  const portfolioManager = createPortfolioManager(repository);
  const monitor = createMonitor(repository);
  return { orchestrator, portfolioManager, monitor, policy };
};

export class RecoveryPlaybookFacade {
  private readonly repository: RecoveryPlaybookRepository;
  private readonly runtimeByTenant = new Map<string, OrchestrationRuntime>();

  constructor(private readonly config: OrchestratorConfig) {
    this.repository = new InMemoryRecoveryPlaybookRepository();
  }

  async prepare(
    request: PlaybookLifecycleRequest,
  ): Promise<Result<PlaybookLifecycleResult, string>> {
    const runtime = await this.runtime(request.tenantId);
    const prepared = await runtime.portfolioManager.prepareRun(request.tenantId, request.context);
    if (!prepared.ok) return fail(prepared.error);

    const plannedPolicy = buildPolicy(request.policyOverrides, this.config.preferredLabels);
    const queued = await runtime.orchestrator.queueRun(request.tenantId, request.context, plannedPolicy);
    if (!queued.ok) return fail(queued.error);

    runtime.monitor.capture(prepared.value.execution, request.tenantId);
    return ok({
      runId: queued.value,
      portfolioId: prepared.value.id,
      warnings: prepared.value.summary.warnings,
      telemetryRef: `${request.tenantId}:${prepared.value.id}`,
    });
  }

  async executeRun(tenantId: string, runId: string): Promise<Result<PlaybookLifecycleResult, string>> {
    const runtime = await this.runtime(tenantId);
    const started = await runtime.orchestrator.runScheduled(runId as RunId);
    if (!started.ok) return fail(started.error);
    const finalized = await runtime.orchestrator.finalizeRun(runId as RunId, 'completed');
    if (!finalized.ok) return fail(finalized.error);
    const run = runtime.portfolioManager.listRuns().find((entry) => entry.id === runId);
    if (run) {
      const updated: RecoveryPlanExecution = { ...run, status: 'completed', completedAt: new Date().toISOString() };
      await runtime.monitor.update(updated);
    }
    return ok({
      runId,
      portfolioId: runId,
      warnings: ['run-executed'],
      telemetryRef: `${tenantId}:${runId}`,
    });
  }

  async summarize(tenantId: string, portfolioId: string): Promise<Result<ReadonlyArray<string>, string>> {
    const runtime = await this.runtime(tenantId);
    const telemetry = await runtime.monitor.emit(portfolioId);
    if (!telemetry.ok) return fail(telemetry.error);
    return ok(telemetry.value.map((entry) => `${entry.portfolioId}:${entry.summary.runCount}`));
  }

  async health(tenantId: string): Promise<Result<'ok' | 'degraded', string>> {
    const runtime = await this.runtime(tenantId);
    const health = await runtime.orchestrator.healthCheck();
    return ok(health);
  }

  private async runtime(tenantId: string): Promise<OrchestrationRuntime> {
    const existing = this.runtimeByTenant.get(tenantId);
    if (existing) return existing;
    const runtime = buildRuntime(this.repository, {
      tenantId,
      preferredLabels: this.config.preferredLabels,
      serviceBusEnabled: this.config.serviceBusEnabled,
    });
    this.runtimeByTenant.set(tenantId, runtime);
    return runtime;
  }
}

export const createFacade = (config: OrchestratorConfig): RecoveryPlaybookFacade =>
  new RecoveryPlaybookFacade(config);
