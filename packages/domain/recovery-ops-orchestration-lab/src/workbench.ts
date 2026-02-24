import type { LabPlan, OrchestrationLab, OrchestrationPolicy } from './types';
import type { PluginRegistry } from './plugin-registry';
import type { LabGraphSnapshot } from './lab-graph';
import { buildLabGraph } from './lab-graph';
import { randomUUID } from 'node:crypto';

export interface WorkbenchContext {
  readonly workspaceId: string;
  readonly tenant: string;
  readonly policy: OrchestrationPolicy;
  readonly policyDigest: string;
  readonly startedAt: string;
}

export interface WorkbenchSnapshot {
  readonly plan: LabPlan;
  readonly selectedPlanId?: LabPlan['id'];
  readonly score: number;
  readonly confidence: number;
}

export interface LabWorkspaceOptions {
  readonly tenant: string;
  readonly lab: OrchestrationLab;
  readonly policy: OrchestrationPolicy;
  readonly graph?: LabGraphSnapshot;
}

export interface WorkspaceResult {
  readonly workspaceId: string;
  readonly planSequence: readonly LabPlan[];
  readonly diagnostics: {
    readonly planCount: number;
    readonly totalSteps: number;
    readonly selectedPlanId?: LabPlan['id'];
  };
  readonly snapshots: readonly WorkbenchSnapshot[];
}

export interface WorkbenchLease {
  readonly release: () => void;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface WorkbenchEvent {
  readonly at: string;
  readonly phase: 'build' | 'plan' | 'score' | 'finish';
  readonly text: string;
}

const workspaceId = (tenant: string): string => `ws-${tenant}-${randomUUID()}`;

const buildWorkspaceContext = (tenant: string, lab: OrchestrationLab, policy: OrchestrationPolicy): WorkbenchContext => ({
  workspaceId: workspaceId(tenant),
  tenant,
  policy,
  policyDigest: `${policy.id}:${policy.timeoutMinutes}`,
  startedAt: new Date().toISOString(),
});

const buildPlanSnapshots = (plans: readonly LabPlan[], scoreMap: ReadonlyMap<LabPlan['id'], number>): readonly WorkbenchSnapshot[] =>
  plans.map((plan) => {
    const score = scoreMap.get(plan.id) ?? 0;
    const confidence = (plan.confidence * score);
    return {
      plan,
      selectedPlanId: undefined,
      score,
      confidence,
    };
  });

const bestPlan = (snapshots: readonly WorkbenchSnapshot[]): LabPlan['id'] | undefined => {
  const sorted = [...snapshots].toSorted((left, right) => right.score - left.score);
  return sorted[0]?.plan.id;
};

const totalSteps = (plans: readonly LabPlan[]): number => plans.reduce((acc, plan) => acc + plan.steps.length, 0);

export const buildWorkbench = (opts: LabWorkspaceOptions): WorkspaceResult => {
  const graph = opts.graph ?? buildLabGraph(opts.lab);
  const scoreMap = new Map<LabPlan['id'], number>();

  for (const plan of opts.lab.plans) {
    scoreMap.set(plan.id, plan.score + plan.confidence * 100);
  }

  const snapshots = buildPlanSnapshots(opts.lab.plans, scoreMap);
  const selectedPlanId = bestPlan(snapshots);

  const diagnostics = {
    planCount: opts.lab.plans.length,
    totalSteps: totalSteps(opts.lab.plans),
    selectedPlanId,
  };

  return {
    workspaceId: buildWorkspaceContext(opts.tenant, opts.lab, opts.policy).workspaceId,
    planSequence: [...opts.lab.plans],
    diagnostics,
    snapshots,
  };
};

export const sequenceEvents = function* (lab: OrchestrationLab): Iterable<WorkbenchEvent> {
  yield { at: lab.createdAt, phase: 'build', text: `build:${lab.id}` };
  yield { at: new Date().toISOString(), phase: 'plan', text: `plans:${lab.plans.length}` };
  yield { at: new Date().toISOString(), phase: 'score', text: `signals:${lab.signals.length}` };
  yield { at: new Date().toISOString(), phase: 'finish', text: `tenant:${lab.tenantId}` };
};

const buildEventLog = (lab: OrchestrationLab): readonly WorkbenchEvent[] => [...sequenceEvents(lab)].toSorted((left, right) => {
  const leftRank = left.phase === 'build' ? 0 : left.phase === 'plan' ? 1 : left.phase === 'score' ? 2 : 3;
  const rightRank = right.phase === 'build' ? 0 : right.phase === 'plan' ? 1 : right.phase === 'score' ? 2 : 3;
  return leftRank - rightRank;
});

export class WorkbenchFactory {
  private readonly events = new Map<string, readonly WorkbenchEvent[]>();

  create(
    tenant: string,
    lab: OrchestrationLab,
    policy: OrchestrationPolicy,
    graph?: LabGraphSnapshot,
  ): WorkspaceResult {
    const result = buildWorkbench({ tenant, lab, policy, graph });
    this.events.set(result.workspaceId, [...buildEventLog(lab)]);
    return result;
  }

  getEvents(workspaceId: string): readonly WorkbenchEvent[] {
    return this.events.get(workspaceId) ?? [];
  }
}

const withScope = async <T>(
  callback: (state: { workspace: WorkbenchContext; policies: readonly string[] }) => Promise<T>,
): Promise<T> => {
  const context = {
    workspace: buildWorkspaceContext(
      'tenant',
      { id: 'orphan' as never, scenarioId: 'unknown', tenantId: 'tenant', incidentId: 'incident', title: 'orphan', signals: [], windows: [], plans: [], createdAt: '', updatedAt: '' },
      { id: 'policy' as never, tenantId: 'tenant', maxParallelSteps: 1, minConfidence: 0, allowedTiers: ['signal'], minWindowMinutes: 1, timeoutMinutes: 1 } as never,
    ),
    policies: [] as never[],
  };
  const stack = new AsyncDisposableStack();
  void stack;
  return callback(context);
};

export const runWithPluginScope = async <
  TInput,
  TOutput,
>(
  workspace: WorkbenchContext,
  policy: { readonly id: string },
  registry: PluginRegistry<readonly []>,
  input: TInput,
  pluginRunner: (snapshot: WorkbenchContext, input: TInput) => Promise<TOutput>,
): Promise<TOutput> => {
  const runId = `${policy.id}:${workspace.workspaceId}` as never;
  return pluginRunner(workspace, { ...input, runId: String(runId) } as TInput & { runId: string });
};

export const workspaceMetadata = (
  result: WorkspaceResult,
  graph?: LabGraphSnapshot,
): readonly string[] => {
  const base = [`id:${result.workspaceId}`, `plans:${result.diagnostics.planCount}`, `steps:${result.diagnostics.totalSteps}`];
  if (graph) {
    return [...base, `nodes:${graph.nodes.length}`, `edges:${graph.edges.length}`];
  }
  return base;
};
