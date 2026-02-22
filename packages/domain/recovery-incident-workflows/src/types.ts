import { withBrand } from '@shared/core';
import type { Brand } from '@shared/type-level';
import type { IncidentId, IncidentPlanId, IncidentPriorityVector, IncidentRecord, IncidentScope } from '@domain/recovery-incident-orchestration';

export const workflowNodeKinds = ['signal', 'validation', 'mitigation', 'verification', 'closure'] as const;
export type WorkflowNodeKind = (typeof workflowNodeKinds)[number];

export const workflowStatuses = ['draft', 'ready', 'running', 'paused', 'completed', 'failed', 'abandoned'] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

export type WorkflowTemplateId = Brand<string, 'WorkflowTemplateId'>;
export type WorkflowInstanceId = Brand<string, 'WorkflowInstanceId'>;
export type WorkflowRunId = Brand<string, 'WorkflowRunId'>;

export interface WorkflowDependency {
  readonly prerequisiteId: string;
  readonly timeoutMinutes: number;
  readonly retryable: boolean;
}

export interface WorkflowNode {
  readonly id: string;
  readonly label: string;
  readonly kind: WorkflowNodeKind;
  readonly owner: string;
  readonly command: string;
  readonly expectedDurationMinutes: number;
  readonly dependencies: readonly WorkflowDependency[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface WorkflowRoute {
  readonly id: string;
  readonly nodes: readonly WorkflowNode[];
  readonly owner: string;
  readonly slaWindowMinutes: number;
  readonly riskWeight: number;
  readonly tags: readonly string[];
}

export interface WorkflowTemplate {
  readonly id: WorkflowTemplateId;
  readonly incidentId: IncidentId;
  readonly title: string;
  readonly description: string;
  readonly scope: IncidentScope;
  readonly priorityVector: IncidentPriorityVector;
  readonly route: WorkflowRoute;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: WorkflowStatus;
}

export interface WorkflowPolicy {
  readonly enforceSla: boolean;
  readonly maxParallelNodes: number;
  readonly maxDependencyDepth: number;
  readonly allowedKinds: readonly WorkflowNodeKind[];
  readonly minSignalCoveragePercent: number;
  readonly autoEscalateAfterMinutes: number;
}

export interface WorkflowInstance {
  readonly id: WorkflowInstanceId;
  readonly templateId: WorkflowTemplateId;
  readonly planId: IncidentPlanId;
  readonly status: WorkflowStatus;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly activeNodeId?: string;
  readonly runIds: readonly WorkflowRunId[];
  readonly correlationId: string;
}

export interface WorkflowRun {
  readonly id: WorkflowRunId;
  readonly instanceId: WorkflowInstanceId;
  readonly nodeId: string;
  readonly command: string;
  readonly result: 'success' | 'failure' | 'skipped';
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly attempt: number;
  readonly output: Readonly<Record<string, unknown>>;
}

export interface WorkflowBundle {
  readonly template: WorkflowTemplate;
  readonly instance: WorkflowInstance;
  readonly runs: readonly WorkflowRun[];
}

export interface WorkflowViolation {
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

export type WorkflowGraphPath = readonly string[];
export type WorkflowEdgeList = readonly [string, string][];

export type AtLeastOne<T> = keyof T extends never ? never : {
  [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>>
}[keyof T];

export const buildWorkflowTemplateId = (incidentId: string, index: number): WorkflowTemplateId =>
  withBrand(`${incidentId}:workflow-template-${index}`, 'WorkflowTemplateId');

export const buildWorkflowInstanceId = (templateId: string, runWindow: string): WorkflowInstanceId =>
  withBrand(`${templateId}:${runWindow}`, 'WorkflowInstanceId');

export const buildWorkflowRunId = (instanceId: string, nodeId: string, attempt: number): WorkflowRunId =>
  withBrand(`${instanceId}:${nodeId}:${attempt}`, 'WorkflowRunId');

export const normalizeNodeId = (node: WorkflowNode): string => `${node.id}:${node.kind}`;
