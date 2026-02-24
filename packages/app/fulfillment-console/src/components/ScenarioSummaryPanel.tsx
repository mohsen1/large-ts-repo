interface ScenarioSummaryPanelProps {
  score: number;
  signalCount: number;
  tenantId: string;
  averageDemand: number;
}

export const ScenarioSummaryPanel = ({ score, signalCount, tenantId, averageDemand }: ScenarioSummaryPanelProps) => {
  const level = score > 75 ? 'stable' : score > 40 ? 'watch' : 'unstable';
  return (
    <section>
      <h3>Scenario Summary</h3>
      <p>Tenant: {tenantId}</p>
      <p>Signal count: {signalCount}</p>
      <p>Average observed demand: {averageDemand.toFixed(2)}</p>
      <p>Health level: {level}</p>
    </section>
  );
};
