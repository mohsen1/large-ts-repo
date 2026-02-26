import { useEffect, useMemo, useState } from 'react';
import type {
  ArenaResult,
  ArenaSettings,
  ControlMatrixResult,
} from '@domain/recovery-lab-synthetic-orchestration';
import { type RecoveryCommand, type RecoveryDomain, type RecoveryRoute } from '@shared/type-level/stress-synthetic-atlas';
import {
  buildArenaRoutes,
  compileControlMatrix,
  runConstraintArena,
  runRouteArenaSuite,
} from '@domain/recovery-lab-synthetic-orchestration';

export interface StressLabArenaOptions {
  readonly tenant: string;
  readonly domain: string;
  readonly routeCount: number;
}

export interface StressLabArenaState {
  readonly tenant: string;
  readonly routeCount: number;
  readonly matrixSummary: number;
  readonly matrixWarnings: number;
  readonly routeCountEffective: number;
  readonly matrix: ControlMatrixResult['cells'];
  readonly routeRoutes: readonly string[];
  readonly traces: {
    readonly route: string;
    readonly status: string;
    readonly command: string;
    readonly envelope: { command: string; domain: string; severity: string; normalized: string };
  }[];
  readonly suiteSize: number;
  readonly ready: boolean;
}

type MatrixBucket = {
  readonly matrixSummary: number;
  readonly matrixWarnings: number;
  readonly matrixSize: number;
  readonly matrixRoutes: number;
};

const mapArenaSettings = (options: StressLabArenaOptions): ArenaSettings => ({
  tenant: options.tenant,
  domain: options.domain as RecoveryDomain,
  routeCount: options.routeCount,
  mode: 'scan',
  attempts: 8,
});

const summarizeArena = (routes: readonly string[], matrix: ReturnType<typeof compileControlMatrix>): MatrixBucket => ({
  matrixSummary: matrix.summary,
  matrixWarnings: matrix.warnings,
  matrixSize: matrix.cells.length,
  matrixRoutes: routes.length,
});

export const useStressLabArena = (options: StressLabArenaOptions): StressLabArenaState => {
  const [ready, setReady] = useState(false);
  const [suiteSize, setSuiteSize] = useState(0);
  const [traceRows, setTraceRows] = useState<StressLabArenaState['traces']>([]);

  const settings = useMemo(() => mapArenaSettings(options), [options.tenant, options.domain, options.routeCount]);
  const routes = useMemo(() => buildArenaRoutes(settings) as readonly RecoveryRoute[], [settings]);

  const matrix = useMemo(
    () =>
      compileControlMatrix({
        seed: routes.length,
        size: Math.max(4, Math.min(routes.length + 2, 32)),
        mode: 'route',
      }),
    [routes.length],
  );

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const suite = await runRouteArenaSuite([settings.domain], settings.attempts);
      if (!mounted) {
        return;
      }
      setSuiteSize(suite.length);
      const first = suite[0] as ArenaResult | undefined;
      if (!first) {
        setTraceRows([]);
        setReady(false);
        return;
      }

      const traces = first.trace.map((entry) => ({
        route: entry.route,
        status: entry.status,
        command: entry.command,
        envelope: {
          ...entry.envelope,
          normalized: entry.envelope.normalized,
        },
      }));
      setTraceRows(traces);
      setReady(true);
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [settings]);

  const summary = useMemo(() => summarizeArena(routes, matrix), [routes, matrix]);
  const manualConstraintRuns = useMemo(
    () =>
      routes.map((route) =>
        runConstraintArena(
          {
              tenant: options.tenant,
              command: (route.split(':')[0] ?? 'boot') as RecoveryCommand,
              domain: settings.domain,
              routes: [route as RecoveryRoute],
              dryRun: true,
            },
            route as RecoveryRoute,
        ),
      ),
    [options.tenant, routes, settings.domain],
  );
  void manualConstraintRuns;

  return {
    tenant: options.tenant,
    routeCount: routes.length,
    matrixSummary: summary.matrixSummary,
    matrixWarnings: summary.matrixWarnings,
    routeCountEffective: summary.matrixRoutes,
    matrix: matrix.cells,
    routeRoutes: routes,
    traces: traceRows,
    suiteSize,
    ready,
  };
};
