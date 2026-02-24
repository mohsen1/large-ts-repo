import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EngineResult,
  EngineTick,
  RuntimeStatus,
} from '@service/recovery-orchestration-studio-engine';
import type { RecoveryRunbook, RecoveryRun } from '@domain/recovery-orchestration-design';
import { collectRunbookProjections, summarizeDiagnostics, buildWindows } from '@domain/recovery-orchestration-design';

export type DiagnosisPhase = 'boot' | 'plan' | 'run' | 'report' | 'drain';
export type DiagnosisTag = `diag:${string}`;
export type PhaseTrend = `trend/${'up' | 'flat' | 'down'}`;
export type PhaseIndex<T extends readonly DiagnosisPhase[]> = T[number];

export interface DiagnosisSummary {
  readonly runbookId: string;
  readonly phase: DiagnosisPhase;
  readonly status: RuntimeStatus;
  readonly severity: 0 | 1 | 2 | 3;
  readonly healthyNodes: number;
  readonly riskyNodes: number;
  readonly projectionCount: number;
  readonly tags: readonly DiagnosisTag[];
  readonly trend: PhaseTrend;
}

interface UseRecoveryOrchestrationStudioDiagnosticsInput {
  readonly runbook?: RecoveryRunbook;
  readonly run?: RecoveryRun;
  readonly ticks?: readonly EngineTick[];
  readonly result?: EngineResult;
}

export interface UseRecoveryOrchestrationStudioDiagnosticsResult {
  readonly summary: DiagnosisSummary | undefined;
  readonly windows: readonly { readonly from: number; readonly to: number; readonly width: number }[];
  readonly hotspots: readonly RecoveryRunbook['nodes'][number][];
  readonly onPhaseAdvance: (phase: DiagnosisPhase) => void;
  readonly lastError: string | undefined;
}

const isTerminal = (status: RuntimeStatus): boolean => status === 'finished' || status === 'failed';

const clampSeverity = (value: number): 0 | 1 | 2 | 3 => {
  if (value <= 0) {
    return 0;
  }
  if (value === 1) {
    return 1;
  }
  if (value === 2) {
    return 2;
  }
  return 3;
};

const asDiagTag = (policyTag: string): DiagnosisTag => {
  const token = policyTag.includes(':') ? policyTag.split(':')[1] : policyTag;
  return `diag:${token}` as DiagnosisTag;
};

const diagnose = (
  runbook: RecoveryRunbook,
  run: RecoveryRun | undefined,
  ticks: readonly EngineTick[],
  phase: DiagnosisPhase,
): DiagnosisSummary => {
  const projections = collectRunbookProjections(runbook);
  const completed = projections.filter((entry) => entry.complete > 0).length;
  const projected = projections.reduce((acc, entry) => acc + entry.active, 0);
  const trend: PhaseTrend = projected > completed ? 'trend/up' : projected === completed ? 'trend/flat' : 'trend/down';
  const summary = summarizeDiagnostics(runbook, run ? [run] : []);

  return {
    runbookId: `${runbook.tenant}/${runbook.workspace}`,
    phase,
    status: ticks[ticks.length - 1]?.status ?? 'idle',
    severity: clampSeverity(Math.ceil(projected / 2) - 1),
    healthyNodes: summary.nodes.complete.nodes.length,
    riskyNodes: summary.nodes.pending.nodes.length + summary.nodes.suppressed.nodes.length,
    projectionCount: projections.length,
    tags: summary.tags.map(asDiagTag),
    trend,
  };
};

export const useRecoveryOrchestrationStudioDiagnostics = (
  input: UseRecoveryOrchestrationStudioDiagnosticsInput,
): UseRecoveryOrchestrationStudioDiagnosticsResult => {
  const { runbook, run, ticks = [], result } = input;
  const [phase, setPhase] = useState<DiagnosisPhase>('boot');
  const seen = useRef<readonly string[]>([]);
  const [lastError, setLastError] = useState<string | undefined>(undefined);

  const hotspots = useMemo<readonly RecoveryRunbook['nodes'][number][]>(() => {
    if (!runbook) {
      return [];
    }
    return runbook.nodes.filter((node) => node.status !== 'complete');
  }, [runbook]);

  const windows = useMemo(() => {
    if (!run) {
      return buildWindows([runbook ? Date.now() : 0]);
    }
    const events = [new Date(run.startedAt).getTime()];
    if (run.finishedAt) {
      events.push(new Date(run.finishedAt).getTime());
    }
    return buildWindows(events);
  }, [run, runbook]);

  const summary = useMemo(() => {
    if (!runbook) {
      return undefined;
    }
    try {
      return diagnose(runbook, run, ticks, phase);
    } catch (error) {
      void error;
      return undefined;
    }
  }, [runbook, run, ticks, phase]);

  useEffect(() => {
    if (!runbook) {
      return;
    }
    if (summary === undefined) {
      setLastError('failed-to-diagnose');
      return;
    }
    setLastError(undefined);
  }, [runbook, summary]);

  if (!lastError && summary === undefined && runbook) {
    setLastError('failed-to-diagnose');
  }

  const onPhaseAdvance = useCallback(
    (next: DiagnosisPhase) => {
      setPhase((current) => {
        const ordered: readonly DiagnosisPhase[] = ['boot', 'plan', 'run', 'report', 'drain'];
        const index = ordered.indexOf(current);
        const candidate = ordered.includes(next) ? next : 'boot';
        if (index === ordered.length - 1 && candidate === 'boot') {
          return current;
        }
        if (!isTerminal(result?.ticks?.[result.ticks.length - 1]?.status ?? 'idle')) {
          return current;
        }
        if (!seen.current.includes(candidate)) {
          seen.current = [...seen.current, candidate];
        }
        return candidate;
      });
    },
    [result],
  );

  return {
    summary,
    windows,
    hotspots,
    onPhaseAdvance,
    lastError,
  };
};
