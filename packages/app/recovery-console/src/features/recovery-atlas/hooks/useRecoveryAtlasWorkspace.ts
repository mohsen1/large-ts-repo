import { useMemo, useState, useCallback } from 'react';
import {
  type RecoveryAtlasRunId,
  type RecoveryAtlasSnapshot,
  type RecoveryAtlasWindowId,
  type RecoveryAtlasIncidentId,
  type RecoveryAtlasRunReport,
  type RecoveryAtlasPlanId,
  type RecoveryAtlasRunReport as AtlasRunReport,
  eventStreamSignature,
  deriveReportHealth,
} from '@domain/recovery-operations-atlas';
import { createAtlasEngine, runAtlasPlanner, simulateAtlasDecision, queryByWindow, queryByIncident } from '@service/recovery-orchestration-atlas';

export interface RecoveryAtlasWorkspaceState {
  readonly tenantId: string;
  readonly snapshots: readonly RecoveryAtlasSnapshot[];
  readonly isReady: boolean;
  readonly selectedWindowId?: RecoveryAtlasWindowId;
  readonly selectedIncidentId?: RecoveryAtlasIncidentId;
  readonly activeReport?: RecoveryAtlasRunReport;
  readonly runbookState: 'idle' | 'planning' | 'running' | 'complete';
}

interface UseRecoveryAtlasWorkspaceOptions {
  readonly tenantId: string;
  readonly snapshots: readonly RecoveryAtlasSnapshot[];
}

export interface UseRecoveryAtlasWorkspaceResult {
  readonly state: RecoveryAtlasWorkspaceState;
  readonly metrics: {
    readonly windowCount: number;
    readonly incidentCount: number;
    readonly healthSummary: readonly { key: RecoveryAtlasWindowId; value: 'healthy' | 'degraded' | 'failed' }[];
    readonly signature: string;
  };
  readonly actions: {
    readonly initialize: () => void;
    readonly selectWindow: (windowId: RecoveryAtlasWindowId) => void;
    readonly selectIncident: (incidentId: RecoveryAtlasIncidentId) => void;
    readonly run: () => Promise<void>;
    readonly clear: () => void;
  };
}

export const useRecoveryAtlasWorkspace = ({ tenantId, snapshots }: UseRecoveryAtlasWorkspaceOptions): UseRecoveryAtlasWorkspaceResult => {
  const [selectedWindowId, setSelectedWindowId] = useState<RecoveryAtlasWindowId | undefined>(undefined);
  const [selectedIncidentId, setSelectedIncidentId] = useState<RecoveryAtlasIncidentId | undefined>(undefined);
  const [activeReport, setActiveReport] = useState<RecoveryAtlasRunReport | undefined>(undefined);
  const [runbookState, setRunbookState] = useState<RecoveryAtlasWorkspaceState['runbookState']>('idle');

  const engine = useMemo(() => createAtlasEngine(), []);

  const metrics = useMemo(() => {
    const healthSummary = snapshots.map((snapshot): { key: RecoveryAtlasWindowId; value: 'healthy' | 'degraded' | 'failed' } => {
      const report = snapshot.plans.length > 0
        ? {
            runId: `${snapshot.id}:run` as RecoveryAtlasRunId,
            planId: snapshot.plans[0]?.id ?? ('no-plan' as RecoveryAtlasPlanId),
            tenantId,
            startedAt: new Date().toISOString(),
            passed: true,
            completedSteps: 0,
            failedSteps: 0,
            warnings: [],
            diagnostics: [],
          }
        : {
            runId: `${snapshot.id}:run` as RecoveryAtlasRunId,
            planId: ('no-plan' as RecoveryAtlasPlanId),
            tenantId,
            startedAt: new Date().toISOString(),
            passed: false,
            completedSteps: 0,
            failedSteps: 1,
            warnings: ['missing-plan'],
            diagnostics: [],
          };

      return {
        key: snapshot.id,
        value: deriveReportHealth(report),
      };
    });

    const signature = eventStreamSignature(
      snapshots.flatMap((snapshot) =>
        snapshot.plans.map((plan) => ({
          source: 'recovery-operations-atlas',
          type: 'plan_generated',
          at: planTimestamp(plan),
          message: `plan=${plan.id}`,
          severity: 'low',
          metadata: {
            planId: plan.id,
          },
        })),
      ),
    );

    return {
      windowCount: snapshots.length,
      incidentCount: new Set(snapshots.map((snapshot) => snapshot.incidentId)).size,
      healthSummary,
      signature,
    };
  }, [snapshots, tenantId]);

  const initialize = () => {
    setActiveReport(undefined);
    setRunbookState('planning');
    runAtlasPlanner(snapshots);
    setRunbookState('idle');
  };

  const selectWindow = (windowId: RecoveryAtlasWindowId) => {
    setSelectedWindowId(windowId);
  };

  const selectIncident = (incidentId: RecoveryAtlasIncidentId) => {
    setSelectedIncidentId(incidentId);
  };

  const run = useCallback(async () => {
    setRunbookState('running');
    if (selectedWindowId) {
      const plans = queryByWindow(engine.repository, selectedWindowId);
      if (plans.length > 0 && snapshots.length > 0) {
        const plan = plans[0];
        const report = simulateAtlasDecision(snapshots[0]);
        setActiveReport(report?.report);
      }
    }

    if (!selectedWindowId && selectedIncidentId) {
      const plans = queryByIncident(engine.repository, selectedIncidentId);
      if (plans.length > 0) {
        const report: AtlasRunReport = {
          runId: `${plans[0].id}:manual-run` as RecoveryAtlasRunId,
          planId: plans[0].id,
          tenantId,
          startedAt: new Date().toISOString(),
          passed: true,
          completedSteps: plans[0].steps.length,
          failedSteps: 0,
          warnings: [],
          diagnostics: [],
        };
        setActiveReport(report);
      }
    }

    setRunbookState('complete');
  }, [engine.repository, selectedIncidentId, selectedWindowId, snapshots, tenantId]);

  const clear = () => {
    setSelectedWindowId(undefined);
    setSelectedIncidentId(undefined);
    setActiveReport(undefined);
    setRunbookState('idle');
  };

  return {
    state: {
      tenantId,
      snapshots,
      isReady: snapshots.length > 0,
      selectedWindowId,
      selectedIncidentId,
      activeReport,
      runbookState,
    },
    metrics,
    actions: {
      initialize,
      selectWindow,
      selectIncident,
      run,
      clear,
    },
  };
};

const planTimestamp = (plan: RecoveryAtlasSnapshot['plans'][number]): string => {
  return new Date().toISOString();
};
