import { addMinutes, toEpochMinutes } from '@shared/util';
import { Brand, Edge, Graph, NodeId } from '@shared/core';
import type { DeepReadonly } from '@shared/type-level';
import {
  type IncidentId,
  type IncidentRecord,
  type IncidentSeverity,
  type IncidentState,
  type Runbook,
  type RunbookStep,
  type TriageContext,
} from './types';

export type IncidentWorkflowId = Brand<string, 'IncidentWorkflowId'>;

export interface WorkflowStepMetrics {
  readonly total: number;
  readonly completed: number;
  readonly running: number;
  readonly blocked: number;
  readonly failed: number;
}

export interface WorkflowStepWindow {
  readonly state: RunbookStep['state'];
  readonly incidentId: IncidentId;
  readonly startedAt: string;
  readonly endedAt: string | undefined;
  readonly estimatedSeconds: number;
}

export interface WorkflowTransition {
  readonly fromStepKey: string;
  readonly toStepKey: string;
  readonly reason: string;
  readonly at: string;
}

export interface IncidentWorkflow {
  readonly id: IncidentWorkflowId;
  readonly incidentId: IncidentId;
  readonly runbook: Runbook;
  readonly activeStep: string;
  readonly state: IncidentState;
  readonly history: readonly WorkflowTransition[];
  readonly windows: readonly WorkflowStepWindow[];
}

export interface WorkflowProjection {
  readonly workflowId: IncidentWorkflowId;
  readonly incidentId: IncidentId;
  readonly criticality: IncidentSeverity;
  readonly readinessScore: number;
  readonly transitions: number;
  readonly activeStep: string;
  readonly isComplete: boolean;
}

export interface WorkflowCommand {
  readonly workflowId: IncidentWorkflowId;
  readonly incidentId: IncidentId;
  readonly command: 'advance' | 'rollback' | 'pause' | 'resume';
  readonly requestedBy: string;
  readonly requestedAt: string;
}

export interface WorkflowDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly nextStepKey?: string;
  readonly expectedRemainingSeconds?: number;
}

export const buildWorkflowGraph = (runbook: Runbook): Graph<NodeId, { readonly prerequisite: boolean }> => {
  const nodeIds = runbook.steps.map((step) => step.key as NodeId);
  const edges: readonly Edge<NodeId, { readonly prerequisite: boolean }>[] = runbook.steps.flatMap((step) =>
    step.prerequisites.map((pre) => ({
      from: pre as NodeId,
      to: step.key as NodeId,
      weight: 1,
      payload: { prerequisite: true },
    })),
  );

  return {
    nodes: nodeIds,
    edges,
  };
};

const rankBySeverity: Record<IncidentSeverity, number> = {
  sev1: 4,
  sev2: 3,
  sev3: 2,
  sev4: 1,
};

const toMinutes = (value: string): number => Math.floor(new Date(value).getTime() / 60000);

export const severityWeight = (severity: IncidentSeverity): number => rankBySeverity[severity] ?? 1;

export const readinessScore = (incident: Pick<IncidentRecord, 'triage' | 'state'>): number => {
  const base = severityWeight(incident.triage.severity) * 20;
  const stateDelta = incident.state === 'resolved' ? 0 : incident.state === 'monitoring' ? 12 : 28;
  const confidence = incident.triage.confidence * 10;
  return Math.max(0, Math.min(100, 100 - base - stateDelta + confidence));
};

export const nextStep = (workflow: Pick<IncidentWorkflow, 'runbook' | 'activeStep'>): WorkflowDecision => {
  const steps = workflow.runbook.steps;
  const activeIndex = steps.findIndex((step) => step.key === workflow.activeStep);
  if (activeIndex < 0) {
    return {
      allowed: false,
      reason: 'active-step-not-found',
    };
  }

  const active = steps[activeIndex];
  if (active.state === 'done') {
    const next = steps[activeIndex + 1];
    if (!next) {
      return {
        allowed: true,
        reason: 'workflow-complete',
        nextStepKey: undefined,
      };
    }
    return {
      allowed: true,
      reason: 'advance-available',
      nextStepKey: next.key,
      expectedRemainingSeconds: sumRemainingEstimate(steps.slice(activeIndex + 1)),
    };
  }

  if (active.state === 'failed') {
    return {
      allowed: false,
      reason: 'current-step-failed',
    };
  }

  return {
    allowed: false,
    reason: `current-step-${active.state}`,
    nextStepKey: active.key,
  };
};

export const canCommand = (
  command: WorkflowCommand['command'],
  workflow: Pick<IncidentWorkflow, 'state' | 'activeStep' | 'history'>,
): WorkflowDecision => {
  if (workflow.state === 'resolved') {
    return {
      allowed: command === 'pause',
      reason: 'incident-resolved',
    };
  }

  if (command === 'pause') {
    return {
      allowed: true,
      reason: 'pause-ready',
    };
  }

  if (command === 'resume' && workflow.history.some((item) => item.reason === 'manual-pause')) {
    return {
      allowed: true,
      reason: 'resume-ready',
    };
  }

  if (command === 'rollback') {
    return {
      allowed: true,
      reason: 'rollback-allowed',
    };
  }

  if (command === 'advance') {
    return {
      allowed: false,
      reason: workflow.activeStep.length > 0 ? 'advance-unavailable-without-runbook' : 'active-step-missing',
    };
  }

  return {
    allowed: false,
    reason: 'command-not-supported',
  };
};

export const sumRemainingEstimate = (steps: readonly RunbookStep[]): number => {
  return steps.reduce((total, step) => total + step.estimateSeconds, 0);
};

export const metricsForWorkflow = (workflow: Pick<IncidentWorkflow, 'windows'>): WorkflowStepMetrics => {
  const all = workflow.windows.map((entry) => entry.state);
  return {
    total: all.length,
    completed: all.filter((state) => state === 'done').length,
    running: all.filter((state) => state === 'running').length,
    blocked: all.filter((state) => state === 'pending' || state === 'skipped').length,
    failed: all.filter((state) => state === 'failed').length,
  };
};

export const windowForWindow = (step: WorkflowStepWindow): Readonly<WorkflowStepWindow> => ({ ...step });

export const buildWorkflowWindow = (
  incident: Pick<IncidentRecord, 'id' | 'state' | 'runbook' | 'currentStep' | 'createdAt' | 'updatedAt'>,
  now: Date = new Date(),
): DeepReadonly<{
  readonly stepWindows: readonly WorkflowStepWindow[];
  readonly startBucket: number;
  readonly endBucket: number;
}> => {
  const steps = incident.runbook?.steps ?? [];
  const windows = steps.map((step) => {
    const estimate = step.estimateSeconds;
    const startedAt = incident.createdAt;
    const endedAt = incident.updatedAt;
    return {
      state: step.state,
      incidentId: incident.id,
      startedAt,
      endedAt: incident.state === 'resolved' ? endedAt : undefined,
      estimatedSeconds: estimate,
    } as WorkflowStepWindow;
  });

  const sorted = windows.slice().sort((left, right) => toMinutes(left.startedAt) - toMinutes(right.startedAt));
  return {
    stepWindows: sorted,
    startBucket: toEpochMinutes(now),
    endBucket: toEpochMinutes(addMinutes(now, 90)),
  };
};

export const isWorkflowHealthy = (workflow: Pick<IncidentWorkflow, 'state' | 'history' | 'activeStep'>): boolean => {
  if (workflow.state === 'resolved') return true;
  if (workflow.history.length > 100) return false;
  return workflow.state !== 'false-positive' && workflow.activeStep.length > 0;
};
