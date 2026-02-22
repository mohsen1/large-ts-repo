import { useEffect, useMemo, useState } from 'react';
import { useReadinessCommandCenter } from '../hooks/useReadinessCommandCenter';
import { useReadinessPortfolio } from '../hooks/useReadinessPortfolio';
import { useReadinessTrendline } from '../hooks/useReadinessTrendline';
import { ReadinessPolicyPanel } from '../components/ReadinessPolicyPanel';
import { ReadinessTimelineExplorer } from '../components/ReadinessTimelineExplorer';
import { ReadinessForecastCard } from '../components/ReadinessForecastCard';
import { ReadinessStrategyBoard } from '../components/ReadinessStrategyBoard';
import type { ReadinessRunId } from '@domain/recovery-readiness';
import type { ReadinessPolicy } from '@domain/recovery-readiness';

interface ReadinessOperationsStudioPageProps {
  readonly tenant: string;
}

const studioPolicy: ReadinessPolicy = {
  policyId: 'policy:readiness-studio',
  name: 'Readiness Studio Policy',
  constraints: {
    key: 'policy:readiness-studio',
    minWindowMinutes: 15,
    maxWindowMinutes: 240,
    minTargetCoveragePct: 0.45,
    forbidParallelity: false,
  },
  allowedRegions: new Set(['us-east-1', 'eu-west-1', 'ap-southeast-1']),
  blockedSignalSources: ['manual-check'],
};

export const ReadinessOperationsStudioPage = ({ tenant }: ReadinessOperationsStudioPageProps) => {
  const [selected, setSelected] = useState<ReadinessRunId | undefined>(undefined);
  const studioState = useReadinessCommandCenter({ tenant, planPolicy: studioPolicy });
  const portfolioState = useReadinessPortfolio({ tenant, planPolicy: studioPolicy });
  const trendline = useReadinessTrendline({ policy: studioPolicy, tenant });
  const selectedModel = useMemo(() => studioState.runs.find((model) => model.plan.runId === selected) ?? studioState.runs[0], [studioState.runs, selected]);

  useEffect(() => {
    if (!studioState.activeRunIds.length) {
      return;
    }
    if (!selected || !studioState.activeRunIds.includes(selected)) {
      setSelected(studioState.activeRunIds[0]);
    }
  }, [selected, studioState.activeRunIds]);

  if (studioState.loading) {
    return <p>Loading readiness studio...</p>;
  }

  return (
    <main>
      <h1>Readiness Operations Studio</h1>
      <p>{`tenant: ${tenant}`}</p>
      <p>{`active runs: ${studioState.activeRunIds.length}`}</p>
      <p>{`warnings: ${studioState.warningCount}`}</p>
      <p>{`portfolio: ${portfolioState.portfolio.total}`}</p>
      <p>{`trend: ${trendline.trendDirection} · ${trendline.scoreMean}`}</p>

      <ReadinessPolicyPanel policy={studioPolicy} runIds={studioState.activeRunIds} selectedRunId={selected} />
      <ReadinessStrategyBoard
        models={studioState.runs}
        policy={{
          policyId: studioPolicy.policyId,
          name: studioPolicy.name,
          constraints: studioPolicy.constraints,
          allowedRegions: studioPolicy.allowedRegions,
          blockedSignalSources: studioPolicy.blockedSignalSources,
        }}
        selectedRunId={selected}
      />

      <ReadinessTimelineExplorer runs={studioState.runs} selectedRunId={selected} />
      <section>
        <h2>Portfolio signals</h2>
        <ul>
          {portfolioState.recommendations.slice(0, 5).map((item) => (
            <li key={item.runId}>
              {item.runId}: {item.recommendation}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Forecasts</h2>
        {selectedModel ? <ReadinessForecastCard model={selectedModel} /> : <p>no selected model</p>}
      </section>
    </main>
  );
};
