import { Brand, withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';

export type PolicyTemplateId = Brand<string, 'PolicyTemplateId'>;
export type PolicyTemplateName = Brand<string, 'PolicyTemplateName'>;
export type PolicyTemplateToken = string | number | boolean | null;
export type ScenarioPhase = 'discover' | 'simulate' | 'enforce' | 'rollback';

const TEMPLATE_VARIABLE = /\{\{\s*([^}]+)\s*\}\}/g;
const normalize = (value: string): string => value.trim().toLowerCase();

export interface PolicyScenarioTemplate<TPattern extends string = string> {
  readonly id: PolicyTemplateId;
  readonly name: PolicyTemplateName;
  readonly phase: ScenarioPhase;
  readonly body: TPattern;
  readonly context: Record<string, unknown>;
  readonly variables: readonly string[];
  readonly defaults: Partial<Record<string, PolicyTemplateToken>>;
}

export interface PolicyTemplateSearchInput {
  readonly query: string;
  readonly phases?: readonly ScenarioPhase[];
  readonly limit?: number;
}

export interface PolicyTemplateMatch {
  readonly templateId: PolicyTemplateId;
  readonly score: number;
}

export interface VariableRenderInput<TPattern extends string> {
  readonly template: PolicyScenarioTemplate<TPattern>;
  readonly values: NoInfer<Partial<Record<string, PolicyTemplateToken>>>;
}

export const collectTemplateVariables = (body: string): readonly string[] =>
  [...new Set(Array.from(body.matchAll(TEMPLATE_VARIABLE), (entry) => normalize(entry[1] ?? '')))];

export const renderTemplate = <TPattern extends string>({
  template,
  values,
}: VariableRenderInput<TPattern>): string =>
  template.body.replace(TEMPLATE_VARIABLE, (_match, token: string) => {
    const normalized = normalize(token);
    const key = Object.keys(values).find((entry) => normalize(entry) === normalized);
    const direct = key ? values[key] : undefined;
    if (direct !== undefined) return `${direct}`;
    const fallback = template.defaults[normalized];
    return fallback === undefined || fallback === null ? _match : `${fallback}`;
  });

export class PolicyTemplateRegistry<TTemplates extends readonly PolicyScenarioTemplate[]> {
  #entries = new Map<PolicyTemplateId, PolicyScenarioTemplate>();

  public constructor(templates: TTemplates) {
    for (const template of templates) {
      this.#entries.set(template.id, template);
    }
  }

  public get size(): number {
    return this.#entries.size;
  }

  public get(templateId: PolicyTemplateId): PolicyScenarioTemplate | undefined {
    return this.#entries.get(templateId);
  }

  public list(input: PolicyTemplateSearchInput): readonly PolicyScenarioTemplate[] {
    const target = normalize(input.query);
    return [...this.#entries.values()].filter((template) => {
      const haystack = normalize(`${template.id} ${template.name} ${template.phase}`);
      if (target.length > 0 && !haystack.includes(target)) return false;
      if (input.phases?.length && !input.phases.includes(template.phase)) return false;
      return true;
    });
  }

  public search(input: PolicyTemplateSearchInput): readonly PolicyTemplateMatch[] {
    return this.list(input).map((template) => ({
      templateId: template.id,
      score: template.variables.length + (normalize(template.body).includes(normalize(input.query)) ? 1 : 0),
    }));
  }

  public register(template: PolicyScenarioTemplate): void {
    this.#entries.set(template.id, template);
  }

  public unregister(templateId: PolicyTemplateId): boolean {
    return this.#entries.delete(templateId);
  }

  public *stream(): IterableIterator<PolicyScenarioTemplate> {
    yield* this.#entries.values();
  }

  public [Symbol.dispose](): void {
    this.#entries.clear();
  }
}

export const templateToSearchText = (template: Pick<PolicyScenarioTemplate, 'name' | 'variables' | 'body'>): string =>
  `${template.name} ${template.variables.join(' ')} ${template.body}`;

export const createTemplateIdentity = (value: string): PolicyTemplateId => withBrand(value, 'PolicyTemplateId');
export const createTemplateName = (value: string): PolicyTemplateName => withBrand(value, 'PolicyTemplateName');

type DiscoverTemplate = 'Discover {{domain}} in {{environment}} for {{service}}';
type SimulateTemplate = 'Simulate {{scenario}} with concurrency {{concurrency}} and horizon {{window}}';
type SeedTemplate = DiscoverTemplate | SimulateTemplate;

export const seedTemplateRegistry = [
  {
    id: createTemplateIdentity('template:discover:default'),
    name: createTemplateName('default-discovery'),
    phase: 'discover' as const,
    body: 'Discover {{domain}} in {{environment}} for {{service}}' as DiscoverTemplate,
    context: { domain: 'recovery', environment: 'prod', service: 'policy-runtime' },
    variables: collectTemplateVariables('Discover {{domain}} in {{environment}} for {{service}}'),
    defaults: {
      domain: 'recovery',
      environment: 'prod',
      service: 'policy-runtime',
    },
  },
  {
    id: createTemplateIdentity('template:simulate:baseline'),
    name: createTemplateName('baseline-simulation'),
    phase: 'simulate' as const,
    body: 'Simulate {{scenario}} with concurrency {{concurrency}} and horizon {{window}}' as SimulateTemplate,
    context: { scenario: 'policy', concurrency: 4, window: 'PT15M' },
    variables: collectTemplateVariables('Simulate {{scenario}} with concurrency {{concurrency}} and horizon {{window}}'),
    defaults: {
      scenario: 'policy',
      concurrency: 4,
      window: 'PT15M',
    },
  },
] as const satisfies readonly PolicyScenarioTemplate<SeedTemplate>[];

export const policyTemplateRegistry = new PolicyTemplateRegistry(seedTemplateRegistry);
