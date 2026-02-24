import {
  type RuntimeManifest,
  type RuntimePolicyMode,
  type RuntimeScope,
  type RuntimeStage,
  type RuntimeRunId,
  runtimeStages,
  toDiagnostics,
  type RuntimeDiagnostics,
  type RuntimeEventPayload,
  type RuntimeContext,
  type RuntimeExecutionLog,
  type RuntimeRunResult,
  createRunId,
  createWorkspaceId,
  createSessionId,
  createTenantId,
} from './types.js';

const fallbackModeRank: Record<RuntimePolicyMode, number> = {
  manual: 1,
  adaptive: 2,
  predictive: 3,
  resilient: 4,
};

interface StagePlan {
  readonly stage: RuntimeStage;
  readonly scope: RuntimeScope;
  readonly weight: number;
  readonly pluginCount: number;
}

interface RuntimeTemplate {
  readonly runId: RuntimeRunId;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly plans: readonly StagePlan[];
}

interface PlanBuildInput {
  readonly tenantId: string;
  readonly workspace: string;
  readonly session?: string;
}

export type PlanMetrics = {
  readonly scopeCount: number;
  readonly stageCount: number;
  readonly totalWeight: number;
  readonly modeScore: number;
};

type WeightedPlugin = RuntimeManifest & { readonly score: number };

const stageWeight = (plugin: RuntimeManifest): number => {
  const mode = plugin.plugin.mode;
  const weightBoost = fallbackModeRank[mode as RuntimePolicyMode] ?? 1;
  return Number(plugin.plugin.weight) * weightBoost;
};

const planScope = (manifest: RuntimeManifest): StagePlan => ({
  stage: manifest.plugin.stage,
  scope: manifest.plugin.scope,
  weight: Math.max(1, manifest.plugin.weight),
  pluginCount: 1,
});

const pluginScore = <TManifest extends RuntimeManifest>(manifest: TManifest): number => {
  const base = Number(manifest.priority) + Number(manifest.plugin.weight);
  const mode = manifest.plugin.mode as RuntimePolicyMode;
  return base * (fallbackModeRank[mode] ?? 1) + Math.max(1, manifest.tags.length);
};

const toSorted = (plans: readonly StagePlan[]): readonly StagePlan[] =>
  plans.toSorted((left, right) => {
    if (left.scope !== right.scope) {
      return left.scope.localeCompare(right.scope);
    }
    if (left.stage !== right.stage) {
      return left.stage.localeCompare(right.stage);
    }
    return right.weight - left.weight;
  });

const rankPlans = (manifests: readonly WeightedPlugin[]): Readonly<RuntimeManifest[]> =>
  manifests
    .toSorted((left, right) => {
      const leftMode = fallbackModeRank[left.plugin.mode as RuntimePolicyMode] ?? 0;
      const rightMode = fallbackModeRank[right.plugin.mode as RuntimePolicyMode] ?? 0;
      return right.score - left.score || rightMode - leftMode;
    })
    .map((entry) => ({ ...entry, score: entry.score }));

const dedupeManifests = (manifests: readonly RuntimeManifest[]): readonly RuntimeManifest[] => {
  const dedupe = new Map<string, RuntimeManifest>();
  for (const manifest of manifests) {
    dedupe.set(manifest.plugin.id as string, manifest);
  }
  return [...dedupe.values()];
};

export interface RuntimePlan {
  readonly runId: RuntimeRunId;
  readonly plans: readonly StagePlan[];
  readonly totalDurationMs: number;
  readonly diagnostics: RuntimeDiagnostics;
  readonly selected: readonly RuntimeManifest[];
  readonly manifestIds: readonly string[];
}

export const buildRuntimePlan = (manifests: readonly RuntimeManifest[], input: PlanBuildInput): RuntimePlan => {
  const runId = createRunId(createTenantId(input.tenantId), 'topology');
  const workspaceId = createWorkspaceId(input.tenantId, input.workspace);
  const sessionId = createSessionId(input.tenantId, input.session ?? workspaceId);

  const weighted: WeightedPlugin[] = manifests.map((manifest) => ({ ...manifest, score: pluginScore(manifest) }));
  const selected = dedupeManifests(rankPlans(weighted));
  const plans = toSorted(selected.map(planScope));
  const diagnostics = toDiagnostics({
    runId,
    pluginCount: selected.length,
    durationMs: selected.reduce((acc, manifest) => acc + Math.max(1, Number(manifest.plugin.weight)) * 17, 0),
    stageCount: plans.length,
    channelCount: selected.length,
  } as const);

  const template: RuntimeTemplate = {
    runId,
    tenantId: input.tenantId,
    workspaceId,
    sessionId,
    plans,
  };

  return {
    runId: template.runId,
    plans: template.plans,
    totalDurationMs: plans.reduce((acc, plan) => acc + plan.weight * 17, 0),
    diagnostics,
    selected,
    manifestIds: selected.map((entry) => `${entry.plugin.id}::${entry.group}`),
  };
};

export const estimatePlan = (plan: RuntimePlan): number => plan.plans.length * 31 + plan.selected.length * 13;

export const inspectPlan = <TChain extends readonly RuntimeManifest[]>(chain: TChain): {
  readonly ok: Readonly<TChain>;
  readonly head: TChain[number] | null;
  readonly output: TChain[number] | null;
  readonly manifestCount: number;
} => {
  const entries = [...chain];
  return {
    ok: entries as unknown as Readonly<TChain>,
    head: entries[0] ?? null,
    output: entries.at(-1) ?? null,
    manifestCount: entries.length,
  };
};

export const toPlanTimeline = (plan: RuntimePlan, events: readonly RuntimeEventPayload[]): readonly { readonly at: string; readonly value: number }[] => {
  const sorted = events.toSorted((left, right) => left.at.localeCompare(right.at));
  return sorted.map((event, index) => ({
    at: event.at,
    value: index + event.channel.length,
  }));
};

export const summarizePlan = (plan: RuntimePlan): string =>
  [`run=${plan.runId}`, `plugins=${plan.selected.length}`, `duration=${plan.totalDurationMs}`, `stages=${plan.plans.length}`].join(' | ');

export const planFromRuntimeResult = <TOutput>(result: RuntimeRunResult<TOutput>): RuntimePlan => {
  const selected = result.manifests as readonly RuntimeManifest[];
  const plans = selected.map((manifest) => ({
    scope: manifest.plugin.scope,
    stage: manifest.plugin.stage,
    weight: manifest.plugin.weight,
    pluginCount: 1,
  }));

  return {
    runId: result.runId,
    selected,
    totalDurationMs: result.diagnostics.durationMs,
    manifestIds: selected.map((entry) => `${entry.plugin.id}`),
    plans,
    diagnostics: toDiagnostics(result.diagnostics),
  };
};

export const buildPlanSummary = (plan: RuntimePlan): string =>
  [`run=${String(plan.runId)}`, `scope=${new Set(plan.plans.map((entry) => entry.scope)).size}`, `stages=${plan.plans.length}`].join(' • ');

export const combineLogs = (left: readonly RuntimeExecutionLog[], right: readonly RuntimeExecutionLog[]): readonly RuntimeExecutionLog[] => {
  const byId = new Map<string, RuntimeExecutionLog>(left.map((log) => [log.pluginId, log]));
  for (const log of right) {
    byId.set(log.pluginId, log);
  }
  return [...byId.values()];
};

export const diagnosticsForContext = (context: RuntimeContext): RuntimePlan =>
  buildRuntimePlan([], {
    tenantId: String(context.tenantId),
    workspace: String(context.workspaceId),
    session: String(context.sessionId),
  });
