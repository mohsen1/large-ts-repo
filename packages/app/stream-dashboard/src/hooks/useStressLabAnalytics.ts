import { useMemo, useState } from 'react';
import {
  buildStressForecast,
  buildStressMetricReport,
  compareStressReports,
  buildTopologyRiskProfile,
  summarizeRiskProfile,
} from '@domain/recovery-stress-lab';
import { buildWorkspaceReport } from '@service/recovery-stress-lab-orchestrator';
import { StreamStressLabWorkspace } from '../types/stressLab';

export interface StressLabAnalytics {
  readonly forecastTrend: 'rising' | 'stable' | 'declining';
  readonly forecastPeak: number;
  readonly riskSummary: ReturnType<typeof summarizeRiskProfile>;
  readonly report: ReturnType<typeof buildWorkspaceReport>;
  readonly metricDiff: ReturnType<typeof compareStressReports> | null;
}

export interface UseStressLabAnalyticsResult {
  readonly analytics: StressLabAnalytics | null;
  readonly selectedMetric: keyof StreamStressLabWorkspace | 'none';
  readonly setSelectedMetric: (metric: keyof StreamStressLabWorkspace | 'none') => void;
}

export const useStressLabAnalytics = (workspace: StreamStressLabWorkspace): UseStressLabAnalyticsResult => {
  const [selectedMetric, setSelectedMetric] = useState<keyof StreamStressLabWorkspace | 'none'>('none');

  const analytics = useMemo(() => {
    if (!workspace.plan) {
      return null;
    }
    const forecast = buildStressForecast({
      tenantId: workspace.tenantId,
      band: workspace.state.selectedBand,
      topology: {
        tenantId: workspace.tenantId,
        nodes: workspace.targets.map((target) => ({
          id: target.workloadId,
          name: target.name,
          ownerTeam: 'platform',
          criticality: target.criticality,
          active: true,
        })),
        edges: [],
      },
      signals: workspace.runbookSignals,
      windowMinutes: 30,
    });
    const report = buildWorkspaceReport({
      tenantId: workspace.tenantId,
      plan: workspace.plan,
      simulation: workspace.simulation,
      topology: {
        tenantId: workspace.tenantId,
        nodes: workspace.targets.map((target) => ({
          id: target.workloadId,
          name: target.name,
          ownerTeam: 'platform',
          criticality: target.criticality,
          active: true,
        })),
        edges: [],
      },
      runbooks: workspace.runbooks,
      signals: workspace.runbookSignals,
      config: { tenantId: workspace.tenantId, band: workspace.state.selectedBand, profileHint: 'normal', selectedRunbooks: [] },
    });
    const riskProfile = buildTopologyRiskProfile({
      tenantId: workspace.tenantId,
      band: workspace.state.selectedBand,
      topology: {
        tenantId: workspace.tenantId,
        nodes: workspace.targets.map((target) => ({
          id: target.workloadId,
          name: target.name,
          ownerTeam: 'platform',
          criticality: target.criticality,
          active: true,
        })),
        edges: [],
      },
      runbooks: workspace.runbooks,
      signals: workspace.runbookSignals,
    });
    const riskSummary = summarizeRiskProfile(riskProfile, workspace.simulation);
    return {
      forecastTrend: forecast.trend,
      forecastPeak: forecast.peakLoad,
      riskSummary,
      report,
      metricDiff: null,
    };
  }, [workspace.plan, workspace.runbooks.length, workspace.simulation, workspace.runbookSignals, workspace.targets]);

  return {
    analytics: analytics,
    selectedMetric,
    setSelectedMetric,
  };
};
