import { useMemo } from 'react';
import type { PluginStage, HorizonPlan } from '@domain/recovery-horizon-engine';

type PluginDeckProps = {
  readonly plans: readonly HorizonPlan[];
  readonly selectedStage: PluginStage;
  readonly onStageSelect: (stage: PluginStage) => void;
  readonly onRun: (planId: string) => void;
};

const stageBuckets = (plans: readonly HorizonPlan[]) => {
  const buckets = plans.reduce<Record<PluginStage, HorizonPlan[]>>(
    (acc, plan) => {
      const stage = plan.pluginSpan.stage as PluginStage;
      return {
        ...acc,
        [stage]: [...(acc[stage] ?? []), plan],
      };
    },
    {
      ingest: [],
      analyze: [],
      resolve: [],
      optimize: [],
      execute: [],
    } as Record<PluginStage, HorizonPlan[]>,
  );

  return Object.entries(buckets).map(([stage, list]) => ({
    stage: stage as PluginStage,
    count: list.length,
    plans: list,
  }));
};

export const HorizonStudioPluginDeck = ({ plans, selectedStage, onStageSelect, onRun }: PluginDeckProps) => {
  const buckets = useMemo(() => stageBuckets(plans).toSorted((left, right) => left.stage.localeCompare(right.stage)), [plans]);

  return (
    <section className="horizon-studio-plugin-deck">
      <h3>Studio Plugin Deck</h3>
      <div className="deck-nav">
        {buckets.map((bucket) => (
          <button
            key={bucket.stage}
            type="button"
            onClick={() => onStageSelect(bucket.stage)}
            className={selectedStage === bucket.stage ? 'selected' : 'idle'}
          >
            {bucket.stage} ({bucket.count})
          </button>
        ))}
      </div>

      <ol>
        {buckets
          .find((entry) => entry.stage === selectedStage)
          ?.plans.toSorted((left, right) => String(left.id).localeCompare(String(right.id)))
          .map((plan) => (
            <li key={plan.id}>
              <span>{plan.id}</span>
              <button type="button" onClick={() => onRun(String(plan.id))}>
                run
              </button>
            </li>
          ))}
      </ol>
    </section>
  );
};
