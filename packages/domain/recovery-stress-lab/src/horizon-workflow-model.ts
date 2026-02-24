import {
  type Brand,
  type HorizonMetric,
  type HorizonSnapshot,
  type HorizonTemplate,
  type HorizonWorkspaceId,
  type HorizonStage,
  baseTemplate,
} from './horizon-types';

export type RecursiveTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [Head, ...RecursiveTuple<Tail>]
  : [];

export type PrefixPath<Parts extends readonly string[]> = Parts extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? Tail extends readonly []
    ? Head
    : `${Head}/${PrefixPath<Tail>}`
  : never;

export type SplitList<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? [Head, ...SplitList<Tail>]
  : [T];

export type StageFromTemplate<T extends HorizonTemplate> = T['stageOrder'][number];

export type TimelineNode<
  TStage extends HorizonStage,
  TScope extends string = string,
  TId extends string = string,
> = {
  readonly id: Brand<TId, 'HorizonTimelineNodeId'>;
  readonly scope: TScope;
  readonly stage: TStage;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly inputs: readonly Brand<string, 'TimelineInput'>[];
  readonly outputs: readonly Brand<string, 'TimelineOutput'>[];
};

export type StageTransitionGraph = {
  readonly from: HorizonStage;
  readonly to: HorizonStage;
  readonly rationale: string;
  readonly confidence: number;
};

export type WorkflowDefinition<TTemplate extends HorizonTemplate = typeof baseTemplate> = {
  readonly templateId: TTemplate['templateId'];
  readonly workspaceId: HorizonWorkspaceId;
  readonly title: string;
  readonly description: string;
  readonly stages: TTemplate['stageOrder'];
  readonly transitions: readonly StageTransitionGraph[];
};

export interface WorkflowNodeConfig<TStage extends HorizonStage = HorizonStage> {
  readonly id: Brand<string, 'WorkflowNodeId'>;
  readonly stage: TStage;
  readonly stageLabel: `${TStage}`;
  readonly expectedDurationSeconds: number;
  readonly dependencies: readonly Brand<string, 'WorkflowDependency'>[];
  readonly criticality: 1 | 2 | 3 | 4 | 5;
}

export interface WorkflowTemplate<TTemplate extends HorizonTemplate = typeof baseTemplate> {
  readonly definition: WorkflowDefinition<TTemplate>;
  readonly nodes: readonly WorkflowNodeConfig<StageFromTemplate<TTemplate>>[];
}

export type KeyedPayload<T extends Record<string, unknown>> = {
  [K in keyof T as `payload:${string & K}`]: T[K];
};

export type RemappedBySeverity<T extends Record<string, HorizonMetric>> = {
  [K in keyof T as T[K]['name']]: T[K]['severity'];
};

export const computeTimelineChecksum = (stages: readonly StageTransitionGraph[]): string =>
  stages
    .map((stage) => `${stage.from}>${stage.to}:${stage.rationale}:${stage.confidence.toFixed(4)}`)
    .join('|');

export const workflowToPath = (stages: readonly HorizonStage[]): PrefixPath<SplitList<'sense/assess/plan/simulate'>> => {
  return 'sense/assess/plan/simulate';
};

export const defaultWorkflow = (): WorkflowTemplate => {
  const now = new Date().toISOString();
  const transitions: StageTransitionGraph[] = [
    { from: 'sense', to: 'assess', rationale: 'evidence collected', confidence: 0.99 },
    { from: 'assess', to: 'plan', rationale: 'risk matrix stable', confidence: 0.92 },
    { from: 'plan', to: 'simulate', rationale: 'playbook selected', confidence: 0.87 },
    { from: 'simulate', to: 'approve', rationale: 'simulation complete', confidence: 0.83 },
    { from: 'approve', to: 'execute', rationale: 'manual gate', confidence: 0.99 },
    { from: 'execute', to: 'verify', rationale: 'run observed', confidence: 0.93 },
    { from: 'verify', to: 'close', rationale: 'close criteria satisfied', confidence: 0.95 },
  ];

  return {
    definition: {
      templateId: baseTemplate.templateId,
      workspaceId: 'workspace-1' as HorizonWorkspaceId,
      title: 'Incident Continuity Horizon',
      description: 'Simulated stress workflow for continuity operations',
      stages: [...baseTemplate.stageOrder],
      transitions,
    },
    nodes: transitions.map((transition) => ({
      id: `node-${transition.from}-${transition.to}` as Brand<string, 'WorkflowNodeId'>,
      stage: transition.to,
      stageLabel: `${transition.to}` as `${HorizonStage}`,
      expectedDurationSeconds: 180,
      dependencies: [
        `dep-${transition.from}-${transition.to}` as Brand<string, 'WorkflowDependency'>,
      ],
      criticality: 5,
    })),
  };
};

export const flattenTimeline = <TStage extends HorizonStage>(
  workflow: WorkflowTemplate,
): readonly TimelineNode<TStage, string, string>[] =>
  workflow.nodes.map((node) => ({
    id: `timeline-${node.id}` as Brand<string, 'HorizonTimelineNodeId'>,
    scope: node.id,
    stage: node.stage as TStage,
    startedAt: new Date().toISOString(),
    inputs: [`timeline-input-${node.id}` as Brand<string, 'TimelineInput'>],
    outputs: [`timeline-output-${node.id}` as Brand<string, 'TimelineOutput'>],
  }));

export const snapshotToNodeMap = (
  snapshots: readonly HorizonSnapshot[],
): Record<HorizonSnapshot['artifactId'], Brand<string, 'HorizonTimelineNodeId'>> => {
  return snapshots.reduce((acc, snapshot) => {
    acc[snapshot.artifactId] = `node-${snapshot.artifactId}` as Brand<string, 'HorizonTimelineNodeId'>;
    return acc;
  }, {} as Record<HorizonSnapshot['artifactId'], Brand<string, 'HorizonTimelineNodeId'>>);
};

export const buildTimelineWindow = <TStages extends readonly HorizonStage[]>(
  stages: TStages,
): RecursiveTuple<TStages> => {
  return stages as unknown as RecursiveTuple<TStages>;
};

export const summarizeWorkflow = (workflow: WorkflowTemplate): ReadonlyMap<string, number> => {
  const frequencies = new Map<string, number>();
  for (const node of workflow.nodes) {
    frequencies.set(node.stage, (frequencies.get(node.stage) ?? 0) + 1);
  }
  return frequencies;
};

export const sortedChecksum = (workflow: WorkflowTemplate): string => {
  const nodes = [...workflow.nodes].toSorted((left, right) => left.stage.localeCompare(right.stage)).map((node) => node.id);
  return nodes.join('::');
};

export const normalizeTransitionGraph = (graph: readonly StageTransitionGraph[]): StageTransitionGraph[] =>
  [...graph].toSorted((left, right) => left.from.localeCompare(right.from));

export const inferDefinitionTemplateId = <T extends WorkflowDefinition>(
  definition: T,
): T['templateId'] => definition.templateId;
