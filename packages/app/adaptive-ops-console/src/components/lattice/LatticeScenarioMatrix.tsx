import { useMemo } from 'react';
import { type LatticeBlueprintManifest, isSupportedKind } from '@domain/recovery-lattice';
import type { ReactElement } from 'react';

export type ScenarioSeed = {
  readonly id: string;
  readonly label: string;
  readonly mode: 'analysis' | 'validation' | 'execution' | 'rehearsal';
  readonly weight: number;
};

type Props = {
  readonly mode: 'analysis' | 'validation' | 'execution' | 'rehearsal';
  readonly blueprints: readonly LatticeBlueprintManifest[];
  readonly selectedBlueprintId: string;
  readonly onSeed: (seed: ScenarioSeed) => void;
};

const isSupported = (kind: string): kind is ScenarioSeed['mode'] => {
  return kind === 'analysis' || kind === 'validation' || kind === 'execution' || kind === 'rehearsal';
};

const scoreSeed = (blueprint: LatticeBlueprintManifest): number => {
  const kinds = [...blueprint.steps].map((step) => step.kind);
  return kinds.some((kind) => isSupportedKind(kind)) ? kinds.length : kinds.length / 2;
};

const toSeed = (blueprint: LatticeBlueprintManifest): ScenarioSeed[] =>
  ['analysis', 'validation', 'execution', 'rehearsal'].map((mode, index) => ({
    id: `${blueprint.tenantId}:${blueprint.name}:${mode}`,
    label: `${blueprint.name} ${mode}`,
    mode: isSupported(mode) ? mode : 'analysis',
    weight: scoreSeed(blueprint) * (index + 1),
  }));

export const LatticeScenarioMatrix = ({
  mode,
  blueprints,
  selectedBlueprintId,
  onSeed,
}: Props): ReactElement => {
  const matrix = useMemo(
    () =>
      blueprints.flatMap((blueprint) => {
        const seeds = toSeed(blueprint);
        const selected = selectedBlueprintId === `${blueprint.tenantId}:${blueprint.name}:${blueprint.version}`;
        return seeds.map((seed) => ({
          ...seed,
          active: seed.mode === mode,
          selected: selected,
        }));
      }),
    [blueprints, mode, selectedBlueprintId],
  );

  const rows = matrix.toSorted((left, right) => right.weight - left.weight);

  const modeBuckets = rows.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.mode] = (acc[entry.mode] ?? 0) + entry.weight;
    return acc;
  }, {});

  return (
    <section className="lattice-scenario-matrix">
      <header>
        <h3>Scenario Matrix</h3>
        <p>
          total={rows.length} analysis={modeBuckets.analysis ?? 0} validation={modeBuckets.validation ?? 0}
        </p>
      </header>

      <ul className="scenario-list">
        {rows.map((entry) => (
          <li
            key={entry.id}
            className={`scenario-item ${entry.active ? 'active' : ''} ${entry.selected ? 'selected' : ''}`}
          >
            <button type="button" onClick={() => onSeed(entry)}>
              <strong>{entry.label}</strong>
              <small>{entry.mode}</small>
              <em>{entry.weight.toFixed(1)}</em>
            </button>
          </li>
        ))}
        {rows.length === 0 ? <li className="empty">No scenarios available</li> : null}
      </ul>
    </section>
  );
};
