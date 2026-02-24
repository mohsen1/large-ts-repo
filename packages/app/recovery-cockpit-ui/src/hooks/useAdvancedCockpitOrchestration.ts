import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { evaluatePlanPolicy } from '@service/recovery-cockpit-orchestrator';
import { type ExecutionEnvelope, defaultAdvancedCockpitOrchestrationService, summarizeSeedPlugins } from '../services/advancedCockpitOrchestrationService';
import { OrchestratorPhase } from '@shared/ops-orchestration-runtime';

export type OrchestrationHealth = 'idle' | 'loading' | 'ready' | 'failed';

interface UseAdvancedCockpitOrchestrationProps {
  readonly workspaceId: string;
  readonly plans: readonly RecoveryPlan[];
  readonly autoStart: boolean;
}

interface ExecutionSnapshot {
  readonly namespace: string;
  readonly pluginCount: number;
  readonly phases: readonly OrchestratorPhase[];
  readonly score: number;
  readonly allowed: boolean;
}

interface OrchestrationState {
  readonly health: OrchestrationHealth;
  readonly snapshots: ReadonlyArray<ExecutionEnvelope>;
  readonly artifactSummary: string;
  readonly metrics: ExecutionSnapshot | null;
}

export function useAdvancedCockpitOrchestration({
  workspaceId,
  plans,
  autoStart,
}: UseAdvancedCockpitOrchestrationProps): {
  health: OrchestrationHealth;
  snapshots: ReadonlyArray<ExecutionEnvelope>;
  artifactSummary: string;
  metrics: ExecutionSnapshot | null;
  runOrchestration: () => Promise<void>;
  reset: () => void;
  seededPlugins: ReturnType<typeof summarizeSeedPlugins>;
} {
  const mounted = useRef(true);
  const [health, setHealth] = useState<OrchestrationHealth>('idle');
  const [snapshots, setSnapshots] = useState<ExecutionEnvelope[]>([]);
  const [artifactSummary, setArtifactSummary] = useState('none');
  const [metrics, setMetrics] = useState<ExecutionSnapshot | null>(null);

  const seededPlugins = useMemo(() => summarizeSeedPlugins(workspaceId), [workspaceId]);

  const runOrchestration = useCallback(async () => {
    setHealth('loading');

    try {
      const collected: ExecutionEnvelope[] = [];
      let artifactSummaryCount = 0;
      let finalScore = 0;
      let finalAllowed = true;

      for (const plan of plans) {
        const policy = evaluatePlanPolicy(plan, 'advisory');
        const result = await defaultAdvancedCockpitOrchestrationService.runRecoveryPlan(plan, policy);

        collected.push(...result.envelopes);
        artifactSummaryCount += result.artifacts.length;
        finalScore = Math.max(finalScore, result.summary.score);
        finalAllowed = finalAllowed && result.summary.allowed;

        if (!mounted.current) {
          return;
        }
      }

      if (!mounted.current) {
        return;
      }

      setSnapshots(collected);
      setArtifactSummary(`workspace=${workspaceId}, artifacts=${artifactSummaryCount}, plugins=${seededPlugins.count}`);
      setMetrics({
        namespace: workspaceId,
        pluginCount: seededPlugins.count,
        phases: ['intake', 'validate', 'plan', 'execute', 'verify', 'finalize'],
        score: finalScore,
        allowed: finalAllowed,
      });
      setHealth('ready');
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      setHealth('failed');
      setSnapshots([]);
      setArtifactSummary(`failed: ${error instanceof Error ? error.message : 'unknown'}`);
      setMetrics(null);
    }
  }, [plans, workspaceId, seededPlugins]);

  useEffect(() => {
    mounted.current = true;
    if (autoStart && plans.length > 0) {
      void runOrchestration();
    }

    return () => {
      mounted.current = false;
    };
  }, [autoStart, plans.length, runOrchestration]);

  const reset = useCallback(() => {
    setHealth('idle');
    setSnapshots([]);
    setArtifactSummary('none');
    setMetrics(null);
  }, []);

  return {
    health,
    snapshots,
    artifactSummary,
    metrics,
    runOrchestration,
    reset,
    seededPlugins,
  };
}
