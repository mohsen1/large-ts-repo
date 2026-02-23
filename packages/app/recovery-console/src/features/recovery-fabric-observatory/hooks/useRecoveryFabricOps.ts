import { useCallback, useMemo, useState } from 'react';
import { createFacade } from '@service/recovery-fabric-orchestrator';
import {
  type AlertSignal,
  type FabricSimulationInput,
  type FabricTopology,
  type TenantId,
  type FacilityId,
  FabricPlanner,
  generateWhatIfSignals,
  simulateSignalReplay,
} from '@domain/recovery-ops-fabric';
import { RecoveryOpsFabricStore } from '@data/recovery-ops-fabric-store';
import { adaptTopologyFromCsv, attachPlanChecksum } from '@domain/recovery-ops-fabric';

interface SyntheticRecord {
  nodeId: string;
  facility: string;
  role?: string;
  health?: string;
  cpu?: string;
  mem?: string;
  maxCapacity?: string;
  zone?: string;
}

export interface UseRecoveryFabricOpsParams {
  tenantId: string;
  facilityId: string;
  facilitySignals: readonly AlertSignal[];
  topologyRows: ReadonlyArray<SyntheticRecord>;
}

interface RunCheck {
  facility: string;
  total: number;
}

interface UseRecoveryFabricOpsResult {
  planCount: number;
  status: 'idle' | 'running' | 'ready';
  error: string | null;
  topology: FabricTopology | null;
  simulationPoints: readonly { timestamp: string; stressScore: number; riskScore: number }[];
  runChecks: ReadonlyArray<RunCheck>;
  topologyChecksum: string | null;
  execute: () => void;
  replay: () => void;
}

export const useRecoveryFabricOps = ({
  tenantId,
  facilityId,
  facilitySignals,
  topologyRows,
}: UseRecoveryFabricOpsParams): UseRecoveryFabricOpsResult => {
  const store = useMemo(() => new RecoveryOpsFabricStore(), []);
  const facade = useMemo(() => createFacade(), [store]);

  const [planCount, setPlanCount] = useState(0);
  const [status, setStatus] = useState<UseRecoveryFabricOpsResult['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [topology, setTopology] = useState<FabricTopology | null>(null);
  const [simulationPoints, setSimulationPoints] = useState<UseRecoveryFabricOpsResult['simulationPoints']>([]);
  const [runChecks, setRunChecks] = useState<RunCheck[]>([]);
  const [topologyChecksum, setTopologyChecksum] = useState<string | null>(null);

  const tenantBrand = useMemo<TenantId>(() => tenantId as TenantId, [tenantId]);
  const facilityBrand = useMemo<FacilityId>(() => facilityId as FacilityId, [facilityId]);

  const topologyRowsRecord = useMemo(
    () =>
      topologyRows.map((row) => ({
        nodeId: row.nodeId,
        facility: row.facility,
        role: row.role,
        health: row.health,
        cpu: row.cpu,
        mem: row.mem,
        maxCapacity: row.maxCapacity,
        zone: row.zone,
      })),
    [topologyRows],
  );

  const baselineInput = useMemo<FabricSimulationInput | null>(() => {
    if (!topologyRowsRecord.length) {
      return null;
    }

    return {
      tenantId: tenantBrand,
      facilityId: facilityBrand,
      topology: adaptTopologyFromCsv(tenantBrand, topologyRowsRecord),
      signals: [...facilitySignals],
      constraint: { maxSkewMs: 300, maxRisk: 0.4, minHeadroom: 0.14 },
      baselineDemand: 120,
      targetReliability: 0.9,
    };
  }, [facilityBrand, facilitySignals, topologyRowsRecord, tenantBrand]);

  const execute = useCallback(() => {
    if (!baselineInput) {
      setError('missing topology rows');
      return;
    }

    setStatus('running');
    setError(null);

    try {
      for (const signal of baselineInput.signals) {
        store.upsertSignal(signal);
      }

      const planner = new FabricPlanner({ topology: baselineInput.topology, constraint: baselineInput.constraint });
      const result = planner.createPlan(
        {
          topology: baselineInput.topology,
        },
        {
          baselineDemand: baselineInput.baselineDemand,
          targetReliability: baselineInput.targetReliability,
          horizonMinutes: 80,
        },
        baselineInput.signals,
      );
      const replay = simulateSignalReplay({ ...baselineInput, topology: baselineInput.topology });

      setPlanCount(result.plan.steps.length);
      setTopology(baselineInput.topology);
      setSimulationPoints(replay.points);
      setTopologyChecksum(attachPlanChecksum(result.plan));
      setRunChecks((check) => [
        ...check,
        {
          facility: facilityId,
          total: result.simulation.recommendationCount,
        },
      ]);

      facade.executeTopology(baselineInput, {
        baselineDemand: baselineInput.baselineDemand,
        targetReliability: baselineInput.targetReliability,
        horizonMinutes: 80,
      });
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'failed to execute fabrication plan');
      setStatus('idle');
    }
  }, [baselineInput, facilityId, facade, store]);

  const replay = useCallback(() => {
    if (!baselineInput) {
      setError('missing topology rows');
      return;
    }

    setStatus('running');

    try {
      const replayRunbook = simulateSignalReplay({
        ...baselineInput,
        signals: generateWhatIfSignals(baselineInput.signals),
      });
      setSimulationPoints(replayRunbook.points);
      setRunChecks((checks) => [
        ...checks,
        ...baselineInput.signals.map((signal, index) => ({
          facility: signal.facilityId,
          total: index + signal.value,
        })),
      ]);
      facade.replayTopology(baselineInput);
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'failed replay');
      setStatus('idle');
    }
  }, [baselineInput, facade]);

  return {
    planCount,
    status,
    error,
    topology,
    simulationPoints,
    runChecks,
    topologyChecksum,
    execute,
    replay,
  };
};
