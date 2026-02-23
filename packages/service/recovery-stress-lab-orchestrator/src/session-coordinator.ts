import {
  TenantId,
  RecoverySignal,
  CommandRunbook,
  OrchestrationPlan,
  RecoverySimulationResult,
  WorkloadTarget,
  WorkloadTopology,
  createSignalId,
} from '@domain/recovery-stress-lab';
import { buildDecisionFromInput, ensureSimulation, persistDecision } from './adapters';
import { InMemoryPersistence, ConsoleAuditSink, buildHistory } from '@domain/recovery-stress-lab';
import { buildReadinessMatrix, evaluatePlanCoverage } from '@domain/recovery-stress-lab';
import { rankRunbooksByReadiness } from './analytics';
import { StressLabDecision, StressLabEngineConfig, StressLabWorkspace } from './types';

export interface SessionCoordinatorInput {
  readonly tenantId: TenantId;
  readonly config: StressLabEngineConfig;
  readonly runbooks: readonly {
    id: string;
    title: string;
    steps: readonly unknown[];
    cadence: { weekday: number; windowStartMinute: number; windowEndMinute: number };
  }[];
  readonly targets: readonly WorkloadTarget[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
}

export interface WorkspaceContext {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly runbooks: readonly CommandRunbook[];
  readonly signalCount: number;
  readonly config: StressLabEngineConfig;
}

export interface WorkspaceSnapshot {
  readonly workspace: StressLabWorkspace;
  readonly decision: StressLabDecision;
  readonly context: WorkspaceContext;
  readonly readiness: {
    readonly matrixScore: number;
    readonly coverageRatio: number;
    readonly runbookRanking: ReadonlyArray<{ id: CommandRunbook['id']; score: number }>;
  };
  readonly history: ReturnType<typeof buildHistory>;
}

export interface SessionCoordinator {
  bootstrap(input: SessionCoordinatorInput): Promise<WorkspaceSnapshot>;
  refresh(input: Pick<SessionCoordinatorInput, 'config' | 'runbooks' | 'targets' | 'topology' | 'signals'>): Promise<WorkspaceSnapshot>;
}

export class DefaultSessionCoordinator implements SessionCoordinator {
  private readonly persistence: InMemoryPersistence;
  private readonly audit: ConsoleAuditSink;

  constructor(persistence: InMemoryPersistence = new InMemoryPersistence(), audit = new ConsoleAuditSink()) {
    this.persistence = persistence;
    this.audit = audit;
  }

  async bootstrap(input: SessionCoordinatorInput): Promise<WorkspaceSnapshot> {
    const decision = buildDecisionFromInput({
      tenantId: input.tenantId,
      draft: {
        name: `bootstrap-${input.tenantId}`,
        description: 'automated bootstrap session',
        band: input.config.band,
        selectedSignals: [],
        selectedRunbookIds: input.config.selectedRunbooks,
      },
      config: input.config,
      runbooks: input.runbooks,
      targets: input.targets,
      topology: input.topology,
      signals: input.signals,
    });

    const runbooks = (input.runbooks ?? []).map((item, index) => ({
      ...item,
      id: createSignalId(`planner-${index}-${item.id}`),
      title: item.title,
      steps: item.steps,
      cadence: item.cadence,
    }));

    const workspace: StressLabWorkspace = {
      tenantId: input.tenantId,
      runbooks: decision.plan?.runbooks ?? [],
      targetWorkloads: input.targets,
      knownSignals: input.signals,
      config: input.config,
    };

    const plan = decision.plan;
    const simulation = decision.simulation;
    const existing = await this.persistence.loadSimulation(input.tenantId);
    const merged = ensureSimulation(existing, simulation ?? (await this.persistence.loadSimulation(input.tenantId) ?? ({ tenantId: input.tenantId, ticks: [], riskScore: 0, slaCompliance: 1, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), selectedRunbooks: [], notes: [] } as RecoverySimulationResult)));

    const readinessCoverage = evaluatePlanCoverage(
      plan ?? {
        tenantId: input.tenantId,
        schedule: [],
        runbooks: [],
        dependencies: { nodes: [], edges: [] },
        estimatedCompletionMinutes: 0,
        scenarioName: `recovery-${input.tenantId}`,
      },
      input.config.band,
    );

    const matrix = buildReadinessMatrix({
      tenantId: input.tenantId,
      runbooks: plan?.runbooks ?? [],
      signals: input.signals,
      topology: input.topology,
    });

    await persistDecision({ persistence: this.persistence, audit: this.audit }, input.tenantId, {
      plan,
      simulation: merged,
      errors: decision.errors,
    });

    const history = buildHistory(input.tenantId, plan, merged);

    await this.audit.emit('stress-lab-session-bootstrap', {
      tenantId: input.tenantId,
      commandCount: runbooks.length,
      signalCount: input.signals.length,
      hasSimulation: Boolean(merged),
      matrixScore: matrix.total,
    });

    const ranking = rankRunbooksByReadiness(plan?.runbooks ?? []);
    return {
      workspace,
      decision: {
        ...decision,
        simulation: merged,
      },
      context: {
        tenantId: input.tenantId,
        plan,
        simulation: merged,
        runbooks: plan?.runbooks ?? [],
        signalCount: input.signals.length,
        config: input.config,
      },
      readiness: {
        matrixScore: matrix.total,
        coverageRatio: readinessCoverage.coverage,
        runbookRanking: ranking,
      },
      history,
    };
  }

  async refresh(input: Omit<SessionCoordinatorInput, 'tenantId'> & { tenantId: TenantId }): Promise<WorkspaceSnapshot> {
    return this.bootstrap(input);
  }
}
