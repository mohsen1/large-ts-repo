import {
  PolicyExecutionWindow,
  PolicyNode,
  PolicyScenarioTemplate,
  OrchestrationNodeId,
  PolicyTemplateMatch,
  PolicyTemplateRegistry,
  collectTemplateVariables,
  createTemplateIdentity,
  createTemplateName,
  renderTemplate,
  templateToSearchText,
} from '@domain/policy-orchestration';
import { InMemoryPolicyStore, PolicyStoreArtifact, PolicyStoreFilters, PolicyStoreSort, PolicyStoreRunRecord } from '@data/policy-orchestration-store';
import { collectRunHealth } from '@data/policy-orchestration-store/analytics';
import { collectStoreTelemetry, windowRunEvents } from '@data/policy-orchestration-store/stream-analytics';
import { ClauseFilter, collectArtifactsByWindow } from '@data/policy-orchestration-store/lifecycle-queries';
import { runScenarioBatch } from './scenario-runner';
import { OrchestrationWorkspace } from './orchestrator';

const defaultTemplates: readonly PolicyScenarioTemplate[] = [
  {
    id: createTemplateIdentity('template:bootstrap'),
    name: createTemplateName('bootstrap-template'),
    phase: 'discover',
    body: 'bootstrap {{service}} for {{environment}}',
    context: {
      service: 'policy-runtime',
      environment: 'prod',
    },
    variables: ['service', 'environment'],
    defaults: {
      service: 'policy-runtime',
      environment: 'prod',
    },
  },
  {
    id: createTemplateIdentity('template:baseline'),
    name: createTemplateName('baseline-simulation'),
    phase: 'simulate',
    body: 'simulate {{scenario}} with concurrency {{concurrency}}',
    context: {
      scenario: 'policy',
      concurrency: 4,
    },
    variables: ['scenario', 'concurrency'],
    defaults: {
      scenario: 'policy',
      concurrency: 4,
    },
  },
];

export interface PolicyPolicyArtifact {
  readonly title: string;
  readonly value: number;
}

const toArtifactNode = (artifact: PolicyStoreArtifact, index: number): PolicyNode => ({
  id: `node:${artifact.id}` as OrchestrationNodeId,
  artifact: {
    id: artifact.artifactId as PolicyNode['artifact']['id'],
    name: artifact.name,
    description: templateToSearchText({
      name: artifact.name,
      variables: artifact.namespace.split('-'),
      body: artifact.name,
    } as never),
    owner: artifact.namespace,
    target: {
      region: 'global',
      service: artifact.namespace,
      environment: 'prod',
      tags: ['lab'],
    },
    expression: String(artifact.payload['expression'] ?? ''),
    severity: 'low',
    state: 'draft',
    mode: 'linear',
    priority: 'P4',
    windows: [
      {
        id: `window:${artifact.id}` as PolicyExecutionWindow['id'],
        start: artifact.createdAt,
        end: artifact.updatedAt,
        timezone: 'UTC',
      },
    ],
    version: 1,
    revision: `${artifact.revision}`,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  },
  dependsOn: index === 0 ? [] : [`node:${artifact.id}:${Math.max(0, index - 1)}` as OrchestrationNodeId],
  retries: 0,
  timeoutSeconds: 5,
  requiresHumanApproval: false,
  ownerTeam: artifact.namespace,
  slaWindowMinutes: 30,
});

const buildWorkspaceFromRun = async (
  store: InMemoryPolicyStore,
  orchestratorId: string,
): Promise<OrchestrationWorkspace> => {
  const artifacts = await store.searchArtifacts({ orchestratorId }, { key: 'updatedAt', order: 'desc' } as PolicyStoreSort);
  const nodes = artifacts.map((artifact, index) => toArtifactNode(artifact, index));
  return {
    orchestratorId,
    contract: {
      service: orchestratorId,
      entities: [
        {
          name: orchestratorId,
          fields: [
            { name: 'id', type: 'string', required: true },
            { name: 'name', type: 'string', required: true },
          ],
        },
      ],
    },
    nodes,
    windows: artifacts.flatMap((artifact) =>
      artifact.payload ? [] : [
        {
          id: `window:${artifact.id}` as PolicyExecutionWindow['id'],
          start: artifact.createdAt,
          end: artifact.updatedAt,
          timezone: 'UTC',
        },
      ],
    ),
    createdBy: 'lab-orchestrator',
  };
};

export interface LabStatus {
  readonly orchestratorId: string;
  readonly status: 'idle' | 'warming' | 'running' | 'degraded' | 'failed';
  readonly activeRuns: number;
  readonly lastSeenRunId?: string;
}

export interface LabTemplateSummary {
  readonly template: PolicyScenarioTemplate;
  readonly variables: readonly string[];
  readonly rendered: string;
  readonly match: PolicyTemplateMatch | null;
}

export class PolicyLabOrchestrator {
  #templates: PolicyScenarioTemplate[] = [...defaultTemplates];
  #store: InMemoryPolicyStore;
  #orchestratorId: string;

  public constructor(store: InMemoryPolicyStore, orchestratorId: string) {
    this.#store = store;
    this.#orchestratorId = orchestratorId;
  }

  public async refreshTemplates(): Promise<readonly PolicyScenarioTemplate[]> {
    this.#templates = [...this.#templates, ...defaultTemplates];
    return this.#templates;
  }

  public async listTemplateSummaries(query = ''): Promise<readonly LabTemplateSummary[]> {
    const registry = new PolicyTemplateRegistry(this.#templates);
    const matches = new Map<string, PolicyTemplateMatch>();
    for (const match of registry.search({ query })) {
      matches.set(match.templateId, match);
    }

    return registry.list({ query }).map((template) => ({
      template,
      variables: collectTemplateVariables(template.body),
      rendered: renderTemplate({ template, values: template.defaults }),
      match: matches.get(template.id) ?? null,
    }));
  }

  public async executeScenarioBatch(
    templateIds: readonly string[],
    dryRun: boolean,
    actor: string,
  ): Promise<readonly string[]> {
    const workspace = await buildWorkspaceFromRun(this.#store, this.#orchestratorId);
    const registry = new PolicyTemplateRegistry(this.#templates);
    const selected = templateIds.length === 0
      ? registry.list({ query: '' })
      : templateIds
        .map((templateId) => this.#templates.find((template) => template.id === templateId))
        .filter((template): template is PolicyScenarioTemplate => template !== undefined);

    const batch = await runScenarioBatch(this.#store, selected, workspace, {
      actor,
      orchestratorId: this.#orchestratorId,
      dryRun,
      concurrency: 2,
    });
    return batch.runs.map((run) => run.runId);
  }

  public async getStatus(): Promise<LabStatus> {
    const runs = await this.#store.searchRuns(this.#orchestratorId);
    const summary = collectRunHealth(runs);
    return {
      orchestratorId: this.#orchestratorId,
      status: runs.length === 0 ? 'idle' : runs.some((run) => run.status === 'running') ? 'running' : 'idle',
      activeRuns: summary.totalRuns,
      lastSeenRunId: runs.at(0)?.runId,
    };
  }

  public async inspectTelemetry(): Promise<readonly PolicyPolicyArtifact[]> {
    const summary = await collectStoreTelemetry(this.#store, this.#orchestratorId);
    const windows = windowRunEvents(await this.#store.searchRuns(this.#orchestratorId), 60_000);
    return [
      {
        title: `artifacts:${summary.summary.totalArtifacts}`,
        value: summary.summary.activeRatio,
      },
      {
        title: `runs:${summary.summary.totalRuns}`,
        value: windows.length,
      },
      {
        title: 'degradedRatio',
        value: summary.summary.activeRatio * 100,
      },
    ];
  }

  public async queryWindows() {
    const filters: PolicyStoreFilters = { orchestratorId: this.#orchestratorId };
    const sort: PolicyStoreSort = { key: 'updatedAt', order: 'desc' };
    const query = {
      clauses: [] as readonly ClauseFilter<PolicyStoreArtifact>[],
      limit: 5,
      cursor: '0',
    };
    const artifacts = await collectArtifactsByWindow(this.#store, filters, sort, query);
    const runs = await this.#store.searchRuns(this.#orchestratorId);
    return {
      artifacts,
      windows: runs.slice(0, query.limit).map((run) => run.updatedAt),
      count: runs.length,
    };
  }
}
