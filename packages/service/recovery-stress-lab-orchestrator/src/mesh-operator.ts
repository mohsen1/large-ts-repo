import { TenantId, SeverityBand, RecoverySignal, WorkloadTopology, CommandRunbook, RecoverySimulationResult, OrchestrationPlan, createRunbookId } from '@domain/recovery-stress-lab';
import { StressLabEngineConfig, StressLabDecision, StressLabSession } from './types';
import { buildSession } from './adapters';
import { executeMeshPipeline } from './mesh-pipeline';
import {
  StressLabMeshAdapters,
  MeshOperatorState,
  persistDecision as persistMeshDecision,
  publishMeshReport,
  StressLabMeshReport,
} from './mesh-adapters';
import { summarizeMeshHealth } from './mesh-intelligence';
import { rankRunbooksByReadiness } from './analytics';

export interface MeshOrchestratorInput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly unknown[];
  readonly config: StressLabEngineConfig;
}

export interface MeshOrchestratorOutput {
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly session: StressLabSession | null;
  readonly ranking: ReturnType<typeof rankRunbooksByReadiness>;
  readonly meshState: MeshOperatorState;
  readonly decision: StressLabDecision;
  readonly driftReason: string;
}

export interface MeshOrchestratorContext {
  readonly activeBand: SeverityBand;
  readonly hasTopology: boolean;
}

export class StressLabMeshOperator {
  private readonly state: MeshOrchestratorContext;

  constructor(
    private readonly adapters: StressLabMeshAdapters,
    context: MeshOrchestratorContext,
  ) {
    this.state = context;
  }

  private async loadOrDefaults(runbooks: readonly CommandRunbook[]): Promise<readonly CommandRunbook[]> {
    if (runbooks.length > 0) {
      return runbooks;
    }
    if (!this.adapters.signalAdapter) return [];
    return this.adapters.signalAdapter.fetchRunbooks(this.state.activeBand as unknown as TenantId);
  }

  private buildConfig(input: MeshOrchestratorInput): { readonly selectedRunbooks: readonly string[] } {
    return { selectedRunbooks: input.config.selectedRunbooks.map((id) => String(id)) };
  }

  async run(input: MeshOrchestratorInput): Promise<MeshOrchestratorOutput> {
    const runbooks = await this.loadOrDefaults(input.runbooks);
    const selectedRunbooks = this.buildConfig(input).selectedRunbooks;
    const fallbackSignals = await this.adapters.signalAdapter?.fetchSignals(input.tenantId);
    const draftSignals = fallbackSignals && fallbackSignals.length > 0 ? fallbackSignals : input.signals;
    const config = {
      ...input.config,
      selectedRunbooks: selectedRunbooks.map((id) => createRunbookId(id)),
    };

    const pipeline = await executeMeshPipeline({
      tenantId: input.tenantId,
      band: input.band,
      runbooks,
      topology: input.topology,
      signals: draftSignals,
      draft: {
        name: `mesh-${input.tenantId}`,
        description: 'mesh-driven stress lab draft',
      },
      config,
    });

    const decision = pipeline.decision;
    const state = await persistMeshDecision(this.adapters, input.tenantId, decision);
    const session = buildSession(input.tenantId, decision);

    const health = summarizeMeshHealth({
      tenantId: input.tenantId,
      band: input.band,
      plan: decision.plan,
      topology: input.topology,
      signals: draftSignals,
      runbooks: runbooks,
      simulation: decision.simulation,
    });

    const report: StressLabMeshReport = {
      tenantId: input.tenantId,
      plan: decision.plan,
      simulation: decision.simulation,
      decision,
      generatedAt: new Date().toISOString(),
      warnings: [...decision.errors, ...health.readinessReasons],
      metadata: {
        runbooks: input.runbooks.length,
        signalDensity: runbooks.length,
        routeCount: health.routeCount,
        readynessScore: health.readynessScore,
        accepted: input.config.profileHint !== 'conservative' || health.readynessScore > 2,
        topologyNodes: input.topology.nodes.length,
      },
    };
    await publishMeshReport(this.adapters, report);

    return {
      plan: decision.plan,
      simulation: decision.simulation,
      session,
      ranking: runbooks.length > 0 ? rankRunbooksByReadiness(runbooks) : [],
      meshState: { ...state },
      decision,
      driftReason: health.readinessReasons[0] ?? 'mesh complete',
    };
  }
}
