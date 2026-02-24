import { NoInfer } from '@shared/type-level';
import {
  PolicyTemplateRegistry,
  PolicyScenarioTemplate,
  PolicyTemplateMatch,
  renderTemplate,
} from '@domain/policy-orchestration';
import { InMemoryPolicyStore, PolicyStoreArtifact, PolicyStoreRunRecord } from '@data/policy-orchestration-store';
import { PolicyEventEnvelope, collectStoreEvents } from '@data/policy-orchestration-store/stream-analytics';

export interface RegistryPlanRecord {
  readonly templateId: PolicyTemplateMatch['templateId'];
  readonly template: PolicyScenarioTemplate;
  readonly score: number;
}

export interface RegistryAdapterState {
  readonly totalTemplates: number;
  readonly totalEvents: number;
  readonly lastRender: string;
  readonly matches: readonly PolicyTemplateMatch[];
}

export interface RegistryAdapterResult {
  readonly template: PolicyScenarioTemplate;
  readonly events: readonly PolicyEventEnvelope[];
  readonly metadata: Readonly<Record<string, string>>;
}

const eventWindowMs = 60_000;

export class PolicyTemplateAdapter {
  #registry: PolicyTemplateRegistry<readonly PolicyScenarioTemplate[]>;
  #store: InMemoryPolicyStore;

  public constructor(store: InMemoryPolicyStore, templates: readonly PolicyScenarioTemplate[]) {
    this.#store = store;
    this.#registry = new PolicyTemplateRegistry(templates as readonly PolicyScenarioTemplate[]);
  }

  public get size(): number {
    return this.#registry.size;
  }

  public listMatches(query: string): readonly RegistryPlanRecord[] {
    const matches = this.#registry.search({ query });
    const templateById = new Map<string, PolicyTemplateMatch>();
    for (const match of matches) {
      templateById.set(match.templateId, match);
    }

    return matches
      .map((match) => {
        const template = this.#registry.get(match.templateId) as PolicyScenarioTemplate | undefined;
        if (!template) return undefined;
        return {
          templateId: match.templateId,
          template,
          score: match.score,
        };
      })
      .filter((entry): entry is RegistryPlanRecord => entry !== undefined);
  }

  public async collectByOrchestrator(orchestratorId: string): Promise<readonly PolicyEventEnvelope[]> {
    const events: PolicyEventEnvelope[] = [];
    for await (const event of collectStoreEvents(this.#store, { orchestratorId })) {
      events.push(event);
    }
    return events;
  }

  public async adaptRun(
    run: PolicyStoreRunRecord,
    templates: readonly PolicyScenarioTemplate[],
  ): Promise<readonly RegistryAdapterResult[]> {
    const matches = this.#registry.search({ query: run.actor, phases: [] });
    const events = await this.collectByOrchestrator(run.actor);
    const byTemplate = templates.length === 0 ? await this.collectTemplates() : templates;

    return byTemplate.map((template, index) => {
      const score = matches[index % Math.max(1, matches.length)]?.score ?? 0;
      return {
        template,
        events: events.slice(0, 1),
        metadata: {
          runType: run.status,
          score: String(score),
          summary: JSON.stringify(run.summary ?? {}),
        },
      };
    });
  }

  private async collectTemplates(): Promise<readonly PolicyScenarioTemplate[]> {
    const workspace = await this.collectByOrchestrator('default');
    const names = new Set(workspace.map((entry) => entry.artifactId.split(':')[0]));
    return this.#registry.list({ query: '', phases: [] }).map((template, index) => ({
      ...template,
      defaults: {
        ...template.defaults,
        orchestrator: [...names][index] ?? 'default',
      },
    }));
  }

  public async inspect(): Promise<RegistryAdapterState> {
    const events = await this.collectByOrchestrator('default');
    const templateList = this.listMatches('');
    const latest = templateList
      .map((entry) =>
        renderTemplate({
          template: entry.template,
          values: entry.template.defaults as NoInfer<Record<string, never>>,
        }),
      )
      .at(0) ?? '';

    return {
      totalTemplates: templateList.length,
      totalEvents: events.length,
      lastRender: latest,
      matches: this.listMatches('default'),
    };
  }

  public collectTemplatePayloadTemplates(artifacts: readonly PolicyStoreArtifact[]): readonly string[] {
    const payloads = artifacts.map((artifact) => `${artifact.namespace}:${artifact.artifactId}:${artifact.state}`);
    return [...new Set(payloads)]
      .slice(0, eventWindowMs / 1000)
      .sort((left, right) => left.localeCompare(right));
  }
}
