import { withBrand } from '@shared/core';
import type { ControlPlaneCheckpoint, ControlPlaneConstraint, ControlPlaneManifest, ControlPlanePlan, ScheduleWindow } from './types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const asConstraintMode = (value: unknown): ControlPlaneConstraint['kind'] => {
  if (value === 'strict' || value === 'monitor' || value === 'disabled') return value;
  return 'strict';
};

const parseControlPlaneConstraint = (input: unknown): ControlPlaneConstraint => {
  if (!isObject(input)) {
    return {
      name: 'signal-density',
      kind: 'strict',
      limit: 16,
      warningThreshold: 12,
    };
  }

  const name = isString(input.name) ? input.name : 'signal-density';
  const limit = isNumber(input.limit) ? input.limit : 16;
  const warningThreshold = isNumber(input.warningThreshold) ? input.warningThreshold : limit;
  return {
    name,
    kind: asConstraintMode(input.kind),
    limit,
    warningThreshold,
  };
};

export const parseConstraint = (input: unknown): ControlPlaneConstraint => parseControlPlaneConstraint(input);

export const parseWindow = (input: unknown): ScheduleWindow => {
  if (!isObject(input)) {
    return {
      label: 'fallback',
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
    };
  }

  return {
    label: isString(input.label) ? input.label : 'fallback',
    startsAt: isString(input.startsAt) ? input.startsAt : new Date().toISOString(),
    endsAt: isString(input.endsAt) ? input.endsAt : new Date().toISOString(),
  };
};

const parseCommand = (input: unknown): ControlPlanePlan['commands'][number] => {
  if (!isObject(input)) {
    return {
      id: withBrand(`fallback-${Date.now()}`, 'ControlCommandId'),
      command: 'deploy',
      runId: withBrand('fallback-run', 'ControlPlaneRunId'),
      stepId: withBrand('fallback-step', 'RecoveryStepId'),
      createdAt: new Date().toISOString(),
      expiresAt: undefined,
    };
  }

  return {
    id: withBrand(isString(input.id) ? input.id : `command-${Date.now()}`, 'ControlCommandId'),
    command: isString(input.command) ? (input.command as 'deploy') : 'deploy',
    runId: withBrand(isString(input.runId) ? input.runId : 'fallback-run', 'ControlPlaneRunId'),
    stepId: withBrand(isString(input.stepId) ? input.stepId : 'fallback-step', 'RecoveryStepId'),
    createdAt: isString(input.createdAt) ? input.createdAt : new Date().toISOString(),
    expiresAt: isString(input.expiresAt) ? input.expiresAt : undefined,
  };
};

const parseCheckpoint = (input: unknown): ControlPlaneCheckpoint => {
  if (!isObject(input)) {
    return {
      id: withBrand(`fallback-${Date.now()}`, 'ControlPlaneArtifactId'),
      runId: withBrand('fallback-run', 'ControlPlaneRunId'),
      commandId: withBrand('fallback-cmd', 'ControlCommandId'),
      stage: 'verify',
      status: 'pending',
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      details: {},
    };
  }

  return {
    id: withBrand(isString(input.id) ? input.id : `checkpoint-${Date.now()}`, 'ControlPlaneArtifactId'),
    runId: withBrand(isString(input.runId) ? input.runId : 'fallback-run', 'ControlPlaneRunId'),
    commandId: withBrand(isString(input.commandId) ? input.commandId : 'fallback-cmd', 'ControlCommandId'),
    stage: isString(input.stage) ? (input.stage as ControlPlaneCheckpoint['stage']) : 'prepare',
    status: isString(input.status) ? (input.status as ControlPlaneCheckpoint['status']) : 'pending',
    startedAt: isString(input.startedAt) ? input.startedAt : new Date().toISOString(),
    finishedAt: isString(input.finishedAt) ? input.finishedAt : undefined,
    details: isObject(input.details) ? (input.details as Record<string, unknown>) : undefined,
  };
};

export const parsePlan = (input: unknown): ControlPlanePlan => {
  if (!isObject(input)) {
    return {
      id: withBrand('fallback-plan', 'ControlPlaneRunId'),
      programId: withBrand('fallback-program', 'RecoveryProgramId'),
      snapshotId: withBrand('fallback-snapshot', 'RunPlanId'),
      commands: [],
      graph: {
        runId: withBrand('fallback-graph', 'ControlPlaneRunId'),
        nodes: [],
        edges: [],
        rootNodes: [],
        terminalNodes: [],
      },
      gates: [],
      window: {
        from: new Date().toISOString(),
        to: new Date().toISOString(),
        timezone: 'UTC',
      },
    };
  }

  const commands = Array.isArray(input.commands) ? input.commands.map(parseCommand) : [];
  const graphInput = isObject(input.graph) ? input.graph : undefined;
  const graphRunId = isString(graphInput?.runId) ? graphInput.runId : 'fallback-graph';

  return {
    id: withBrand(isString(input.id) ? input.id : 'fallback-plan', 'ControlPlaneRunId'),
    programId: withBrand(isString(input.programId) ? input.programId : 'fallback-program', 'RecoveryProgramId'),
    snapshotId: withBrand(isString(input.snapshotId) ? input.snapshotId : 'fallback-snapshot', 'RunPlanId'),
    commands,
    graph: {
      runId: withBrand(graphRunId, 'ControlPlaneRunId'),
      nodes: Array.isArray(graphInput?.nodes) ? (graphInput?.nodes as readonly string[]) : [],
      edges: Array.isArray(graphInput?.edges)
        ? (graphInput?.edges as any)
        : [],
      rootNodes: Array.isArray(graphInput?.rootNodes) ? (graphInput?.rootNodes as readonly string[]) : [],
      terminalNodes: Array.isArray(graphInput?.terminalNodes) ? (graphInput?.terminalNodes as readonly string[]) : [],
    },
    gates: Array.isArray(input.gates) ? (input.gates as readonly string[]) : [],
    window: {
      from: isString(input.from) ? input.from : new Date().toISOString(),
      to: isString(input.to) ? input.to : new Date().toISOString(),
      timezone: isString(input.timezone) ? input.timezone : 'UTC',
    },
  };
};

export const parseManifest = (input: unknown): ControlPlaneManifest => {
  if (!isObject(input)) {
    return {
      envelopeId: withBrand('fallback-manifest', 'ControlPlaneEnvelopeId'),
      tenant: 'default',
      run: withBrand('fallback-run', 'ControlPlaneRunId'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      plan: parsePlan(undefined),
      checkpoints: [],
      timeline: [],
    };
  }

  return {
    envelopeId: withBrand(isString(input.envelopeId) ? input.envelopeId : 'fallback-manifest', 'ControlPlaneEnvelopeId'),
    tenant: isString(input.tenant) ? input.tenant : 'default',
    run: withBrand(isString(input.run) ? input.run : 'fallback-run', 'ControlPlaneRunId'),
    createdAt: isString(input.createdAt) ? input.createdAt : new Date().toISOString(),
    updatedAt: isString(input.updatedAt) ? input.updatedAt : new Date().toISOString(),
    plan: parsePlan(input.plan),
    checkpoints: Array.isArray(input.checkpoints) ? input.checkpoints.map(parseCheckpoint) : [],
    timeline: Array.isArray(input.timeline)
      ? input.timeline.map((event) =>
          isObject(event)
            ? {
                at: isString(event.at) ? event.at : new Date().toISOString(),
                stage: isString(event.stage) ? (event.stage as ControlPlaneCheckpoint['stage']) : 'prepare',
                event: isString(event.event) ? event.event : 'manifest',
                tags: Array.isArray(event.tags) ? event.tags.filter((entry) => isString(entry)) as readonly string[] : [],
              }
            : {
                at: new Date().toISOString(),
                stage: 'prepare',
                event: 'fallback',
                tags: ['fallback'],
              },
          )
      : [],
  };
};
