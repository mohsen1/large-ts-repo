import { useEffect, useMemo, useState } from 'react';
import type { StabilityRunId, RecoveryObjective, ServiceNodeId } from '@domain/recovery-stability-models';
import type { StabilityRunContext, StabilitySummary } from '@service/recovery-stability-orchestrator';
import { StabilityOrchestratorService } from '@service/recovery-stability-orchestrator';
import { buildSignalMatrix, summarizeSignalsByClass } from '../components/stability/TopSignalsPanel';
import { createSignalRows } from '../components/stability/StabilityGrid';

export interface StabilityMonitorProps {
  readonly orchestrator: StabilityOrchestratorService;
  readonly runId: StabilityRunId;
}

export interface StabilityMonitorState {
  readonly context?: StabilityRunContext;
  readonly loading: boolean;
  readonly summary?: StabilitySummary;
  readonly classCounts: Record<string, number>;
  readonly topSignalRows: ReadonlyArray<string>;
}

export const useStabilityMonitor = ({ orchestrator, runId }: StabilityMonitorProps): StabilityMonitorState => {
  const [context, setContext] = useState<StabilityRunContext | undefined>();
  const [summary, setSummary] = useState<StabilitySummary | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    void orchestrator.evaluateReadiness(runId).then((result) => {
      if (!mounted) return;
      if (!result.ok) {
        setLoading(false);
        return;
      }

      void orchestrator.summarizeRun(runId).then((summaryResult) => {
        if (!mounted) return;
        if (summaryResult.ok) {
          setSummary(summaryResult.value);
        }
        setLoading(false);
      });
    });

    void orchestrator.registerEnvelope(
      {
        id: runId,
        objective: {
          id: `${runId}-objective` as RecoveryObjective['id'],
          name: 'stability-mesh',
          targetRtoMinutes: 30,
          targetRpoSeconds: 180,
          allowedBlastRadius: 4,
          criticality: 3,
        },
        signals: [],
        topology: {
          runId,
          services: [
            `${runId}-svc-a` as ServiceNodeId,
            `${runId}-svc-b` as ServiceNodeId,
          ],
          edges: [
            {
              from: `${runId}-svc-a` as ServiceNodeId,
              to: `${runId}-svc-b` as ServiceNodeId,
              coupling: 0.66,
              latencyBudgetMs: 180,
            },
            ],
          criticalityByService: {
            [`${runId}-svc-a` as ServiceNodeId]: 4,
            [`${runId}-svc-b` as ServiceNodeId]: 2,
          },
          createdAt: new Date().toISOString(),
        },
        owner: 'recovery-orchestration',
        notes: ['dashboard bootstrapped'],
        metadata: { bootstrap: true },
      },
      [],
    ).then((result) => {
      if (!mounted || !result.ok) return;
      setContext(result.value);
    });

    return () => {
      mounted = false;
    };
  }, [orchestrator, runId]);

  const signalRows = useMemo(() => {
    const signals = context?.signals ?? [];
    buildSignalMatrix(signals);
    return createSignalRows(signals);
  }, [context?.signals]);

  const classCounts = useMemo(() => {
    return summary
      ? summarizeSignalsByClass(summary.envelope.actions.map((entry: string) => entry))
      : {};
  }, [summary]);

  return {
    context,
    loading,
    summary,
    classCounts,
    topSignalRows: signalRows,
  };
};
