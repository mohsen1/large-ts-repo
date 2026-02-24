import { withBrand } from '@shared/core';
import type { Branded, PolicyTag } from '@shared/orchestration-kernel';
import { chain } from '@shared/orchestration-kernel';

export type DomainPhase = 'discover' | 'stabilize' | 'mitigate' | 'validate' | 'document';
export type DomainSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DomainStatus = 'pending' | 'active' | 'suppressed' | 'complete';
export type MetricKind = 'slo' | 'capacity' | 'compliance' | 'security';

export type TenantId = Branded<string, 'TenantId'>;
export type WorkspaceId = Branded<string, 'WorkspaceId'>;
export type ScenarioId = Branded<string, 'ScenarioId'>;
export type CommandId = Branded<string, 'CommandId'>;
export type LinkToken = Branded<string, 'LinkToken'>;

export interface ScenarioMeta {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scenarioId: ScenarioId;
  readonly origin: string;
  readonly labels: Record<string, string>;
}

export interface StageEdge {
  readonly from: string;
  readonly to: string;
  readonly latencyMs: number;
}

export interface StageNode {
  readonly id: string;
  readonly title: string;
  readonly phase: DomainPhase;
  readonly severity: DomainSeverity;
  readonly status: DomainStatus;
  readonly metrics: Readonly<Record<MetricKind, number>>;
  readonly prerequisites: readonly string[];
}

export interface PolicyDirective {
  readonly code: PolicyTag;
  readonly command: string;
  readonly scope: string;
  readonly requiredCapabilities: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RecoveryScenarioTemplate<
  TPhases extends readonly DomainPhase[] = readonly DomainPhase[],
  TTags extends readonly string[] = readonly string[],
> {
  readonly phases: TPhases;
  readonly tags: TTags;
  readonly policy: PolicyDirective;
}

export interface RecoveryRunbook {
  readonly tenant: TenantId;
  readonly workspace: WorkspaceId;
  readonly scenarioId: ScenarioId;
  readonly title: string;
  readonly nodes: readonly StageNode[];
  readonly edges: readonly StageEdge[];
  readonly directives: readonly PolicyDirective[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecoveryRun {
  readonly runId: CommandId;
  readonly scenario: ScenarioId;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly status: DomainStatus;
  readonly observedNodes: readonly string[];
  readonly commandCount: number;
}

export interface ScenarioProjection {
  readonly key: `tenant/${TenantId}/${string}`;
  readonly active: number;
  readonly failed: number;
  readonly complete: number;
}

export interface ScenarioEnvelope {
  readonly id: LinkToken;
  readonly scenario: ScenarioMeta;
  readonly runbook: RecoveryRunbook;
  readonly run?: RecoveryRun;
}

export type PathString<T extends string> = T | `${T}/${string}`;
export type RecursivePathList<T extends string> = T extends `${infer Head}/${infer Rest}`
  ? readonly [Head, ...RecursivePathList<Rest>]
  : readonly [T];

export type PolicyTemplateUnion<
  TTemplate extends RecoveryScenarioTemplate<readonly DomainPhase[], readonly string[]>,
> = TTemplate['tags'][number];

export const makeTenantId = (raw: string): TenantId => withBrand(raw, 'TenantId');
export const makeWorkspaceId = (raw: string): WorkspaceId => withBrand(raw, 'WorkspaceId');
export const makeScenarioId = (tenant: TenantId, value: string): ScenarioId =>
  withBrand(`${tenant}.${value}`, 'ScenarioId');
export const makeCommandId = (runbook: ScenarioId, index: number): CommandId =>
  withBrand(`${runbook}:${index}`, 'CommandId');

export const flattenPhases = <TPhases extends readonly DomainPhase[]>(phases: TPhases): string => phases.join('>');

export const uniqueDirectives = (scenario: RecoveryRunbook): readonly PolicyDirective[] => {
  const entries = new Map<string, PolicyDirective>();
  for (const directive of scenario.directives) {
    entries.set(directive.code, directive);
  }
  return [...entries.values()];
};

export const scenarioToLines = <T extends StageNode[]>(nodes: T): readonly string[] =>
  chain(nodes)
    .map((node) => `${node.id}:${node.phase}:${node.status}`)
    .toArray();
