import { useCallback, useMemo, useState } from 'react';
import {
  TenantId,
  SeverityBand,
  CommandRunbook,
  RecoverySignal,
  WorkloadTopology,
  buildSignalDensityMatrix,
  pickTopSignals,
} from '@domain/recovery-stress-lab';
import {
  InMemoryPersistence,
  ConsoleAuditSink,
  createTenantId,
} from '@domain/recovery-stress-lab';
import {
  StressLabMeshOperator,
  summarizeMeshHealth,
  type StressLabSession,
  type StressLabDecision,
} from '@service/recovery-stress-lab-orchestrator';

import type { MeshHealthSummary } from '@service/recovery-stress-lab-orchestrator';

interface Inputs {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
}

const FALLBACK_TOPOLOGY = {
  tenantId: createTenantId('fallback'),
  nodes: [],
  edges: [],
};

export const useRecoveryStressLabMesh = ({ tenantId, band }: Inputs) => {
  const [signals, setSignals] = useState<readonly RecoverySignal[]>([]);
  const [runbooks, setRunbooks] = useState<readonly CommandRunbook[]>([]);
  const [topology, setTopology] = useState<WorkloadTopology>(FALLBACK_TOPOLOGY);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<MeshHealthSummary | null>(null);
  const [decision, setDecision] = useState<StressLabDecision | null>(null);
  const [session, setSession] = useState<StressLabSession | null>(null);
  const [driftWarnings, setDriftWarnings] = useState<readonly string[]>([]);
  const [error, setError] = useState('');

  const matrix = useMemo(() => buildSignalDensityMatrix(tenantId, signals), [tenantId, signals]);
  const topSignalCount = useMemo(() => pickTopSignals(signals, 4).length, [signals]);
  const densityScore = useMemo(() => matrix.cells.reduce((acc, cell) => acc + cell.density, 0), [matrix]);

  const runMesh = useCallback(async () => {
    setLoading(true);
    setError('');
    setDriftWarnings([]);

    try {
      const operator = new StressLabMeshOperator(
        {
          persistence: new InMemoryPersistence(),
          audit: {
            emit: async () => undefined,
          } as ConsoleAuditSink,
        },
        {
          activeBand: band,
          hasTopology: topology.nodes.length > 0,
        },
      );

      const result = await operator.run({
        tenantId,
        band,
        runbooks,
        topology,
        signals,
        targets: [],
        config: {
          tenantId,
          band,
          profileHint: band === 'critical' ? 'agile' : band === 'low' ? 'conservative' : 'normal',
          selectedRunbooks: runbooks.map((runbook) => runbook.id),
        },
      });

      setDecision(result.decision);
      setSession(result.session);
      setDriftWarnings([result.driftReason]);
        if (result.plan) {
          setReport(summarizeMeshHealth({
            tenantId,
            band,
            plan: result.plan,
            topology,
            signals,
            runbooks,
            simulation: result.simulation,
          }));
        }
      return result;
    } catch (thrown) {
      const meshError = thrown instanceof Error ? thrown : new Error('mesh operator failed');
      setError(meshError.message);
      setDriftWarnings((current) => [...current, meshError.message]);
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId, band, runbooks, signals, topology]);

  return {
    state: {
      tenantId,
      band,
      loading,
      error,
      topSignalCount,
      densityScore,
      report,
      decision,
      session,
      driftWarnings,
      driftWarningsCount: driftWarnings.length,
    } as const,
    data: {
      signals,
      runbooks,
      topology,
    },
    actions: {
      setSignals,
      setRunbooks,
      setTopology,
      runMesh,
    },
    matrix,
    matrixCells: matrix.cells,
  };
};
