import { withBrand, type Brand } from '@shared/core';
import type { JsonValue, NoInfer } from '@shared/type-level';
import type {
  IncidentId,
  IncidentPlanId,
  IncidentPriorityVector,
  IncidentRecord,
  IncidentScope,
} from '@domain/recovery-incident-orchestration';
import type { WorkflowTemplateId, WorkflowTemplate } from '../types';

export const continuityNodeKinds = ['seed', 'analyze', 'prepare', 'execute', 'verify', 'close'] as const;
export const continuityRiskBands = ['low', 'medium', 'high', 'critical'] as const;
export const continuityWindowHints = ['micro', 'burst', 'gradual', 'sustained'] as const;

export type ContinuityNodeKind = (typeof continuityNodeKinds)[number];
export type ContinuityRiskBand = (typeof continuityRiskBands)[number];
export type ContinuityWindowHint = (typeof continuityWindowHints)[number];

export type ContinuityTemplateId = WorkflowTemplateId;
export type ContinuityPlanId = IncidentPlanId;
export type ContinuitySessionId = Brand<string, 'ContinuitySessionId'>;
export type ContinuityRunToken = Brand<string, 'ContinuityRunToken'>;

export type EventName<T extends string> = `continuity:${T}`;
export type EventChannel<T extends string = string> = `tenant:${T}.${ContinuityWindowHint}`;

export type ContinuityTemplateStatus = 'draft' | 'ready' | 'active' | 'running' | 'failed';

export type VariadicTuple<T extends readonly unknown[], U> = [...T, U];
export type PrependTuple<T extends readonly unknown[], U> = [U, ...T];

export type Tail<T extends readonly unknown[]> = T extends readonly [any, ...infer Rest] ? Rest : [];
export type LastOf<T extends readonly unknown[]> = T extends readonly [...infer _, infer Last] ? Last : never;

export type ReverseTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? [...ReverseTuple<Rest & readonly unknown[]>, Head]
  : [];

export type UnionToTuple<T, Out extends readonly unknown[] = []> =
  [T] extends [never]
    ? Out
    : T extends Out[number]
      ? Out
      : UnionToTuple<Exclude<T, Out[number]>, [...Out, T]>;

export type BuildPolicySummary = {
  readonly allowed: boolean;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly riskBand: ContinuityRiskBand;
};

export type PolicyOutputRemap<T extends object> = {
  [K in keyof T as K extends string
    ? `policy.${Lowercase<K>}`
    : never]: T[K];
};

export interface ContinuityTemplateMetadata {
  readonly owner: string;
  readonly windowHint: ContinuityWindowHint;
  readonly riskBand: ContinuityRiskBand;
  readonly generatedAt: string;
  readonly tags: readonly string[];
}

export interface ContinuityPolicy {
  readonly enforceSla: boolean;
  readonly minReadiness: number;
  readonly maxParallelism: number;
  readonly clauses: readonly ContinuityPolicyClause[];
  readonly allowAsyncRollback: boolean;
}

export interface ContinuityPolicyClause {
  readonly name: string;
  readonly weight: number;
  readonly windowMinutes: number;
}

export interface ContinuityNode {
  readonly id: string;
  readonly label: string;
  readonly kind: ContinuityNodeKind;
  readonly owner: string;
  readonly command: string;
  readonly expectedLatencyMs: number;
  readonly dependencies: readonly string[];
  readonly tags: readonly string[];
}

export interface ContinuityRouteNode {
  readonly id: string;
  readonly prerequisiteId: string;
  readonly timeoutMinutes: number;
  readonly retryable: boolean;
}

export interface ContinuityTemplateRoute {
  readonly id: string;
  readonly nodes: readonly ContinuityRouteNode[];
  readonly owner: string;
  readonly slaWindowMinutes: number;
  readonly riskWeight: number;
  readonly tags: readonly string[];
}

export interface ContinuityTemplate {
  readonly id: ContinuityTemplateId;
  readonly incidentId: IncidentId;
  readonly incidentPlanId: IncidentPlanId;
  readonly planId: ContinuityPlanId;
  readonly tenant: string;
  readonly title: string;
  readonly description: string;
  readonly priorityVector: IncidentPriorityVector;
  readonly scope: IncidentScope;
  readonly status: ContinuityTemplateStatus;
  readonly nodes: readonly ContinuityNode[];
  readonly metadata: ContinuityTemplateMetadata;
  readonly policy: ContinuityPolicy;
  readonly tags: readonly string[];
  readonly route: ContinuityTemplateRoute;
  readonly windowHint: ContinuityWindowHint;
  readonly planRunWindowMinutes: number;
  readonly sessionId: ContinuitySessionId;
  readonly runTokens: readonly ContinuityRunToken[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContinuityWorkspace {
  readonly id: ContinuitySessionId;
  readonly tenant: string;
  readonly incidentId: IncidentId;
  readonly templates: readonly ContinuityTemplate[];
  readonly labels: Readonly<Record<string, string>>;
  readonly riskBand: ContinuityRiskBand;
}

export interface ContinuityRunContext {
  readonly runId: ContinuityRunToken;
  readonly templateId: ContinuityTemplateId;
  readonly tenant: string;
  readonly eventChannel: EventChannel<string>;
  readonly tags: readonly string[];
}

export interface ContinuityRunResult {
  readonly nodeId: string;
  readonly output: JsonValue;
  readonly success: boolean;
  readonly diagnostics: readonly string[];
}

export interface ContinuityExecutionWindow {
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly runs: readonly ContinuityRunResult[];
  readonly signal: number;
}

export interface ContinuityExecutionTrace {
  readonly sessionId: ContinuitySessionId;
  readonly runToken: ContinuityRunToken;
  readonly events: readonly string[];
  readonly windows: readonly ContinuityExecutionWindow[];
}

export interface ContinuitySummary {
  readonly sessionId: ContinuitySessionId;
  readonly score: number;
  readonly status: 'queued' | 'running' | 'complete' | 'failed';
  readonly policy: ContinuityPolicy;
  readonly tags: readonly string[];
}

export interface ContinuityExecutionManifest {
  readonly sessionId: ContinuitySessionId;
  readonly planId: ContinuityPlanId;
  readonly trace: ContinuityExecutionTrace;
  readonly status: ContinuitySummary['status'];
  readonly policySummary: readonly BuildPolicySummary[];
}

export interface ContinuityPlanInput<T extends ContinuityTemplate = ContinuityTemplate> {
  readonly planId: T['planId'];
  readonly incidentId: T['incidentId'];
  readonly tenant: T['tenant'];
  readonly context: ContinuityRunContext;
}

export type NamespaceMap<T> = {
  [K in keyof T as `continuity.${Extract<K & string, string>}`]: T[K];
};

export const buildContinuitySessionId = (tenant: string, token: string): ContinuitySessionId =>
  withBrand(`${tenant}:session-${token}`, 'ContinuitySessionId');

export const buildContinuityTemplateId = (templateId: string, index: number): ContinuityTemplateId =>
  withBrand(`${templateId}:tpl-${index}`, 'WorkflowTemplateId');

export const buildContinuityPlanId = (tenant: string, token: number): ContinuityPlanId =>
  withBrand(`${tenant}:plan-${token}`, 'IncidentPlanId');

export const buildContinuityRunToken = (templateId: string, nodeId: string): ContinuityRunToken =>
  withBrand(`${templateId}:${nodeId}:${Date.now()}`, 'ContinuityRunToken');

export const toEventChannel = (tenant: string, hint: ContinuityWindowHint): EventChannel<string> =>
  `tenant:${tenant}.${hint}`;

export const inferWindowHint = (value: number): ContinuityWindowHint => {
  if (value >= 95) return 'micro';
  if (value >= 70) return 'burst';
  if (value >= 40) return 'gradual';
  return 'sustained';
};

export const buildWindowHint = (severity: string): ContinuityWindowHint => {
  const lowered = severity.toLowerCase();
  return lowered.includes('critical') || lowered.includes('extreme')
    ? 'micro'
    : lowered.includes('high')
      ? 'burst'
      : lowered.includes('medium')
        ? 'gradual'
        : 'sustained';
};

type TemplateTagSource = string | readonly string[] | IncidentRecord | Pick<IncidentRecord, 'scope'> | Pick<ContinuityTemplateMetadata, 'tags'>;

const hasScope = (value: TemplateTagSource): value is IncidentRecord | Pick<IncidentRecord, 'scope'> =>
  typeof value === 'object' && value !== null && 'scope' in value;

const hasTags = (value: TemplateTagSource): value is Pick<ContinuityTemplateMetadata, 'tags'> =>
  typeof value === 'object' && value !== null && 'tags' in value;

export const buildTemplateTags = (source: TemplateTagSource): readonly string[] => {
  if (typeof source === 'string') {
    return [source];
  }
  if (Array.isArray(source)) {
    return [...new Set(source)];
  }
  if (hasTags(source)) {
    return [...source.tags];
  }
  const seed = hasScope(source)
    ? [source.scope.tenantId, source.scope.clusterId, source.scope.serviceName]
    : [];
  return [...new Set([...seed, 'continuity', inferWindowHint(seed.length * 10)])];
};

export const asContinuityWorkspace = <T extends readonly ContinuityTemplate[]>(
  tenant: string,
  incidentId: IncidentId,
  ...templates: VariadicTuple<T, ContinuityTemplate>
): ContinuityWorkspace => ({
  id: buildContinuitySessionId(tenant, `${Date.now()}`),
  tenant,
  incidentId,
  templates,
  labels: {
    tenant,
    templateCount: String(templates.length),
    namespace: 'continuity-lab',
  },
  riskBand: templates[0]?.metadata.riskBand ?? 'low',
});

export const mapTemplateRiskBand = <T extends ContinuityTemplate>(template: T): ContinuityRiskBand => {
  const riskSeed = template.priorityVector.compositeScore + template.nodes.length * 10;
  if (riskSeed >= 120) {
    return 'critical';
  }
  if (riskSeed >= 90) {
    return 'high';
  }
  if (riskSeed >= 45) {
    return 'medium';
  }
  return 'low';
};

export const foldTemplatesByTag = <T extends readonly ContinuityTemplate[]>(
  workspace: { readonly templates: T },
  byTag: NoInfer<readonly string[]>,
): readonly ContinuityTemplate[] => workspace.templates.filter((template) =>
  template.metadata.tags.some((tag) => byTag.includes(tag)),
);

export const namespaceSummary = (
  workspace: ContinuityWorkspace,
): NamespaceMap<{ templates: ContinuityTemplate[]; tenant: string; }> => ({
  'continuity.templates': [...workspace.templates],
  'continuity.tenant': workspace.tenant,
});

export const buildContinuitySequence = <T extends readonly unknown[]>(...steps: T): readonly [...T] => steps;

export const templatePolicySignature = <T extends ContinuityPolicy>(policy: T): string => {
  const clauses = policy.clauses.map((clause) => `${clause.name}:${clause.weight.toFixed(2)}`).join(',');
  return `${policy.enforceSla}-${policy.maxParallelism}-${policy.allowAsyncRollback ? 'async' : 'sync'}-${clauses}`;
};

export const normalizeBundle = <T extends WorkflowTemplate>(template: T): WorkflowTemplate => ({
  id: template.id,
  incidentId: template.incidentId,
  title: template.title,
  description: template.description,
  scope: template.scope,
  priorityVector: template.priorityVector,
  route: template.route,
  status: template.status,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});
