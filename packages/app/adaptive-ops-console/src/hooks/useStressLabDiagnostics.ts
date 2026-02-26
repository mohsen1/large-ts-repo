import { useCallback, useMemo, useState } from 'react';
import type { Result } from '@shared/result';
import { classifyDispatch, dispatchWorkflow, type DispatchContext, dispatchReportDefaults } from '@domain/recovery-lab-stress-lab-core';
import type { StressCommand, StressVerb, StressDomain, StressSeverity } from '@shared/type-level';
import { evaluateDispatch } from '@domain/recovery-lab-stress-lab-core';

type Stage = 'idle' | 'running' | 'complete' | 'error';

interface DiagnosticResult {
  readonly code: string;
  readonly status: 'ok' | 'warn' | 'err';
  readonly notes: readonly string[];
}

interface DiagnosticsState {
  readonly stage: Stage;
  readonly routeCount: number;
  readonly traces: readonly string[];
  readonly warnings: readonly DiagnosticResult[];
  readonly latest: string;
}

type DispatchPhase = 'start' | 'step' | 'finish' | 'rollback' | 'failover';

interface TriggerInput {
  readonly command: StressCommand;
  readonly routeHints: readonly string[];
}

const severityWeight: Record<StressSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  emergency: 5,
  info: 1,
};

const toContext = (tenant: string, phase: DispatchPhase, command: StressCommand, routeHints: readonly string[]): DispatchContext => ({
  tenant,
  phase,
  command,
  routeHints,
});

const evaluateCommand = (command: StressCommand): {
  readonly verb: StressVerb;
  readonly domain: StressDomain;
  readonly severity: StressSeverity;
} => {
  const [verb, domain, severity] = command.split(':') as [StressVerb, StressDomain, StressSeverity];
  return { verb, domain, severity };
};

const branchClassifier = (command: StressCommand, hints: readonly string[]): number => {
  const parsed = evaluateCommand(command);
  let score = severityWeight[parsed.severity];
  for (const hint of hints) {
    if (hint.startsWith('ev-0')) {
      score += 1;
    }
    if (hint.length > 20) {
      score += 2;
    }
  }
  if (parsed.domain === 'workload') {
    score += 1;
  }
  if (parsed.verb === 'recover' || parsed.verb === 'dispatch') {
    score += 3;
  }
  return score;
};

const toDiagnostic = (command: StressCommand, code: string, status: 'ok' | 'warn' | 'err'): DiagnosticResult => {
  const parsed = evaluateCommand(command);
  return {
    code,
    status,
    notes: [
      `verb:${parsed.verb}`,
      `domain:${parsed.domain}`,
      `severity:${parsed.severity}`,
      `code:${code}`,
    ],
  };
};

export const useStressLabDiagnostics = () => {
  const [state, setState] = useState<DiagnosticsState>({
    stage: 'idle',
    routeCount: 0,
    traces: [],
    warnings: [],
    latest: 'none',
  });

  const runDiagnostics = useCallback(async (input: TriggerInput): Promise<Result<DiagnosticsState, Error>> => {
    setState((previous) => ({
      ...previous,
      stage: 'running',
    }));

    try {
      const parsed = evaluateCommand(input.command);
      const branch = classifyDispatch('ev-000', toContext('tenant-a', 'start', input.command, input.routeHints));
      const phase = branch.verb === 'discover' ? 'finish' : 'step';
      const context = toContext('tenant-a', phase, input.command, input.routeHints);

      let score = branchClassifier(input.command, input.routeHints);
      let stage: Stage = 'running';
      const warnings: DiagnosticResult[] = [];

      for (const signal of Object.keys(dispatchReportDefaults) as Array<keyof typeof dispatchReportDefaults>) {
        const report = evaluateDispatch(signal, context);
        const commandWithHint = `${parsed.verb}:${parsed.domain}:${parsed.severity}` as StressCommand;
        if (report.status === 'executed') {
          score += 5;
        } else if (report.status === 'failed') {
          warnings.push(toDiagnostic(commandWithHint, signal, 'err'));
          stage = 'error';
        } else if (report.status === 'suppressed') {
          warnings.push(toDiagnostic(commandWithHint, signal, 'warn'));
        } else {
          warnings.push(toDiagnostic(commandWithHint, signal, 'ok'));
        }

        const output = dispatchWorkflow(signal, context);
        if (!output.ok) {
          stage = 'error';
          warnings.push(toDiagnostic(commandWithHint, signal, 'err'));
          continue;
        }

        for (const note of output.value.notes) {
          if (note === 'complete') {
            stage = 'complete';
          }
          if (note === 'late-stage') {
            score -= 1;
          }
        }
      }

      const nextState: DiagnosticsState = {
        stage,
        routeCount: Object.keys(dispatchReportDefaults).length,
        traces: input.routeHints,
        warnings,
        latest: `score:${score}:phase:${phase}`,
      };

      setState(nextState);
      return { ok: true, value: nextState };
    } catch (error) {
      const nextState = {
        stage: 'error' as const,
        routeCount: 0,
        traces: input.routeHints,
        warnings: [toDiagnostic(input.command, 'dispatch-failed', 'err')],
        latest: 'dispatch-failed',
      };
      setState(nextState);
      return { ok: false, error: error instanceof Error ? error : new Error('diagnostic failure') };
    }
  }, []);

  const quickDiagnostic = useMemo(() => {
    return (input: {
      command: StressCommand;
      routeHints: readonly string[];
    }): number => {
      const parsed = evaluateCommand(input.command);
      const base = branchClassifier(input.command, input.routeHints);
      return parsed.verb === 'discover' ? base + 10 : base + 2;
    };
  }, []);

  return {
    state,
    runDiagnostics,
    quickDiagnostic,
  };
};
