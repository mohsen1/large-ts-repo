import { type OrchestrationResult } from './contracts';

export interface TelemetryPoint {
  readonly route: string;
  readonly status: OrchestrationResult['status'];
  readonly timestamp: string;
  readonly score: number;
}

export const emitTelemetry = (result: OrchestrationResult): TelemetryPoint[] => [
  {
    route: result.route,
    status: result.status,
    timestamp: new Date().toISOString(),
    score: result.plan.steps.length,
  },
];

export const summarizeTelemetry = (points: readonly TelemetryPoint[]) =>
  points.reduce<Record<OrchestrationResult['status'], number>>(
    (acc, point) => {
      acc[point.status] = (acc[point.status] ?? 0) + 1;
      return acc;
    },
    { complete: 0, error: 0, queued: 0, running: 0 },
  );

export const routeFingerprint = (route: string): string => route.replace(':', '-');

export const collectTelemetry = (result: OrchestrationResult): string =>
  emitTelemetry(result)
    .map((point) => `${point.route}=${point.score}`)
    .join('|');

export const projectTelemetry = <T extends TelemetryPoint, K extends keyof T>(
  points: readonly T[],
  key: K,
): readonly T[K][] => points.map((point) => point[key]);

export const telemetryByStatus = (points: readonly TelemetryPoint[]): Record<string, TelemetryPoint[]> => {
  const groups = new Map<string, TelemetryPoint[]>();
  for (const point of points) {
    const next = groups.get(point.status) ?? [];
    next.push(point);
    groups.set(point.status, next);
  }
  return Object.fromEntries(groups.entries());
};

export const parseResultText = (text: string): { ok: true; value: string } | { ok: false; error: SyntaxError } => {
  if (!text.includes('::')) {
    return { ok: false, error: new SyntaxError('invalid result text') };
  }
  return { ok: true, value: text };
};
