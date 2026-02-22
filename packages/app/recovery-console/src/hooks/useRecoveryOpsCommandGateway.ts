import { useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { hydrateWorkspaceBySession } from '@data/recovery-operations-store';
import {
  buildCommandSurface,
  type CommandSurfaceSnapshot,
} from '@domain/recovery-operations-models/command-surface';
import { buildOrchestrationMatrix } from '@domain/recovery-operations-models/orchestration-matrix';
import { buildIntentGatewayReport, routeCoverage } from '@domain/recovery-operations-models/command-intent-gateway';
import type { RunPlanSnapshot, SessionStatus } from '@domain/recovery-operations-models';

export interface RecoveryOpsGatewayRow {
  readonly routeId: string;
  readonly commandId: string;
  readonly score: number;
  readonly status: string;
}

export interface RecoveryOpsCommandGatewayState {
  readonly tenant: string;
  readonly generatedAt: string;
  readonly rows: readonly RecoveryOpsGatewayRow[];
  readonly canIssue: boolean;
  readonly issue: () => Promise<string>;
}

interface UseRecoveryOpsCommandGatewayInput {
  readonly tenant: string;
  readonly sessionId: string;
  readonly plan: RunPlanSnapshot;
}

const formatRows = (surfaces: readonly CommandSurfaceSnapshot[]) => {
  return surfaces.flatMap((surface) =>
    surface.entries.map((entry) => ({
      routeId: `${surface.sessionId}:${entry.stepId}`,
      commandId: entry.stepId,
      score: entry.score,
      status: `${entry.bucket}`,
    })),
  );
};

export const useRecoveryOpsCommandGateway = (
  input: UseRecoveryOpsCommandGatewayInput,
): RecoveryOpsCommandGatewayState => {
  const [issued, setIssued] = useState(false);

  const state = useMemo(() => {
    const status = 'running' as SessionStatus;
    const session = {
      id: withBrand(input.sessionId, 'RunSessionId'),
      runId: withBrand(`${input.sessionId}:run`, 'RecoveryRunId'),
      ticketId: withBrand(`${input.sessionId}:ticket`, 'RunTicketId'),
      planId: input.plan.id,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      constraints: {
        maxParallelism: 3,
        maxRetries: 2,
        timeoutMinutes: 30,
        operatorApprovalRequired: false,
      },
      signals: [],
    };

    const workspace = hydrateWorkspaceBySession(session, [input.plan]);
    const surface = buildCommandSurface(session, input.plan);
    const matrix = buildOrchestrationMatrix(session, input.plan);
    const report = buildIntentGatewayReport(input.tenant, session, surface, matrix);
    const rows = formatRows([surface]);

    return {
      tenant: input.tenant,
      generatedAt: new Date().toISOString(),
      rows,
      canIssue: rows.length > 0 && routeCoverage(report) > 0,
    };
  }, [input]);

  return {
    ...state,
    issue: async () => {
      setIssued(true);
      return `issued-${input.sessionId}-${issued ? 1 : 0}-${Date.now()}`;
    },
  };
};
