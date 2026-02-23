import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IncidentRecord } from '@domain/incident-management';
import type { RecoveryLabScenario } from '../types';

interface CadenceRow {
  readonly index: number;
  readonly score: number;
  readonly delaySeconds: number;
}

interface RecoveryCadenceResult {
  readonly rows: readonly CadenceRow[];
  readonly totalDelay: number;
  readonly ready: boolean;
  readonly applyCadence: (index: number) => void;
  readonly reset: () => void;
}

const baseWindow = (index: number, incident: IncidentRecord): CadenceRow => {
  const severityMultiplier = incident.triage.severity === 'sev1' ? 2.1 : incident.triage.severity === 'sev2' ? 1.7 : 1.2;
  const confidence = incident.triage.confidence * 100;
  const score = Number((severityMultiplier * confidence + (incident.currentStep?.length ?? 1)).toFixed(2));
  const delaySeconds = Math.max(15, Math.floor((100 - score) * 3 + 6));

  return {
    index,
    score,
    delaySeconds,
  };
};

export const useIncidentRecoveryCadence = (scenario: RecoveryLabScenario): RecoveryCadenceResult => {
  const [rows, setRows] = useState<readonly CadenceRow[]>([]);

  const build = useCallback((input: readonly IncidentRecord[]) => {
    const next = input.map((incident, index) => baseWindow(index, incident));
    setRows(next);
  }, []);

  const reset = useCallback(() => {
    build(scenario.incidents);
  }, [build, scenario.incidents]);

  const applyCadence = useCallback(
    (index: number) => {
      setRows((current) =>
        current.map((row) =>
          row.index === index
            ? { ...row, delaySeconds: Math.max(5, row.delaySeconds - 5), score: Number((row.score + 4).toFixed(2)) }
            : row,
        ),
      );
    },
    [],
  );

  const totalDelay = useMemo(() => rows.reduce((sum, row) => sum + row.delaySeconds, 0), [rows]);
  const ready = rows.every((row) => row.score > 0);

  useEffect(() => {
    build(scenario.incidents);
  }, [build, scenario.incidents]);

  return {
    rows,
    totalDelay,
    ready,
    applyCadence,
    reset,
  };
};
