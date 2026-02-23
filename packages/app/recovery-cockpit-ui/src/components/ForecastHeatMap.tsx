import { FC, useMemo } from 'react';
import {
  buildReadinessProfile,
  profileByTopology,
  ServiceReadinessProfile,
  buildTopologySnapshot,
} from '@domain/recovery-cockpit-workloads';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { toTimestamp, UtcIsoTimestamp } from '@domain/recovery-cockpit-models';

export type ForecastHeatMapProps = {
  plans: readonly RecoveryPlan[];
  maxCells?: number;
};

type Cell = {
  readonly at: string;
  readonly value: number;
  readonly band: string;
};

const bandFor = (value: number): string => {
  if (value >= 85) return 'green';
  if (value >= 65) return 'amber';
  if (value >= 45) return 'orange';
  return 'red';
};

const valueToColor = (band: string): string => {
  switch (band) {
    case 'green':
      return '#16a34a';
    case 'amber':
      return '#f59e0b';
    case 'orange':
      return '#ea580c';
    default:
      return '#dc2626';
  }
};

export const ForecastHeatMap: FC<ForecastHeatMapProps> = ({ plans, maxCells = 60 }) => {
  const profiles = useMemo(() => {
    const all: ReadonlyArray<{ planId: string; profile: ServiceReadinessProfile }> = plans.map((plan) => ({
      planId: plan.planId,
      profile: buildReadinessProfile(plan),
    }));

    const topologyProfiles = plans.map((plan) => {
      const snapshot = buildTopologySnapshot(plan);
      const topology = {
        namespace: plan.labels.short,
        region: plan.actions[0]?.region ?? 'global',
        nodes: Array.from(snapshot.nodesById.values()),
        generatedAt: toTimestamp(new Date()) as UtcIsoTimestamp,
      };
      return profileByTopology(topology, Date.now() + 120_000);
    });

    const flattened: Cell[] = all.flatMap((entry) => {
      return entry.profile.windows.slice(0, 6).map((window, index) => ({
        at: `${entry.planId}-${index}`,
        value: window.score,
        band: bandFor(window.score),
      }));
    });

    const topologyCells = topologyProfiles.flatMap((profile) =>
      profile.windows.slice(0, 2).map((window) => ({
        at: `${profile.planId}-${window.trigger}`,
        value: window.score,
        band: bandFor(window.score),
      })),
    );

    return [...flattened, ...topologyCells].slice(0, maxCells);
  }, [plans, maxCells]);

  const maxValue = Math.max(1, ...profiles.map((profile) => profile.value));

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
      <h3>Forecast heat map</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 6 }}>
        {profiles.map((cell) => {
          const ratio = cell.value / maxValue;
          const height = `${Math.max(18, Math.round(80 * ratio) + 14)}px`;
          return (
            <div
              key={cell.at}
              style={{
                height,
                borderRadius: 8,
                color: '#fff',
                background: valueToColor(cell.band),
                padding: 6,
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={`${cell.at}: ${cell.value.toFixed(2)}`}
            >
              {Math.round(cell.value)}
            </div>
          );
        })}
      </div>
      {profiles.length === 0 ? <p>No forecast windows</p> : null}
      <small>{profiles.length} cells</small>
    </section>
  );
};
