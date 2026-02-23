import { useMemo } from 'react';
import type { ReactElement } from 'react';
import type { RecoveryCommandForgeState } from '../../hooks/useRecoveryCommandForgeWorkspace';
import { mapPolicySections, pickPolicySummary } from '../../features/recovery-command-forge/engine';

interface Props {
  readonly workspaceState: RecoveryCommandForgeState;
}

const safeCoverage = (value: number): number => Number.isFinite(value) ? value : 0;

export const CommandForgeDashboard = ({ workspaceState }: Props): ReactElement => {
  const { policySummary, riskBands, signalWeight } = useMemo(() => {
    if (!workspaceState.report) {
      return {
        policySummary: 'No report yet',
        riskBands: { high: 0, medium: 0, low: 0 },
        signalWeight: 0,
      };
    }

    const policySummary = pickPolicySummary(workspaceState.report.policy);
    const sectionRisk = mapPolicySections(workspaceState.report.policy).map((section) => Number((section.passRate * 100).toFixed(1)));
    const policyTotals = sectionRisk.reduce((acc, value) => acc + value, 0);
    const high = sectionRisk.filter((value) => value > 75).length;
    const medium = sectionRisk.filter((value) => value > 40 && value <= 75).length;
    const low = sectionRisk.length - high - medium;
    const signalWeight = workspaceState.report.outcomes.reduce((acc, outcome) => acc + outcome.forecast.signalVolume, 0);

    return {
      policySummary,
      riskBands: {
        high: safeCoverage(high / Math.max(1, sectionRisk.length) * 100),
        medium: safeCoverage(medium / Math.max(1, sectionRisk.length) * 100),
        low: safeCoverage(low / Math.max(1, sectionRisk.length) * 100),
      },
      signalWeight: safeCoverage(policyTotals + signalWeight * 0.01),
    };
  }, [workspaceState]);

  return (
    <section className="command-forge-dashboard">
      <h2>Forge dashboard</h2>
      <p>{workspaceState.tenant}</p>
      <p>{policySummary}</p>
      <p>{`Policy passes: ${riskBands.high.toFixed(1)} / ${riskBands.medium.toFixed(1)} / ${riskBands.low.toFixed(1)}`}</p>
      <p>{`Signals weighted: ${signalWeight.toFixed(1)}`}</p>
      <p>{workspaceState.simulationSummary || 'No simulation executed yet'}</p>
      {workspaceState.error ? <p className="error">{workspaceState.error}</p> : null}
    </section>
  );
};
