import { Brand, NoInfer } from '@shared/type-level';
import { OrchestrationNodeId, PolicyNode, PolicyPlan } from '@domain/policy-orchestration';

export type StudioMode = 'observe' | 'design' | 'simulate' | 'execute';
export type StudioSection = `section:${StudioMode}`;
export type StudioStateKey = `studio:${string}`;
export type StudioCommandId = Brand<string, 'StudioCommandId'>;
export type StudioArtifactId = Brand<string, 'StudioArtifactId'>;

export interface StudioTopologyEdge {
  readonly source: OrchestrationNodeId;
  readonly target: OrchestrationNodeId;
  readonly label: string;
}

export interface StudioTopologyItem {
  readonly nodeId: OrchestrationNodeId;
  readonly title: string;
  readonly section: StudioSection;
  readonly nodeType: 'artifact' | 'window' | 'run';
}

export interface StudioTrace {
  readonly commandId: StudioCommandId;
  readonly message: string;
  readonly severity: 'info' | 'warn' | 'error' | 'success';
}

export interface StudioCommand<TMode extends StudioMode = StudioMode, TScope extends string = 'global'> {
  readonly commandId: StudioCommandId;
  readonly scope: TScope;
  readonly mode: TMode;
  readonly actor: string;
}

type TemplateName<T extends string> = `template:${T}`;
type StudioPayload<T> = {
  [K in keyof T as K extends string ? `studio:${K}` : never]: T[K];
};

export type StudioTemplatePayload = StudioPayload<{ name: string; variables: string[]; reason: string }>;
export type StudioSummary = {
  readonly id: StudioStateKey;
  readonly plans: readonly StudioPlanSnapshot[];
  readonly nodes: readonly StudioTopologyItem[];
};

export interface StudioPlanSnapshot {
  readonly plan: PolicyPlan['id'];
  readonly revision: number;
  readonly runId: StudioCommandId;
  readonly createdAt: string;
  readonly selectedTemplate: TemplateName<string>;
}

export interface StudioWorkspace {
  readonly id: StudioStateKey;
  readonly orchestratorId: string;
  readonly mode: StudioMode;
  readonly planId: PolicyPlan['id'] | null;
  readonly selectedNodeIds: readonly OrchestrationNodeId[];
  readonly query: string;
  readonly command: StudioCommand<StudioMode, 'global'>;
  readonly traces: readonly StudioTrace[];
}

export interface StudioTelemetryPoint {
  readonly key: string;
  readonly value: number;
  readonly runId: string;
}

export interface StudioTopology {
  readonly nodes: readonly StudioTopologyItem[];
  readonly edges: readonly StudioTopologyEdge[];
  readonly groups: readonly {
    readonly section: StudioSection;
    readonly count: number;
  }[];
}

export const studioSections = ['observe', 'design', 'simulate', 'execute'] as const satisfies readonly StudioMode[];

export const newCommandId = (prefix: string): StudioCommandId =>
  `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}` as StudioCommandId;

export const newStudioNodeId = (value: string): OrchestrationNodeId =>
  `studio:${value}` as OrchestrationNodeId;

export const toStudioSection = (mode: StudioMode): StudioSection => `section:${mode}` as StudioSection;

export const mapTopologyNodes = (nodes: readonly PolicyNode[]): readonly StudioTopologyItem[] =>
  nodes.map((node, index) => ({
    nodeId: node.id,
    title: node.artifact.name,
    section: toStudioSection(index % 2 === 0 ? 'design' : 'simulate'),
    nodeType: node.requiresHumanApproval ? 'run' : 'artifact',
  }));

export const makeStudioSummary = (plan: PolicyPlan, nodes: readonly PolicyNode[]): StudioSummary => {
  const artifactSections = new Set(studioSections.map(toStudioSection));
  const sections = [...artifactSections].map((section) => ({
    section,
    count: nodes.length,
  }));
  return {
    id: `studio:${plan.id}` as StudioStateKey,
    plans: [
      {
        plan: plan.id,
        revision: plan.revision,
        runId: newCommandId('plan'),
        createdAt: new Date().toISOString(),
        selectedTemplate: `template:${plan.id}` as TemplateName<string>,
      },
    ],
    nodes: mapTopologyNodes(nodes),
  };
};

export type TraceByMode<T extends StudioMode> = T extends 'observe'
  ? 'info'
  : T extends 'design'
    ? 'success'
    : T extends 'simulate'
      ? 'warn'
      : 'error';

export const asCommand = <T extends NoInfer<{ mode: StudioMode; actor: string }>>(
  input: T,
): StudioCommand<T['mode'], 'global'> => ({
  commandId: newCommandId(input.actor),
  scope: 'global',
  mode: input.mode,
  actor: input.actor,
});
