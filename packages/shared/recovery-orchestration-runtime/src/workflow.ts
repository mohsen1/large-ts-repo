import { NoInfer, RecursivePath } from '@shared/type-level';
import type { ConductorPluginDefinition, ConductorPluginPhase, ConductorPluginContext, ConductorPluginResult } from './plugins';
import { canonicalizeRoute, ConductorNamespace, ConductorRunId, ConductorWorkflowId, buildWorkflowId } from './ids';

export type WorkflowPayload<TType = unknown> = Readonly<{
  readonly namespace: ConductorNamespace;
  readonly runId: ConductorRunId;
  readonly payload: Readonly<TType>;
  readonly seed: Readonly<TType>;
}>;

export type WorkflowPhaseTransition<TInput, TOutput> = {
  readonly from: ConductorPluginPhase;
  readonly to: ConductorPluginPhase;
  readonly inputShape: RecursivePath<TInput>;
  readonly outputShape: RecursivePath<TOutput>;
};

export type PhaseTemplate<
  TInput,
  TOutput,
  TContext extends ConductorPluginContext = ConductorPluginContext,
> = (context: TContext, input: NoInfer<TInput>) => Promise<ConductorPluginResult<TOutput>>;

export type PhaseChain<TChain extends readonly ConductorPluginDefinition[]> = TChain extends readonly [
  infer Head extends ConductorPluginDefinition<infer TInput, any, any, any>,
  ...infer Tail extends readonly ConductorPluginDefinition[],
]
  ? Tail extends readonly [
      ConductorPluginDefinition<TInput, any, any, any>,
      ...readonly ConductorPluginDefinition[],
    ]
    ? [Head, ...PhaseChain<Tail>]
    : [Head]
  : [];

export type WorkflowOutput<TChain extends readonly ConductorPluginDefinition[]> = TChain extends readonly [
  ...any[],
  infer Tail extends ConductorPluginDefinition<any, infer TOutput, any, any>,
]
  ? TOutput
  : never;

export interface WorkflowDescriptor<TChain extends readonly ConductorPluginDefinition[]> {
  readonly namespace: ConductorNamespace;
  readonly workflowId: ConductorWorkflowId;
  readonly chain: TChain;
  readonly route: string;
  readonly phases: readonly ConductorPluginPhase[];
  readonly tags: readonly string[];
}

export interface WorkflowEvent {
  readonly at: string;
  readonly type: 'created' | 'scheduled' | 'validated' | 'invalid';
  readonly message: string;
}

const sanitize = (route: string): string => canonicalizeRoute(route);

export const createWorkflowDescriptor = <const TChain extends readonly ConductorPluginDefinition[]>({
  namespace,
  chain,
  route,
  tags = [],
}: {
  readonly namespace: ConductorNamespace;
  readonly chain: NoInfer<TChain>;
  readonly route: string;
  readonly tags?: readonly string[];
}): WorkflowDescriptor<TChain> => {
  const sanitized = sanitize(route);
  const phases = normalizePhases([...new Set(chain.map((entry) => entry.phase))]);
  const routeParts = sanitized
    .split('/')
    .filter((segment): segment is string => segment.length > 0)
    .join(':');
  const workflowId = buildWorkflowId(namespace, `${routeParts}:${chain.length}`);

  return {
    namespace,
    workflowId,
    chain,
    route: sanitized,
    phases,
    tags,
  };
};

export const validateWorkflow = <TChain extends readonly ConductorPluginDefinition[]>(
  descriptor: WorkflowDescriptor<TChain>,
): readonly WorkflowEvent[] => {
  const events: WorkflowEvent[] = [];
  if (descriptor.chain.length === 0) {
    events.push({
      at: new Date().toISOString(),
      type: 'invalid',
      message: 'empty workflow chain',
    });
    return events;
  }

  if (descriptor.route.length === 0) {
    events.push({
      at: new Date().toISOString(),
      type: 'invalid',
      message: 'route is empty',
    });
    return events;
  }

  if (descriptor.namespace.length === 0) {
    events.push({
      at: new Date().toISOString(),
      type: 'invalid',
      message: 'namespace is empty',
    });
    return events;
  }

  events.push({
    at: new Date().toISOString(),
    type: 'validated',
    message: `workflow with ${descriptor.chain.length} plugins is valid`,
  });
  return events;
};

export const normalizePhases = (phases: readonly ConductorPluginPhase[]): ConductorPluginPhase[] => {
  const known = new Set<ConductorPluginPhase>([
    'discover',
    'assess',
    'simulate',
    'actuate',
    'verify',
    'finalize',
  ]);
  const output: ConductorPluginPhase[] = [];
  for (const phase of phases) {
    if (known.has(phase)) {
      output.push(phase);
    }
  }
  return output;
};
