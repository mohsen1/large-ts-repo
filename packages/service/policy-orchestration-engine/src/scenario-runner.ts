import { NoInfer } from '@shared/type-level';
import {
  collectTemplateVariables,
  PolicyScenarioTemplate,
  PolicyTemplateMatch,
  PolicyTemplateRegistry,
  renderTemplate,
  templateToSearchText,
} from '@domain/policy-orchestration';
import { PolicyExecutionWindow, PolicyNode, PolicyPlan } from '@domain/policy-orchestration';
import {
  InMemoryPolicyStore,
  PolicyStoreArtifact,
  PolicyStoreFilters,
  PolicyStoreRunRecord,
} from '@data/policy-orchestration-store';
import { OrchestrationWorkspace, RunRequest, PolicyOrchestrationRunner } from './orchestrator';
import { getPluginCatalog, PolicyEnvelopePlugin, PolicyPluginEnvelope, runPolicyWorkspaceWithPlugins } from './plugin-runner';
import { summarizeStore } from '@data/policy-orchestration-store/analytics';

export interface ScenarioRunInput {
  readonly template: PolicyScenarioTemplate;
  readonly workspace: OrchestrationWorkspace;
  readonly requestedConcurrency: number;
  readonly dryRun: boolean;
}

export interface ScenarioRunOutput {
  readonly runId: string;
  readonly plan: PolicyPlan;
  readonly summary: {
    readonly warnings: number;
    readonly artifactCount: number;
    readonly pluginLogSize: number;
  };
  readonly envelope: PolicyPluginEnvelope | null;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface ScenarioRunContext {
  readonly orchestratorId: string;
  readonly actor: string;
  readonly templateMatch: PolicyTemplateMatch | null;
}

type RuntimeLog = ReadonlyArray<string>;

export interface ScenarioBatchResult {
  readonly runs: readonly ScenarioRunOutput[];
  readonly batchId: string;
  readonly runtime: PolicyStoreRunRecord;
}

const emptyEnvelope = (): PolicyPluginEnvelope => ({
  runId: 'seed-run-id',
  traceId: 'seed-trace-id' as never,
  orchestratorId: 'seed-orchestrator',
  workspace: {
    orchestratorId: 'seed-orchestrator',
    nodes: [],
    windows: [],
    contract: { service: 'seed', entities: [] },
    createdBy: 'seed',
  },
  runOutcomeRunId: 'seed-run-id',
  summary: {
    artifactCount: 0,
    activeArtifactCount: 0,
    successfulRuns: 0,
    metrics: [],
  },
  runSnapshots: [],
  pluginLog: ['seed'],
  runTelemetry: 'seed',
});

const withLog = <T extends RuntimeLog>(log: T): T => log;

const buildRequest = (input: ScenarioRunInput, context: ScenarioRunContext): RunRequest => {
  const contexts: RunRequest['contexts'] = [
    {
      principal: context.actor,
      resource: input.template.name,
      action: input.dryRun ? 'simulate' : 'enforce',
      attributes: {
        template: input.template.id,
        rendered: renderTemplate({ template: input.template, values: {} }),
        variables: collectTemplateVariables(input.template.body),
        matchScore: context.templateMatch?.score ?? 0,
      },
      now: new Date(),
    },
  ];

  return {
    orchestratorId: context.orchestratorId,
    runBy: context.actor,
    dryRun: input.dryRun,
    reason: templateToSearchText(input.template),
    requestedConcurrency: input.requestedConcurrency,
    contexts,
  };
};

const logForRun = (envelope: PolicyPluginEnvelope | null): number => {
  if (!envelope) return 0;
  return envelope.pluginLog.length + envelope.summary.artifactCount;
};

const defaultPolicyWindow: PolicyExecutionWindow = {
  id: 'window:default' as PolicyExecutionWindow['id'],
  start: new Date().toISOString(),
  end: new Date(Date.now() + 60_000).toISOString(),
  timezone: 'UTC',
};

const enrichNodes = (nodes: readonly PolicyNode[]): readonly PolicyNode[] =>
  nodes.length === 0
    ? [{
        id: 'seed-node' as PolicyNode['id'],
        artifact: {
          id: 'seed-artifact' as never,
          name: 'seed',
          description: 'seed artifact',
          owner: 'seed',
          target: { region: 'global', service: 'seed', environment: 'dev', tags: ['seed'] },
          expression: 'true',
          severity: 'low',
          state: 'draft',
          mode: 'linear',
          priority: 'P4',
          windows: [defaultPolicyWindow],
          version: 1,
          revision: 'seed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        dependsOn: [],
        retries: 0,
        timeoutSeconds: 5,
        requiresHumanApproval: false,
        ownerTeam: 'seed',
        slaWindowMinutes: 5,
      } satisfies PolicyNode]
    : nodes;

const normalizeFilters = (orchestratorId: string): PolicyStoreFilters => ({ orchestratorId });

export const runPolicyScenario = async (
  input: NoInfer<ScenarioRunInput>,
  context: ScenarioRunContext,
): Promise<ScenarioRunOutput> => {
  const registry = new PolicyTemplateRegistry([input.template] as const);
  const templateMatch = registry.search({ query: context.actor, phases: [input.template.phase] })[0] ?? null;
  const request = buildRequest(input, context);
  const runner = new PolicyOrchestrationRunner();
  const outcome = await runner.run({ ...input.workspace, nodes: enrichNodes(input.workspace.nodes) }, request);
  await summarizeStore(new InMemoryPolicyStore(), context.orchestratorId);

  let envelope: PolicyPluginEnvelope | null = null;
  try {
    const plugins = getPluginCatalog().filter((item): item is PolicyEnvelopePlugin => {
      return item.consumes.includes('plan') && item.emits.includes('plan');
    });
    envelope = await runPolicyWorkspaceWithPlugins(input.workspace, request, { plugins });
  } catch {
    envelope = emptyEnvelope();
  }

  return {
    runId: outcome.runId,
    plan: outcome.plan,
    summary: {
      warnings: outcome.plan.steps.length,
      artifactCount: outcome.storage.artifacts.length,
      pluginLogSize: logForRun(envelope),
    },
    envelope,
    metrics: {
      warningCount: outcome.storage.plans.length,
      artifactCount: outcome.storage.artifacts.length,
      contextNodes: input.workspace.nodes.length,
    },
  };
};

export const runScenarioBatch = async (
  store: InMemoryPolicyStore,
  templates: readonly PolicyScenarioTemplate[],
  workspace: OrchestrationWorkspace,
  options: { readonly actor: string; readonly orchestratorId: string; readonly dryRun: boolean; readonly concurrency: number },
): Promise<ScenarioBatchResult> => {
  const results: ScenarioRunOutput[] = [];
  const registry = new PolicyTemplateRegistry(templates as readonly PolicyScenarioTemplate[]);

  for (const template of templates) {
    const templateMatch = registry.search({ query: template.name, phases: [template.phase] })[0] ?? null;
    const runInput: ScenarioRunInput = {
      template,
      workspace,
      requestedConcurrency: options.concurrency,
      dryRun: options.dryRun,
    };

    const run = await runPolicyScenario(runInput, {
      orchestratorId: options.orchestratorId,
      actor: options.actor,
      templateMatch,
    });
    results.push(run);
  }

  const runRecord: PolicyStoreRunRecord = {
    id: `${options.orchestratorId}:batch:${Date.now()}` as PolicyStoreRunRecord['id'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    correlationId: `${options.orchestratorId}:batch-correlation`,
    runId: `${options.orchestratorId}:batch` as PolicyStoreRunRecord['runId'],
    planId: `${options.orchestratorId}:batch` as PolicyStoreRunRecord['planId'],
    status: options.dryRun ? 'queued' : 'running',
    actor: options.actor,
    summary: {
      total: results.length,
      warnings: results.length,
    },
    metrics: {
      totalRuns: results.length,
      warnings: results.reduce((acc, entry) => acc + entry.summary.warnings, 0),
      artifacts: results.reduce((acc, entry) => acc + entry.summary.artifactCount, 0),
      logItems: results.reduce((acc, entry) => acc + entry.summary.pluginLogSize, 0),
    },
  };

  await store.recordRun(runRecord);
  const history = await store.searchRuns(options.orchestratorId);
  const runtime = history.find((run) => run.runId === runRecord.runId) ?? runRecord;
  const normalized = {
    ...runtime,
    status: options.dryRun ? 'queued' : runtime.status,
    summary: {
      ...runtime.summary,
      total: runtime.summary?.total ?? results.length,
      warnings: runtime.summary?.warnings ?? results.length,
    },
    metrics: {
      ...runtime.metrics,
      totalRuns: history.length,
      warnings: history.length,
    },
  };

  return {
    runs: results,
    batchId: runRecord.runId,
    runtime: normalized,
  };
};
