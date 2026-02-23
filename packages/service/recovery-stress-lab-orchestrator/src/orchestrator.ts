import { RecoverySignal, TenantId } from '@domain/recovery-stress-lab';
import {
  InMemoryPersistence,
  ConsoleAuditSink,
  detectPlanDrift,
  buildHistory,
  type StressLabAdapter,
} from '@domain/recovery-stress-lab';
import { StressLabDecision, StressLabSession } from './types';
import { buildDecisionFromInput, persistDecision, buildSession } from './adapters';
import { StressLabWorkspace, StressLabEngineConfig } from './types';

export type StressLabWorkspaceState = {
  readonly workspace: StressLabWorkspace;
  readonly decision: StressLabDecision;
  readonly session: StressLabSession;
  readonly history: ReturnType<typeof buildHistory>;
};

export interface StressLabOrchestratorContext {
  readonly tenantId: TenantId;
  readonly config: StressLabEngineConfig;
  readonly topologyId: string;
  readonly runbooks: Array<{
    id: string;
    title: string;
    steps: readonly unknown[];
    cadence: { weekday: number; windowStartMinute: number; windowEndMinute: number };
  }>;
  readonly targets: unknown[];
  readonly signals: RecoverySignal[];
}

export interface OrchestratorDependencies {
  persistence?: InMemoryPersistence;
  adapters?: {
    audit?: ConsoleAuditSink;
    externalAdapter?: StressLabAdapter;
  };
}

export class StressLabOrchestrator {
  private readonly persistence: InMemoryPersistence;
  private readonly audit: ConsoleAuditSink;
  private readonly externalAdapter: StressLabAdapter | null;

  constructor(deps: OrchestratorDependencies = {}) {
    this.persistence = deps.persistence ?? new InMemoryPersistence();
    this.audit = deps.adapters?.audit ?? new ConsoleAuditSink();
    this.externalAdapter = deps.adapters?.externalAdapter ?? null;
  }

  async bootstrap(context: StressLabOrchestratorContext): Promise<StressLabWorkspaceState> {
    const decision = buildDecisionFromInput({
      tenantId: context.tenantId,
      draft: {
        name: `tenant-${context.tenantId}`,
        description: 'auto-generated stress lab draft',
        band: context.config.band,
        selectedSignals: [],
        selectedRunbookIds: context.config.selectedRunbooks,
      },
      config: context.config,
      runbooks: context.runbooks,
      targets: context.targets as any,
      topology: {
        tenantId: context.tenantId,
        nodes: [],
        edges: [],
      },
      signals: context.signals,
    });

    const session = buildSession(context.tenantId, decision);
    const previous = await this.persistence.loadPlan(context.tenantId);

    await persistDecision(
      {
        persistence: this.persistence,
        audit: this.audit,
      },
      context.tenantId,
      decision,
    );

    const previousSimulation = await this.persistence.loadSimulation(context.tenantId);
    if (decision.simulation && previousSimulation) {
      if (detectPlanDrift(previousSimulation, decision.simulation)) {
        await this.audit.emit('simulation-drift', {
          tenantId: context.tenantId,
          previousRisk: previousSimulation.riskScore,
          nextRisk: decision.simulation.riskScore,
        });
      }
    }

    const history = buildHistory(context.tenantId, decision.plan, decision.simulation!);

    if (this.externalAdapter) {
      await this.externalAdapter.ping();
    }

    await this.audit.emit('stress-lab-bootstrap-complete', {
      tenantId: context.tenantId,
      hasPlan: decision.plan !== null,
      hasSimulation: decision.simulation !== null,
      historyAt: history.createdAt,
    });

    const workspace: StressLabWorkspace = {
      tenantId: context.tenantId,
      runbooks: decision.plan ? decision.plan.runbooks : [],
      targetWorkloads: context.targets as any,
      knownSignals: context.signals,
      config: context.config,
    };

    return {
      workspace,
      decision,
      session,
      history,
    };
  }

  async refreshConfig(context: Omit<StressLabOrchestratorContext, 'signals'>): Promise<void> {
    await this.audit.emit('stress-lab-refresh-request', {
      tenantId: context.tenantId,
      topologyId: context.topologyId,
      runbookCount: context.runbooks.length,
    });
    await this.persistence.savePlan(context.tenantId, {
      tenantId: context.tenantId,
      scenarioName: `refresh-${context.tenantId}`,
      schedule: [],
      runbooks: [],
      dependencies: { nodes: [], edges: [] },
      estimatedCompletionMinutes: 0,
    });
  }

  async currentPlan(tenantId: TenantId) {
    return this.persistence.loadPlan(tenantId);
  }
}
