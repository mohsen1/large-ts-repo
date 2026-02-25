import { FC, useMemo } from 'react';
import type { ScenarioSeed } from '@shared/quantum-studio-core';

type QuantumRunPanelProps = {
  readonly seed: ScenarioSeed;
  readonly signalMode: 'discovery' | 'control' | 'synthesis';
  readonly compact?: boolean;
};

const toWeightBuckets = (signals: readonly { signalId: string; tier: number; weight: number }[]) => {
  const map = new Map<number, number>();
  for (const signal of signals) {
    map.set(signal.tier, (map.get(signal.tier) ?? 0) + signal.weight);
  }
  return map;
};

export const QuantumRunPanel: FC<QuantumRunPanelProps> = ({ seed, signalMode, compact = false }) => {
  const totals = useMemo(() => toWeightBuckets(seed.profile.seedSignals), [seed.profile.seedSignals]);

  const sortedSignals = useMemo(
    () =>
      [...seed.profile.seedSignals]
        .sort((left, right) => left.signalId.localeCompare(right.signalId))
        .map((entry) => ({ ...entry, scaled: Math.min(100, Math.round(entry.weight * 100)) })),
    [seed.profile.seedSignals],
  );

  return (
    <section
      style={{
        border: '1px solid #d7dbe8',
        borderRadius: 12,
        padding: 12,
        display: 'grid',
        gap: 8,
      }}
    >
      <h3>Run seed</h3>
      <p>Tenant {seed.tenant}</p>
      <p>Scenario {seed.scenarioId}</p>
      <p>Mode {signalMode}</p>
      <p>Plugins {seed.selectedPlugins.length}</p>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 12 }}>
        <article>
          <h4>Signal buckets</h4>
          {[1, 2, 3].map((tier) => {
            const value = totals.get(tier) ?? 0;
            return (
              <p key={tier}>
                Tier {tier}: {(value * 100).toFixed(1)}%
              </p>
            );
          })}
        </article>
        <article>
          <h4>Sorted signals</h4>
          <ul>
            {sortedSignals.map((entry) => (
              <li key={entry.signalId}>
                {entry.signalId} · {entry.tier} · {entry.scaled}%
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
};
