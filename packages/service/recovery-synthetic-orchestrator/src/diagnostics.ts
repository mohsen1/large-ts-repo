import type {
  PluginChainCompatibility,
  PluginChainOutput,
  SyntheticPlan,
  SyntheticPlanRequest,
  SyntheticPluginDefinition,
  SyntheticRunInputModel,
} from '@domain/recovery-synthetic-orchestration';
import type { SyntheticRunRecordStatus } from '@data/recovery-synthetic-orchestration-store';

export interface DiagnosticSnapshot {
  readonly runId: string;
  readonly label: string;
  readonly phaseCount: number;
  readonly warnings: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface OrchestratorDiagnostics<TChain extends readonly SyntheticPluginDefinition[]> {
  readonly request: SyntheticPlanRequest<TChain>;
  readonly input: SyntheticRunInputModel;
  readonly plan: SyntheticPlan<TChain>;
  readonly timeline: readonly string[];
  readonly snapshots: readonly DiagnosticSnapshot[];
}

export const buildDiagnostics = <TChain extends readonly SyntheticPluginDefinition[]>(
  request: SyntheticPlanRequest<TChain>,
  input: SyntheticRunInputModel,
  plan: SyntheticPlan<TChain>,
  output: PluginChainOutput<TChain> | undefined,
): OrchestratorDiagnostics<TChain> => ({
  request,
  input,
  plan,
  timeline: request.plan.phases.map((phase) => `${phase}:${request.runId}`),
  snapshots: [
    {
      runId: request.runId,
      label: 'orchestrator.start',
      phaseCount: plan.phases.length,
      warnings: plan.phases.length > 0 ? [] : ['no-phases'],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    },
    {
      runId: request.runId,
      label: `orchestrator.output:${typeof output}`,
      phaseCount: plan.phases.length,
      warnings: output === undefined ? ['no-output'] : [],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    },
    {
      runId: request.runId,
      label: `orchestrator.input-requested-by:${input.requestedBy}`,
      phaseCount: plan.phases.length,
      warnings: [
        input.priority.length > 0 ? `priority:${input.priority}` : 'missing-priority',
      ],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    },
  ],
});

export const classify = (status: SyntheticRunRecordStatus): 'ok' | 'degraded' | 'failed' => {
  switch (status) {
    case 'succeeded':
      return 'ok';
    case 'degraded':
      return 'degraded';
    default:
      return 'failed';
  }
};
