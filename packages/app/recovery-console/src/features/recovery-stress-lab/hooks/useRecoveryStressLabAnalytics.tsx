import { useEffect, useMemo, useState } from 'react';
import {
  CommandRunbook,
  OrchestrationPlan,
  RecoverySignal,
  RecoverySimulationResult,
  TenantId,
  createTenantId,
} from '@domain/recovery-stress-lab';
import {
  evaluateLabContext,
  rankRunbooksByReadiness,
  compareAgainstHistory,
} from '@service/recovery-stress-lab-orchestrator';
import { WorkloadTopology } from '@domain/recovery-stress-lab';

interface Inputs {
  readonly tenantId: TenantId;
  readonly band: 'low' | 'medium' | 'high' | 'critical';
  readonly runbooks: readonly CommandRunbook[];
  readonly targets: readonly unknown[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly simulation: RecoverySimulationResult | null;
  readonly plan: OrchestrationPlan | null;
}

interface AnalyticsState {
  readonly readiness: ReturnType<typeof evaluateLabContext>;
  readonly runbookRanking: readonly { id: CommandRunbook['id']; score: number }[];
  readonly driftNotice: {
    readonly changed: boolean;
    readonly metrics: {
      readonly riskDelta: number;
      readonly slaDelta: number;
      readonly durationDelta: number;
    };
    readonly reason: string;
  } | null;
  readonly loading: boolean;
  readonly lastEvaluatedAt: string;
}

const noActionTopology: WorkloadTopology = {
  tenantId: createTenantId('noop'),
  nodes: [],
  edges: [],
};

export const useRecoveryStressLabAnalytics = (inputs: Inputs) => {
  const { tenantId, band, runbooks, targets, topology, signals, simulation, plan } = inputs;
  const [loading, setLoading] = useState(false);
  const [readyAt, setReadyAt] = useState('');
  const [driftNotice, setDriftNotice] = useState<AnalyticsState['driftNotice']>(null);

  const evaluated = useMemo(() => {
    return evaluateLabContext({
      tenantId,
      band,
      runbooks,
      targets: targets as never[],
      topology: topology.nodes.length > 0 ? topology : noActionTopology,
      signals,
      simulation,
      plan,
    });
  }, [tenantId, band, runbooks, topology, signals, simulation, plan, targets]);

  const runbookRanking = useMemo(() => {
    return rankRunbooksByReadiness(runbooks);
  }, [runbooks]);

  useEffect(() => {
    setLoading(true);
    const current = simulation;
    const timer = setTimeout(() => {
      if (current) {
        const notice = compareAgainstHistory(tenantId, current, null);
        setDriftNotice(notice);
      } else {
        setDriftNotice(null);
      }
      setLoading(false);
      setReadyAt(new Date().toISOString());
    }, 15);
    return () => clearTimeout(timer);
  }, [tenantId, simulation]);

  return {
    loading,
    lastEvaluatedAt: readyAt,
    readiness: evaluated,
    runbookRanking,
    driftNotice,
    healthSummary: evaluated.metrics,
    issueCount: evaluated.issues.length,
    warningCount: evaluated.warnings.length,
  };
};
