import { useCallback, useEffect, useMemo, useState } from 'react';
import { IncidentRecord } from '@domain/incident-management';
import {
  createOrchestrator,
  runRecoverySimulation,
  summarizeBatchRisk,
  summarizeSimulation,
} from '@service/incident-orchestration';
import { InMemoryIncidentStore } from '@data/incident-hub';
import { RecoveryLabScenario } from '../types';
import { SimulationSession } from '@service/incident-orchestration';

interface UseIncidentRecoveryPulseResult {
  readonly incidents: readonly IncidentRecord[];
  readonly selectedId: string;
  readonly risk: number;
  readonly autoCloseCount: number;
  readonly history: readonly string[];
  readonly running: boolean;
  readonly refresh: () => Promise<void>;
  readonly select: (incidentId: string) => void;
  readonly runSimulation: (incidentId: string) => Promise<void>;
}

const buildHistory = (incidentId: string, session: SimulationSession): string => {
  return `${incidentId} => ${session.state} (${session.runs.length}) ${summarizeSimulation(session)}`;
};

export const useIncidentRecoveryPulse = (scenario: RecoveryLabScenario): UseIncidentRecoveryPulseResult => {
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<readonly string[]>([]);
  const [selectedId, setSelectedId] = useState(scenario.selectedIncidentId ?? scenario.incidents[0]?.id ?? 'none');
  const [incidents, setIncidents] = useState<readonly IncidentRecord[]>(scenario.incidents);

  const selected = useMemo(
    () => incidents.find((incident) => incident.id === selectedId) ?? incidents[0],
    [incidents, selectedId],
  );

  const riskData = useMemo(() => summarizeBatchRisk(incidents), [incidents]);
  const orchestrator = useMemo(() => {
    const repo = new InMemoryIncidentStore();
    return createOrchestrator({
      bus: {
        publish: async () => Promise.resolve(),
        subscribe: async () => ({ topic: 'local' as any, close: async () => Promise.resolve() }),
      },
      repo,
    });
  }, []);

  const refresh = useCallback(async () => {
    setRunning(true);
    try {
      const store = new InMemoryIncidentStore();
      for (const incident of incidents) {
        await store.upsert({ ...incident, updatedAt: new Date().toISOString() });
      }
      const refreshed: IncidentRecord[] = [];
      for (const incident of incidents) {
        const result = await store.get(incident.id);
        if (!result.ok || !result.value) continue;
        refreshed.push(result.value);
      }
      setIncidents(refreshed);
    } finally {
      setRunning(false);
    }
  }, [incidents]);

  const runSimulation = useCallback(async (incidentId: string) => {
    const incident = incidents.find((item) => item.id === incidentId);
    if (!incident) return;
    setRunning(true);
    try {
      const session = await runRecoverySimulation(incident);
      const line = buildHistory(incident.id, session);
      setHistory((existing) => [...existing, line]);

      const outcome = await orchestrator(incident);
      if (!outcome.ok) {
        setHistory((existing) => [...existing, `orchestrator-failed:${incident.id}`]);
      } else {
        setHistory((existing) => [...existing, `orchestrator-complete:${outcome.value.incident.id}`]);
      }
    } finally {
      setRunning(false);
    }
  }, [incidents, orchestrator]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    incidents,
    selectedId,
    risk: riskData.avgRisk,
    autoCloseCount: riskData.autoCloseable,
    history,
    running,
    refresh,
    select: setSelectedId,
    runSimulation,
  };
};
