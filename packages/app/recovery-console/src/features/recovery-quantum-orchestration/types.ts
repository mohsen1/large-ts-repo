import { withBrand } from '@shared/core';
import type { NodeIdentifier, WorkflowGraph, WorkflowNode, WorkflowPath, WorkflowPhase, WorkflowContext } from '@shared/orchestration-kernel';
import type { PluginId } from '@shared/orchestration-kernel';
import type { NoInfer } from '@shared/type-level';

export type QuantumFeatureMode = 'simulation' | 'dry-run' | 'live' | 'postmortem';
export type QuantumSeverity = 'info' | 'warning' | 'error' | 'critical';
export type QuantumRunState = 'idle' | 'bootstrapping' | 'running' | 'steady' | 'finalizing' | 'errored' | 'complete';
export type QuantumRoute = `quantum:${string}`;
export type QuantumResultKey<T extends string> = `${T}/result`;
export type QuantumStage = `stage:${WorkflowPhase}`;

export type BrandedString<T extends string> = `${T}:${string}`;
export type WorkspaceId = BrandedString<'workspace'>;
export type RunId = BrandedString<'run'>;
export type TenantId = BrandedString<'tenant'>;
export type ScenarioId = BrandedString<'scenario'>;
export type SignalHash = BrandedString<'signal'>;

export type QuantumRouteFromPlugin<TPluginId extends string> = `${TPluginId}:${WorkflowPhase}`;

export type QuantumPlanTuple<
  T extends readonly unknown[],
  N extends number,
> = N extends 0 ? [] : T extends readonly [infer Head, ...infer Tail]
  ? [Head, ...QuantumPlanTuple<Tail, N extends 1 ? 0 : N>]
  : T;

export interface QuantumEnvelope<T> {
  readonly traceId: BrandedString<'trace'>;
  readonly tenant: string;
  readonly workspace: string;
  readonly payload: T;
}

type ScenarioSignal = {
  readonly id: SignalHash;
  readonly severity: QuantumSeverity;
  readonly source: string;
  readonly confidence: number;
  readonly observedAt: string;
};

export interface QuantumPlanStep {
  readonly id: RunId;
  readonly label: string;
  readonly phase: WorkflowPhase;
  readonly command: string;
  readonly estimatedMs: number;
  readonly commandGroup: string;
}

export interface QuantumWorkload {
  readonly id: ScenarioId;
  readonly tenant: TenantId;
  readonly name: string;
  readonly mode: QuantumFeatureMode;
  readonly tags: readonly string[];
  readonly signalSet: readonly ScenarioSignal[];
  readonly criticalPath: readonly string[];
}

export interface QuantumWorkspace {
  readonly tenant: TenantId;
  readonly runId: RunId;
  readonly workspaceId: WorkspaceId;
  readonly scenario: QuantumWorkload;
  readonly routes: readonly QuantumRoute[];
  readonly mode: QuantumFeatureMode;
  readonly state: QuantumRunState;
}

export interface QuantumExecutionResult {
  readonly runId: RunId;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly route: QuantumRouteFromPlugin<string>;
  readonly state: QuantumRunState;
  readonly stateMessage: string;
  readonly pluginCount: number;
  readonly criticalPath: WorkflowPath;
}

export interface QuantumPluginMetric {
  readonly pluginId: PluginId;
  readonly pluginRoute: QuantumRoute;
  readonly phase: WorkflowPhase;
  readonly score: number;
  readonly health: QuantumSeverity;
  readonly touchedAt: string;
}

export interface QuantumTelemetryPoint {
  readonly at: string;
  readonly key: string;
  readonly value: number;
  readonly tags: readonly string[];
}

export interface QuantumTimelineEvent {
  readonly index: number;
  readonly at: string;
  readonly stage: WorkflowPhase;
  readonly nodeId: NodeIdentifier;
  readonly detail: string;
}

export interface QuantumRuntimeEnvelope {
  readonly graph: WorkflowGraph;
  readonly workspace: QuantumWorkspace;
  readonly runContext: WorkflowContext;
  readonly metrics: readonly QuantumTelemetryPoint[];
  readonly pluginMetrics: readonly QuantumPluginMetric[];
}

export const createRunId = (tenant: string, seed: string): RunId => withBrand(`run:${tenant}:${seed}`, 'RunId') as RunId;
export const createTenantId = (value: string): TenantId => withBrand(`tenant:${value}`, 'Tenant') as TenantId;
export const createWorkspaceId = (tenant: TenantId, suffix: string): WorkspaceId =>
  withBrand(`workspace:${tenant}:${suffix}`, 'Workspace') as WorkspaceId;
export const createScenarioId = (tenant: TenantId, name: string): ScenarioId =>
  withBrand(`scenario:${tenant}:${name}`, 'Scenario') as ScenarioId;

export const inferSeverity = (score: number): QuantumSeverity =>
  score > 0.85 ? 'critical' : score > 0.65 ? 'error' : score > 0.35 ? 'warning' : 'info';

export const formatPluginRoute = (pluginId: PluginId, phase: WorkflowPhase): QuantumRoute =>
  `quantum:${pluginId}:${phase}` as QuantumRoute;

export const mapSeedToWorkspace = (seed: {
  tenant: string;
  runId: string;
  scenario: string;
  mode: QuantumFeatureMode;
  phases: readonly WorkflowPhase[];
}): QuantumWorkspace => {
  const tenant = createTenantId(seed.tenant);
  const runId = createRunId(seed.tenant, seed.runId);
  const workspaceId = createWorkspaceId(tenant, seed.scenario);
  return {
    tenant,
    runId,
    workspaceId,
    scenario: {
      id: createScenarioId(tenant, seed.scenario),
      tenant,
      name: seed.scenario,
      mode: seed.mode,
      tags: ['recovery', 'orchestration', `phases:${seed.phases.join(',')}`],
      signalSet: [
        {
          id: withBrand(`signal:${tenant}:boot`, 'Signal') as SignalHash,
          severity: 'info',
          source: 'quantum-loader',
          confidence: 0.76,
          observedAt: new Date().toISOString(),
        },
      ],
      criticalPath: seed.phases.map((phase) => `critical:${phase}`),
    },
    routes: seed.phases.map((phase) => `quantum:${tenant}:${phase}` as QuantumRoute),
    mode: seed.mode,
    state: 'idle',
  };
};

const workflowNodeId = (workspace: QuantumWorkspace, phase: WorkflowPhase): NodeIdentifier =>
  withBrand(`node:${workspace.workspaceId}:${phase}`, `WorkflowNode:${workspace.workspaceId}` as const);

export const emptyMetrics = (runId: RunId): readonly QuantumTelemetryPoint[] =>
  Array.from({ length: 5 }, (_, index) => ({
    at: new Date(Date.now() + index * 250).toISOString(),
    key: `quantum-${runId}:${index}`,
    value: index * 10,
    tags: ['bootstrap', 'engine'],
  }));

export const buildWorkloadTimeline = (
  workspace: QuantumWorkspace,
  options?: { readonly offset?: number },
): readonly QuantumTimelineEvent[] => {
  const offset = options?.offset ?? 0;
  const timeline = [
    {
      index: offset,
      at: new Date(Date.now() + offset * 100).toISOString(),
      stage: 'collect',
      nodeId: workflowNodeId(workspace, 'collect'),
      detail: `collect ${workspace.tenant}`,
    },
    {
      index: offset + 1,
      at: new Date(Date.now() + (offset + 1) * 100).toISOString(),
      stage: 'plan',
      nodeId: workflowNodeId(workspace, 'plan'),
      detail: `plan ${workspace.scenario.name}`,
    },
    {
      index: offset + 2,
      at: new Date(Date.now() + (offset + 2) * 100).toISOString(),
      stage: 'execute',
      nodeId: workflowNodeId(workspace, 'execute'),
      detail: 'execute policies',
    },
  ] as const;

  return timeline satisfies readonly QuantumTimelineEvent[];
};

export const toNodeIds = (nodes: readonly WorkflowNode[]): readonly NodeIdentifier[] =>
  nodes.map((node) => node.id);

export const isWarnState = (state: QuantumRunState): state is 'errored' | 'finalizing' => state === 'errored' || state === 'finalizing';

export interface BrandCompatible<T extends string> {
  readonly kind: T;
}

export const pickTraceValue = <T>(value: NoInfer<T>): string => String(value);
