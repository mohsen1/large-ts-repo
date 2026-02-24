import {
  type Brand,
  type IsoTimestamp,
  type StageId,
  asRunId,
  asStageId,
  isoNow,
} from '@shared/temporal-ops-runtime';
import {
  type TimelineNode,
  type TimelineNodeState,
  type TemporalPhase,
  type TemporalRunbook,
  createRunbook,
  resolveDependencyOrder,
  advanceNode,
} from './models';
import {
  summarizeTrace,
  makeTraceRecord,
  runPipelineWithRegistry,
  TemporalFlowBuilder,
} from '@shared/temporal-ops-runtime/temporal-pipeline';

export interface PlanContext {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly requestedAt: IsoTimestamp;
  readonly traceSampleRate: number;
}

export interface PlanCandidate {
  readonly id: Brand<string, 'PlanId'>;
  readonly name: string;
  readonly budgetMs: number;
  readonly nodeCount: number;
  readonly timeline: readonly string[];
}

export interface OrchestrationPlan<TMeta = unknown> {
  readonly id: Brand<string, 'PlanId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly requestedAt: IsoTimestamp;
  readonly runbook: TemporalRunbook<unknown>;
  readonly candidates: readonly PlanCandidate[];
}

export const createPlan = <TMeta>(
  tenant: Brand<string, 'TenantId'>,
  planName: string,
  candidateNames: readonly string[],
  metadata: TMeta,
): OrchestrationPlan<TMeta> => {
  const runbook = createRunbook(planName, tenant, `tenant-${String(tenant)}`);
  const candidates = candidateNames.toSorted().map((name, index) => ({
    id: `plan:${name}:${index}` as Brand<string, 'PlanId'>,
    name,
    budgetMs: 500 + index * 250,
    nodeCount: index + 1,
    timeline: [name],
  }));

  return {
    id: `plan:${planName}:${Math.random().toString(36).slice(2)}` as Brand<string, 'PlanId'>,
    tenant,
    requestedAt: isoNow(),
    runbook: {
      ...runbook,
      metadata,
    },
    candidates,
  };
};

export const annotatePlan = <TMeta>(
  plan: OrchestrationPlan<TMeta>,
  state: TimelineNodeState,
): OrchestrationPlan<TMeta> => {
  const timeline = plan.runbook.nodes
    .map((node) => {
      return {
        ...node,
        state,
      } as TimelineNode<unknown>;
    })
    .toSorted((left, right) => left.startedAt.localeCompare(right.startedAt));

  return {
    ...plan,
    runbook: {
      ...plan.runbook,
      nodes: timeline,
    },
  };
};

export const expandCandidates = (candidates: readonly string[]): readonly PlanCandidate[] => {
  return candidates.toSorted().flatMap((candidate, index) => {
    const baseBudget = (index + 1) * 100;
    return [
      {
        id: `candidate:${candidate}:${baseBudget}` as Brand<string, 'PlanId'>,
        name: `${candidate}-fast`,
        budgetMs: baseBudget,
        nodeCount: index + 2,
        timeline: [candidate, `${candidate}:fast`],
      },
      {
        id: `candidate:${candidate}:${baseBudget + 1}` as Brand<string, 'PlanId'>,
        name: `${candidate}-safe`,
        budgetMs: baseBudget + 180,
        nodeCount: index + 3,
        timeline: [candidate, `${candidate}:safe`],
      },
    ];
  });
};

const buildIdempotentNodes = <TPayload>(
  base: TimelineNode<TPayload>,
  states: readonly TimelineNodeState[],
): readonly TimelineNode<TPayload>[] => {
  return states.map((state, index) => ({
    ...base,
    id: `${base.id}:clone:${index}` as StageId,
    state: state as TimelineNodeState,
    startedAt: isoNow(),
    completedAt: state === 'complete' ? isoNow() : undefined,
  }));
};

export const computeTimelineFromPlan = <TMeta>(plan: OrchestrationPlan<TMeta>): readonly TimelineNode[] => {
  const nodes: TimelineNode[] = plan.candidates
    .map((candidate, index) => ({
      id: asStageId(plan.runbook.runId, String(candidate.id)),
      kind: 'timeline:plan' as Brand<string, 'TimelineNodeKind'>,
      tenant: plan.tenant,
      name: candidate.name,
      state: index % 2 === 0 ? ('complete' as TimelineNodeState) : ('pending' as TimelineNodeState),
      phase: index % 2 === 0 ? ('simulate' as TemporalPhase) : ('execute' as TemporalPhase),
      payload: candidate,
      startedAt: isoNow(),
      completedAt: index % 2 === 0 ? isoNow() : undefined,
      dependsOn: [],
      errors: index % 2 === 0 ? [] : ['waiting-for-prereqs'],
    }))
    .map((node) => advanceNode(node, node.state));

  const ordered = resolveDependencyOrder(nodes);
  const expanded = nodes.flatMap((node) => buildIdempotentNodes(node, ['active', 'complete'] as const));

  return [...ordered, ...expanded].toSorted((left, right) => {
    if (left.phase === right.phase) {
      return left.startedAt.localeCompare(right.startedAt);
    }

    return left.phase.localeCompare(right.phase);
  });
};

export const collectPlanSignals = <TMeta>(plan: OrchestrationPlan<TMeta>) => {
  const timeline = computeTimelineFromPlan(plan);
  return summarizeTrace(
    timeline
      .map((node, index) =>
        makeTraceRecord(`plan:${index}`, plan.runbook.runId, { node, stage: index } as const, {
          snapshot: String(node.id),
        }),
      )
      .toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt)),
  );
};

export const toSortedPhases = <TMeta>(runbook: TemporalRunbook<TMeta>): readonly string[] => {
  return runbook.nodes
    .map((node) => node.phase)
    .toSorted((left, right) => left.localeCompare(right));
};

export interface PipelineInput {
  readonly runId: Brand<string, 'RunId'>;
  readonly value: unknown;
}

export const executeFlow = async <TInput, TOutput>(
  input: TInput,
  context: {
    readonly runId: Brand<string, 'RunId'>;
    readonly tenant: Brand<string, 'TenantId'>;
    readonly at: IsoTimestamp;
  },
  factory: (builder: TemporalFlowBuilder) => void,
): Promise<TOutput> => {
  const builder = new TemporalFlowBuilder(`tenant:${String(context.tenant)}`);
  factory(builder);
  const flow = builder.build();
  const output = await flow.run(input, context);
  return output as TOutput;
};

const identityNode = <TValue>(value: TValue, runId: Brand<string, 'RunId'>): TimelineNode<TValue> => ({
  id: asStageId(runId, `identity:${Math.random().toString(16).slice(2)}`),
  kind: 'timeline:identity' as Brand<string, 'TimelineNodeKind'>,
  tenant: 'internal' as Brand<string, 'TenantId'>,
  name: 'identity',
  state: 'complete',
  phase: 'ingest',
  payload: value,
  startedAt: isoNow(),
  completedAt: isoNow(),
  dependsOn: [],
  errors: [],
});

export const flowAudit = (runId: Brand<string, 'RunId'>, payload: unknown[]): readonly TimelineNode[] => {
  const nodes = payload.map((value) => identityNode(value, runId));
  return nodes.toSorted((left, right) => left.name.localeCompare(right.name) || left.startedAt.localeCompare(right.startedAt));
};
