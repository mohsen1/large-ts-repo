import { useMemo } from 'react';
import type { RouteProjection, SolverInput } from '@shared/type-level';
import type { SolverOutput } from '@shared/type-level';
import type { StressCommand } from '@shared/type-level';
import {
  type DispatchSignalCode,
  dispatchOverloads,
  dispatchWorkflow,
  evaluateDispatch,
} from '@domain/recovery-lab-stress-lab-core';

type SolverRouteProjection = RouteProjection<`/recovery/${string}/${string}`>;

type SolverPayloadShape = {
  readonly verb: string;
  readonly domain: string;
  readonly severity: string;
  readonly route: `/recovery/${string}:${string}/${string}/${string}`;
  readonly command: StressCommand;
};

type StressSolverInput = {
  readonly stage: DispatchSignalCode;
  readonly command: StressCommand;
  readonly route: SolverRouteProjection;
  readonly payload: SolverPayloadShape;
};

type StressSolverOutput = Omit<SolverOutput<SolverInput<string>>, 'input'> & { readonly input: StressSolverInput };

interface StressLabSolverInspectorProps {
  readonly command: StressCommand;
  readonly route: string;
}

const collectSignals = (command: StressCommand): DispatchSignalCode[] => {
  if (command.includes('discover')) {
    return ['ev-000', 'ev-010', 'ev-020', 'ev-030', 'ev-040', 'ev-050'];
  }
  if (command.includes('reconcile')) {
    return ['ev-005', 'ev-015', 'ev-025', 'ev-035', 'ev-045', 'ev-050'];
  }
  return ['ev-001', 'ev-011', 'ev-021', 'ev-031', 'ev-041', 'ev-050'];
};

const resolveLabel = (signal: DispatchSignalCode): string => {
  const branch = dispatchOverloads(signal);
  return branch === 'hot' ? 'urgent' : 'standard';
};

export const StressLabSolverInspector = ({ command, route }: StressLabSolverInspectorProps) => {
  const inputs = useMemo<StressSolverInput[]>(
    () =>
      collectSignals(command).map((signal) => ({
        command,
        stage: signal,
        route: {
          service: 'recovery',
          entity: 'dispatch',
          id: signal,
          parsed: `/recovery/dispatch/${signal}` as `/recovery/dispatch/${string}`,
        },
        payload: {
          verb: 'discover',
          domain: 'workload',
          severity: 'high',
          route: '/recovery/discover:workload/inspection/route',
          command,
        },
      })),
    [command, route],
  );

  const reportMap = useMemo(() => {
    return inputs.reduce<Map<string, StressSolverOutput>>((acc, input) => {
      const signal = input.stage as DispatchSignalCode;
      const context = {
        tenant: 'tenant-a',
        phase: 'step' as const,
        command,
        routeHints: [signal, route],
      };
      const report = evaluateDispatch(signal, context);
      const output = dispatchWorkflow(signal, context);
      if (output.ok) {
        const solverOutput: StressSolverOutput = {
          input,
          ok: output.value?.status !== 'failed',
          warnings: output.value?.notes ?? [],
          profile: {
            source: report.code,
            route,
            stage: input.stage,
          },
        };
        acc.set(signal, solverOutput);
      }
      return acc;
    }, new Map<string, StressSolverOutput>());
  }, [command, inputs, route]);

  const summary = useMemo(() => {
    const labels = [...reportMap.values()].map((value) => {
      const warnings = value.warnings.join(',');
      const mode = value.ok ? 'ok' : 'no';
      return `${mode}:${warnings}`;
    });
    return labels.length ? labels.join(' · ') : 'no reports';
  }, [reportMap]);

  return (
    <section className="stress-lab-solver-inspector">
      <h3>Solver Inspector</h3>
      <p>{summary}</p>
      <ul>
        {[...collectSignals(command)].map((signal) => {
          const branchLabel = resolveLabel(signal);
          const report = evaluateDispatch(signal, {
            tenant: 'tenant-a',
            phase: 'step',
            command,
            routeHints: [route],
          });
          return (
            <li key={signal}>
              {signal} · {branchLabel} · {report.status} · next={report.next.length}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
