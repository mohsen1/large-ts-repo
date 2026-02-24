import {
  ContinuityExecutionManifest,
  ContinuityExecutionTrace,
  ContinuityPolicy,
  ContinuityRunContext,
  ContinuityRunToken,
  ContinuityTemplate,
  ContinuityWorkspace,
  ContinuityPlanInput,
  buildContinuityPlanId,
  buildContinuityTemplateId,
  buildContinuitySessionId,
  buildTemplateTags,
  buildContinuityRunToken,
  toEventChannel,
  mapTemplateRiskBand,
} from './types';
import { evaluatePolicy, validateRun, evaluateBundle } from './policies';
import {
  bootstrapPluginChain,
  ContinuityPluginRegistry,
  scorePluginOutput,
} from './registry';

interface WorkspaceState {
  readonly sessionId: ContinuityRunContext['runId'];
  readonly templateCount: number;
}

type IteratorResultOf<T> = IteratorResult<T, undefined>;

interface NodeEntry {
  readonly nodeId: string;
  readonly nodeIndex: number;
}

const workspaceFallbackPolicy = {
  enforceSla: true,
  minReadiness: 0.2,
  maxParallelism: 1,
  clauses: [{ name: 'fallback', weight: 0.4, windowMinutes: 5 }],
  allowAsyncRollback: true,
} satisfies ContinuityPolicy;

const buildNodeIterator = (template: ContinuityTemplate): Iterator<NodeEntry> => {
  let index = 0;
  return {
    next: (): IteratorResultOf<NodeEntry> => {
      if (index >= template.nodes.length) {
        return { done: true, value: undefined };
      }

      const node = template.nodes[index];
      const value: NodeEntry = {
        nodeId: node?.id ?? `fallback-${index}`,
        nodeIndex: index,
      };
      index += 1;
      return { done: false, value };
    },
  };
};

const iteratorToArray = <T>(iterator: Iterator<T>): readonly T[] => {
  const values: T[] = [];
  let item = iterator.next();
  while (!item.done) {
    values.push(item.value);
    item = iterator.next();
  }
  return values;
};

const buildFallbackTemplate = (workspace: ContinuityWorkspace): ContinuityTemplate => {
  const templateId = buildContinuityTemplateId(workspace.id, Date.now());
  const sessionId = buildContinuitySessionId(workspace.tenant, `${templateId}-session`);
  const planId = buildContinuityPlanId(workspace.tenant, Date.now());
  return {
    id: templateId,
    incidentId: workspace.incidentId,
    incidentPlanId: planId,
    planId,
    tenant: workspace.tenant,
    title: 'continuity-fallback',
    description: 'generated fallback continuity template',
    priorityVector: {
      incidentId: workspace.incidentId,
      severityWeight: 0.5,
      signalWeight: 0.1,
      ageMinutes: 0,
      dependencyPressure: 0,
      tenantLoad: 0,
      compositeScore: 10,
    },
    scope: {
      tenantId: workspace.tenant,
      clusterId: 'cluster-0',
      region: 'us-east-1',
      serviceName: 'continuity-service',
    },
    status: 'ready',
    nodes: [
      {
        id: `${sessionId}:seed`,
        label: 'seed',
        kind: 'seed',
        owner: workspace.tenant,
        command: 'seed',
        expectedLatencyMs: 200,
        dependencies: [],
        tags: ['fallback'],
      },
    ],
    metadata: {
      owner: workspace.tenant,
      windowHint: 'sustained',
      riskBand: 'low',
      generatedAt: new Date().toISOString(),
      tags: ['fallback'],
    },
    policy: workspaceFallbackPolicy,
    tags: ['fallback'],
    route: {
      id: `${sessionId}:route`,
      nodes: [],
      owner: workspace.tenant,
      slaWindowMinutes: 10,
      riskWeight: 1,
      tags: ['fallback'],
    },
    windowHint: 'sustained',
    planRunWindowMinutes: 20,
    sessionId: workspace.id,
    runTokens: [buildContinuityRunToken(String(sessionId), 'seed')],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const workspaceSelector = (workspace: ContinuityWorkspace): readonly ContinuityTemplate[] => {
  const selected = workspace.templates.filter((template) => template.nodes.length > 0);
  return selected.length === 0
    ? [buildFallbackTemplate(workspace)]
    : selected;
};

const stateTemplateSummary = (state: WorkspaceState): readonly string[] => [
  `state=${state.sessionId}`,
  `templates=${state.templateCount}`,
  `phase=${state.templateCount === 0 ? 'empty' : 'active'}`,
];

export class ContinuityEngine {
  private readonly registryPromise: Promise<ContinuityPluginRegistry>;

  constructor(private readonly workspace: ContinuityWorkspace) {
    this.registryPromise = bootstrapPluginChain();
  }

  async planWorkflows(input: ContinuityPlanInput): Promise<readonly ContinuityExecutionManifest[]> {
    const registry = await this.registryPromise;
    const selected = workspaceSelector(this.workspace);
    const manifests = await Promise.all(
      selected.map((template) => this.planTemplate(template, input, registry)),
    );
    return manifests.sort((left, right) => {
      const rightLatest = right.trace.windows.at(-1)?.startedAt ?? right.trace.events.at(-1) ?? '';
      const leftLatest = left.trace.windows.at(-1)?.startedAt ?? left.trace.events.at(-1) ?? '';
      return new Date(rightLatest).getTime() - new Date(leftLatest).getTime();
    });
  }

  private async planTemplate(
    template: ContinuityTemplate,
    input: ContinuityPlanInput,
    registry: ContinuityPluginRegistry,
  ): Promise<ContinuityExecutionManifest> {
    const runToken = buildContinuityRunToken(template.id, String(input.planId));
    const context: ContinuityRunContext = {
      runId: runToken,
      templateId: template.id,
      tenant: template.tenant,
      eventChannel: toEventChannel(template.tenant, template.windowHint),
      tags: buildTemplateTags(template),
    };

    const state: WorkspaceState = {
      sessionId: runToken,
      templateCount: template.nodes.length,
    };

    const anomaly = await registry.runAnomalyChain(template);
    const safety = await registry.runPolicyChain(template, runToken);
    const budget = await registry.runBudgetChain(template);

    const policySummary = [
      ...anomaly.map((entry) => ({
        allowed: entry.allowed,
        score: entry.score,
        reasons: [...entry.reasons],
        riskBand: 'low' as const,
      })),
      ...safety.map((entry) => ({
        allowed: !!entry,
        score: 1,
        reasons: ['safety'],
        riskBand: mapTemplateRiskBand(template),
      })),
      ...budget.map((entry) => ({
        allowed: entry.ok,
        score: entry.ok ? 1 : 0,
        reasons: [entry.templateId],
        riskBand: mapTemplateRiskBand(template),
      })),
      ...evaluateBundle([template], context),
    ];

    const trace = await this.simulateTemplate(template, runToken, policySummary, context);

    const status = policySummary.every((entry) => entry.allowed) ? 'running' : 'queued';

    return {
      sessionId: this.workspace.id,
      planId: input.planId,
      trace,
      status,
      policySummary,
    };
  }

  private async simulateTemplate(
    template: ContinuityTemplate,
    runToken: ContinuityRunToken,
    policySummary: readonly ReturnType<typeof evaluatePolicy>[],
    context: ContinuityRunContext,
  ): Promise<ContinuityExecutionTrace> {
    const nodeIterator = buildNodeIterator(template);
    const ordered = iteratorToArray(nodeIterator);

    await using scope = new AsyncDisposableStack();
    scope.defer(async () => {
      void context.runId;
    });

    const policyScores = policySummary.map((entry) => entry.score);
    const windows = ordered.map((entry, index) => {
      const startedAt = new Date(Date.now() + index * 120).toISOString();
      const endedAt = new Date(Date.now() + index * 120 + (template.nodes[entry.nodeIndex]?.expectedLatencyMs ?? 0)).toISOString();
      const reasons = policySummary[index % Math.max(policySummary.length, 1)]?.reasons ?? [];
      const score = policySummary[index % Math.max(policySummary.length, 1)]?.score ?? 0;
      return {
        startedAt,
        endedAt,
        runs: [
          {
            nodeId: entry.nodeId,
            output: {
              template: String(template.id),
              index,
              reasons: [...reasons],
            },
            success: score > 0.5,
            diagnostics: ['simulated', ...reasons],
          },
        ],
        signal: scorePluginOutput([score]),
      };
    });

    const validate = validateRun(context, {
      nodeId: ordered[0]?.nodeId ?? 'seed',
      output: {
        template: String(template.id),
        score: scorePluginOutput(policyScores),
      },
      success: windows.every((window) => window.runs.length > 0),
      diagnostics: ['sim-window'],
    });

    void validate;

    return {
      sessionId: template.sessionId,
      runToken,
      events: [
        `template=${template.id}`,
        ...template.nodes.map((node) => node.id),
        ...ordered.map((entry) => entry.nodeId),
        ...stateTemplateSummary({ sessionId: runToken, templateCount: template.nodes.length }),
      ],
      windows,
    };
  }
}

export const describeWorkspace = (workspace: ContinuityWorkspace): string => {
  const risks = workspace.templates.map((template) => mapTemplateRiskBand(template));
  return `${workspace.id}::${workspace.tenant}::${risks.join(',')}`;
};
