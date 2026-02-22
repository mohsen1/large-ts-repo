import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import type { CommandSurfaceSnapshot } from './command-surface';
import type { OrchestrationMatrix } from './orchestration-matrix';
import type { RunSession } from './types';

export type IntentRouteId = Brand<string, 'IntentRouteId'>;

export interface IntentRouteDefinition {
  readonly routeId: IntentRouteId;
  readonly commandId: string;
  readonly tenant: string;
  readonly priority: number;
  readonly isBlocking: boolean;
  readonly channel: 'automation' | 'human' | 'dual';
}

export interface IntentRouteState {
  readonly routeId: IntentRouteId;
  readonly state: 'pending' | 'deployed' | 'paused' | 'expired';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reason: string;
}

export interface IntentGatewayReport {
  readonly tenant: string;
  readonly sessionId: string;
  readonly generatedAt: string;
  readonly routes: readonly IntentRouteDefinition[];
  readonly states: readonly IntentRouteState[];
  readonly confidence: number;
}

const severityToPriority = (score: number, cycleRisk: number): number => {
  const normalized = Math.max(0, Math.min(10, score * 10));
  return normalized * (1 + Math.max(0, cycleRisk));
};

const makeRouteState = (def: IntentRouteDefinition): IntentRouteState => ({
  routeId: def.routeId,
  state: def.isBlocking ? 'deployed' : 'pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  reason: def.isBlocking ? 'blocking dependencies' : 'ready for scheduling',
});

const chooseChannel = (
  bucket: CommandSurfaceSnapshot['entries'][number]['bucket'],
): IntentRouteDefinition['channel'] => {
  if (bucket === 'critical') return 'human';
  if (bucket === 'high' || bucket === 'medium') return 'dual';
  return 'automation';
};

export const buildIntentGatewayRoutes = (
  tenant: string,
  session: RunSession,
  surface: CommandSurfaceSnapshot,
  matrix: OrchestrationMatrix,
): readonly IntentRouteDefinition[] => {
  return surface.entries.map((entry, index) => ({
    routeId: withBrand(`${tenant}:${session.runId}:${entry.stepId}:${index}`, 'IntentRouteId'),
    commandId: entry.stepId,
    tenant,
    priority: Math.max(0, Math.min(1, severityToPriority(entry.score, matrix.cycleRisk) / 10)),
    isBlocking: entry.bucket === 'critical' || entry.bucket === 'high',
    channel: chooseChannel(entry.bucket),
  }));
};

const confidenceFromMatrix = (matrix: OrchestrationMatrix): number => {
  const size = Math.max(1, matrix.rows.length);
  const riskPenalty = matrix.cycleRisk / size;
  return Math.max(0, Math.min(1, 1 - riskPenalty));
};

const inferRouteState = (
  route: IntentRouteDefinition,
  entry?: CommandSurfaceSnapshot['entries'][number],
): IntentRouteState => {
  if (!entry) {
    return {
      routeId: route.routeId,
      state: 'expired',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reason: 'entry missing',
    };
  }

  if (route.channel === 'human' && route.isBlocking) {
    return makeRouteState(route);
  }

  if (entry.bucket === 'critical') {
    return {
      routeId: route.routeId,
      state: 'deployed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reason: 'requires immediate human review',
    };
  }

  return {
    routeId: route.routeId,
    state: entry.score > 0.6 ? 'deployed' : 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reason: `channel=${route.channel} score=${entry.score.toFixed(2)}`,
  };
};

export const buildIntentGatewayReport = (
  tenant: string,
  session: RunSession,
  surface: CommandSurfaceSnapshot,
  matrix: OrchestrationMatrix,
): IntentGatewayReport => {
  const routes = buildIntentGatewayRoutes(tenant, session, surface, matrix);
  const states = routes.map((route, index) => inferRouteState(route, surface.entries[index]));
  return {
    tenant,
    sessionId: session.id,
    generatedAt: new Date().toISOString(),
    routes,
    states,
    confidence: confidenceFromMatrix(matrix),
  };
};

export const routeCoverage = (report: IntentGatewayReport): number => {
  if (!report.routes.length) return 0;
  const deployed = report.states.filter((state) => state.state === 'deployed' || state.state === 'paused').length;
  return Math.round((deployed / report.routes.length) * 100) / 100;
};
