import { useMemo } from 'react';
import { ConvergenceStudioDashboard } from '../components/ConvergenceStudioDashboard';
import { ConvergencePlanFlowTimeline } from '../components/ConvergencePlanFlowTimeline';
import {
  ConvergenceSummary,
  normalizePluginId,
  normalizeRunId,
  normalizeStudioId,
  normalizeConvergenceTag,
} from '@domain/recovery-ops-orchestration-lab/src/convergence-studio/types';

const fallbackSummary: ConvergenceSummary = {
  runId: normalizeRunId('fallback-run'),
  workspaceId: normalizeStudioId('fallback-studio'),
  stageTrail: ['discover', 'evaluate', 'simulate'],
  selectedPlugins: [normalizePluginId('fallback-plugin')],
  score: 0.51,
  tags: [normalizeConvergenceTag('fallback')],
  diagnostics: ['bootstrap'],
};

interface ConvergenceStudioCommandCenterPageProps {
  readonly tenant?: string;
}

export const ConvergenceStudioCommandCenterPage = ({ tenant = 'tenant-ops' }: ConvergenceStudioCommandCenterPageProps) => {
  const summary = useMemo<ConvergenceSummary>(() => fallbackSummary, []);
  const diagnostics = useMemo(() => summary.diagnostics.join(' | '), [summary.diagnostics]);

  return (
    <main style={{ padding: 16, display: 'grid', gap: 16 }}>
      <header>
        <h1>Convergence Command Center</h1>
        <p>tenant={tenant}</p>
      </header>

      <ConvergenceStudioDashboard tenant={tenant} mode="live" />

      <section style={{ border: '1px solid #e5e7eb', padding: 12, borderRadius: 12 }}>
        <h2>Last known flow</h2>
        <ConvergencePlanFlowTimeline summary={summary} />
        <p>{diagnostics}</p>
      </section>
    </main>
  );
};
