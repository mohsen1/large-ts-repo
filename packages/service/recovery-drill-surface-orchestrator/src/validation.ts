import { withBrand } from '@shared/core';
import type { SurfaceProfile, SurfaceGoal, SurfaceWindow, SurfaceCommand } from './types';

export const parseProfile = (value: unknown): SurfaceProfile | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<SurfaceProfile>;
  if (typeof candidate.tenant !== 'string' || candidate.tenant.length < 1) {
    return undefined;
  }
  if (typeof candidate.zone !== 'string' || candidate.zone.length < 2) {
    return undefined;
  }
  if (!['dev', 'staging', 'prod'].includes(candidate.environment ?? '')) {
    return undefined;
  }

  return {
    tenant: candidate.tenant,
    zone: candidate.zone,
    environment: candidate.environment as SurfaceProfile['environment'],
    maxConcurrentRuns: candidate.maxConcurrentRuns ?? 1,
    preferredPriority: (candidate.preferredPriority as SurfaceProfile['preferredPriority']) ?? 'medium',
  };
};

export const parseGoal = (value: unknown): SurfaceGoal | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<SurfaceGoal>;
  if (typeof candidate.label !== 'string' || candidate.label.length < 2) {
    return undefined;
  }
  if (typeof candidate.scoreTarget !== 'number' || candidate.scoreTarget < 0 || candidate.scoreTarget > 100) {
    return undefined;
  }
  if (typeof candidate.riskTarget !== 'number' || candidate.riskTarget < 0 || candidate.riskTarget > 100) {
    return undefined;
  }
  if (typeof candidate.maxDurationMinutes !== 'number' || candidate.maxDurationMinutes < 1) {
    return undefined;
  }

  return {
    label: candidate.label,
    scoreTarget: candidate.scoreTarget,
    riskTarget: candidate.riskTarget,
    maxDurationMinutes: Math.floor(candidate.maxDurationMinutes),
  };
};

export const parseCommand = (value: unknown): SurfaceCommand | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<SurfaceCommand>;
  if (typeof candidate.commandId !== 'string' || candidate.commandId.length < 6) {
    return undefined;
  }
  if (!['plan', 'run', 'validate', 'drain'].includes(candidate.type ?? '')) {
    return undefined;
  }

  const goal = parseGoal(candidate.goal);
  const profile = parseProfile(candidate.profile);
  if (!goal || !profile) {
    return undefined;
  }

  const workspaceId = candidate.workspaceId;
  const scenarioId = candidate.scenarioId;
  if (typeof workspaceId !== 'string' || typeof scenarioId !== 'string' || workspaceId.length < 1 || scenarioId.length < 1) {
    return undefined;
  }

  if (typeof candidate.requestedBy !== 'string' || candidate.requestedBy.length < 1) {
    return undefined;
  }

  const requestedAt = candidate.requestedAt;
  if (typeof requestedAt !== 'string' || Number.isNaN(Date.parse(requestedAt))) {
    return undefined;
  }

  return {
    commandId: candidate.commandId,
    type: candidate.type as SurfaceCommand['type'],
    workspaceId: withBrand(workspaceId, 'DrillWorkspaceId'),
    scenarioId: withBrand(scenarioId, 'DrillScenarioId'),
    goal,
    profile,
    requestedBy: candidate.requestedBy,
    requestedAt,
  };
};

export const parseWindow = (value: unknown): SurfaceWindow | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<SurfaceWindow>;
  if (typeof candidate.id !== 'string' || candidate.id.length < 2) {
    return undefined;
  }

  const profile = parseProfile(candidate.profile);
  if (!profile) {
    return undefined;
  }

  const from = candidate.from;
  const to = candidate.to;
  if (typeof from !== 'string' || typeof to !== 'string') {
    return undefined;
  }
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return undefined;
  }
  if (new Date(from).getTime() >= new Date(to).getTime()) {
    return undefined;
  }

  return {
    id: candidate.id,
    profile,
    from,
    to,
    createdAt: candidate.createdAt ?? new Date().toISOString(),
    tags: candidate.tags ?? [],
  };
};
