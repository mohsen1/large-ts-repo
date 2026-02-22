import { createEngine } from '@service/adaptive-ops-runner';
import { AdaptiveAction, AdaptiveDecision, AdaptivePolicy, SignalKind, SignalSample } from '@domain/adaptive-ops';

export interface SignalRow {
  tenantId: string;
  kind: string;
  value: number;
  unit: string;
  at: string;
}

interface RunUiInput {
  tenantId: string;
  windowMs: number;
  policies: readonly AdaptivePolicy[];
  signals: SignalRow[];
}

const groupByType = <T>(rows: readonly T[], selector: (value: T) => string): Record<string, readonly T[]> => {
  return rows.reduce<Record<string, T[]>>((acc, value) => {
    const key = selector(value);
    acc[key] = acc[key] ?? [];
    acc[key].push(value);
    return acc;
  }, {});
};

const toSignal = (row: SignalRow): SignalSample => ({
  kind: row.kind as SignalKind,
  value: row.value,
  unit: row.unit,
  at: row.at,
});

export const createRunSummary = async ({ tenantId, windowMs, policies, signals }: RunUiInput) => {
  const engine = createEngine();
  const result = await engine.execute({
    context: {
      tenantId,
      signalWindowSec: Math.max(1, Math.floor(windowMs / 1000)),
      policies,
    },
    signals: signals.map(toSignal),
  });

  if (!result.ok) {
    return {
      tenantId,
      ok: false as const,
      message: result.error,
    };
  }

  const groupedActions = groupByType<AdaptiveAction>(
    result.value.decisions.flatMap((entry: AdaptiveDecision): readonly AdaptiveAction[] => entry.selectedActions),
    (action) => action.type,
  );

  return {
    tenantId,
    ok: true as const,
    run: result.value.run,
    firstActionType: result.value.firstAction?.type ?? null,
    groupedActions,
  };
};
