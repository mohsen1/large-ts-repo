import type { Brand } from '@shared/core';
import { withBrand } from '@shared/core';
import { commandWindowStateSchema, type CommandWindowState, type CommandWindowMetric } from './command-window-forecast';

export type CadenceSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface CadenceStage {
  readonly stageId: Brand<string, 'CadenceStageId'>;
  readonly name: string;
  readonly owner: string;
  readonly slaMs: number;
  readonly window: {
    readonly openAt: string;
    readonly closeAt: string;
  };
  readonly metrics: readonly CommandWindowMetric[];
  readonly status: CommandWindowState;
}

export interface CadencePlan {
  readonly cadenceId: Brand<string, 'CadencePlanId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly commandId: Brand<string, 'CommandArtifactId'>;
  readonly stages: readonly CadenceStage[];
  readonly severity: CadenceSeverity;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
}

export interface CadenceQuery {
  readonly tenant?: string;
  readonly commandId?: string;
  readonly severity?: CadenceSeverity;
  readonly status?: CommandWindowState | readonly CommandWindowState[];
}

const isCloseToSla = (slaMs: number, elapsedMs: number): boolean => elapsedMs >= Math.max(0, slaMs * 0.8);

const isSlaBreached = (slaMs: number, elapsedMs: number): boolean => elapsedMs > slaMs;

const severityFromBreachRatio = (ratio: number): CadenceSeverity => {
  if (ratio >= 1.2) {
    return 'critical';
  }
  if (ratio >= 1.0) {
    return 'high';
  }
  if (ratio >= 0.8) {
    return 'medium';
  }
  return 'low';
};

export const makeCadenceStage = (
  tenant: Brand<string, 'TenantId'>,
  name: string,
  owner: string,
  slaMs: number,
  idx: number,
): CadenceStage => ({
  stageId: withBrand(`${tenant}:${name}:${idx}`, 'CadenceStageId'),
  name,
  owner,
  slaMs,
  window: {
    openAt: new Date().toISOString(),
    closeAt: new Date(Date.now() + slaMs).toISOString(),
  },
  metrics: [],
  status: commandWindowStateSchema.parse('open'),
});

export const buildCadencePlan = (
  tenant: Brand<string, 'TenantId'>,
  commandId: Brand<string, 'CommandArtifactId'>,
  stageCount = 4,
): CadencePlan => {
  const stages = Array.from({ length: stageCount }, (_, index) =>
    makeCadenceStage(tenant, `stage-${index + 1}`, index % 2 === 0 ? 'platform-ops' : 'sre-squad', 4 * 60_000 + index * 30_000, index),
  );

  return {
    cadenceId: withBrand(`${tenant}:${commandId}:cadence`, 'CadencePlanId'),
    tenant,
    commandId,
    stages,
    severity: 'low',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['recovery', 'operations', 'cadence'],
  };
};

export interface CadenceSnapshot {
  readonly tenant: string;
  readonly commandId: string;
  readonly stageCount: number;
  readonly breachRatio: number;
  readonly severity: CadenceSeverity;
  readonly atRiskStageCount: number;
  readonly status: CommandWindowState;
}

export const snapshotCadence = (plan: CadencePlan, now = Date.now()): CadenceSnapshot => {
  const breachRatios = plan.stages.map((stage) => {
    const elapsed = Math.max(0, now - Date.parse(stage.window.openAt));
    return elapsed / stage.slaMs;
  });

  const maxBreach = Math.max(...breachRatios, 0);
  const atRisk = breachRatios.filter((value) => value >= 0.8).length;
  const anyBreached = breachRatios.some((value) => value >= 1.0);
  const allClosed = plan.stages.every((stage) => {
    const elapsed = now - Date.parse(stage.window.openAt);
    return isSlaBreached(stage.slaMs, elapsed);
  });

  const severity = severityFromBreachRatio(maxBreach);
  const status: CommandWindowState = allClosed ? 'closed' : anyBreached ? 'active' : 'open';

  return {
    tenant: String(plan.tenant),
    commandId: String(plan.commandId),
    stageCount: plan.stages.length,
    breachRatio: maxBreach,
    severity,
    atRiskStageCount: atRisk,
    status,
  };
};

export const rankCadenceByUrgency = (plans: readonly CadencePlan[]): readonly CadencePlan[] =>
  [...plans].sort((first, second) => {
    const firstSnapshot = snapshotCadence(first);
    const secondSnapshot = snapshotCadence(second);

    const statusWeight = (status: CommandWindowState): number => {
      switch (status) {
        case 'active':
          return 3;
        case 'open':
          return 2;
        case 'expired':
          return 4;
        case 'closed':
          return 1;
      }
    };

    return statusWeight(secondSnapshot.status) - statusWeight(firstSnapshot.status) || secondSnapshot.breachRatio - firstSnapshot.breachRatio;
  });

export const findNearBreachStages = (plan: CadencePlan): readonly CadenceStage[] =>
  plan.stages.filter((stage) => {
    const elapsed = Date.now() - Date.parse(stage.window.openAt);
    return isCloseToSla(stage.slaMs, elapsed) && !isSlaBreached(stage.slaMs, elapsed);
  });

export const stageToLabel = (stage: CadenceStage): string => {
  return `${stage.name} (${stage.owner}) ${Math.round(stage.slaMs / 60_000)}m`; 
};
