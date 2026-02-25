import { useId } from 'react';
import type { PolicyPatch } from '../types';

interface ChroniclePolicyComposerProps {
  readonly patch: PolicyPatch;
  readonly disabled: boolean;
  readonly onPatchChange: (patch: PolicyPatch) => void;
}

const tierLabels = ['p0', 'p1', 'p2', 'p3'] as const;

type TierLabel = (typeof tierLabels)[number];

export const ChroniclePolicyComposer = ({ patch, disabled, onPatchChange }: ChroniclePolicyComposerProps) => {
  const parallelismId = useId();
  const confidenceId = useId();

  return (
    <section>
      <h3>Policy composer</h3>
      <label htmlFor={parallelismId}>Max parallelism</label>
      <input
        id={parallelismId}
        type="range"
        min={1}
        max={32}
        step={1}
        disabled={disabled}
        value={patch.maxParallelism}
        onChange={(event) => {
          onPatchChange({
            ...patch,
            maxParallelism: Number.parseInt(event.target.value, 10),
          });
        }}
      />
      <output>{patch.maxParallelism}</output>
      <label htmlFor={confidenceId}>Minimum confidence</label>
      <input
        id={confidenceId}
        type="range"
        min={0}
        max={100}
        disabled={disabled}
        value={Math.round(patch.minConfidence * 100)}
        onChange={(event) => {
          onPatchChange({
            ...patch,
            minConfidence: Number.parseInt(event.target.value, 10) / 100,
          });
        }}
      />
      <output>{patch.minConfidence.toFixed(2)}</output>
      <label>Allowed tiers</label>
      <div>
        {tierLabels.map((tier: TierLabel) => {
          const enabled = patch.allowedTiers.includes(tier);
          return (
            <button
              key={tier}
              type="button"
              disabled={disabled}
              aria-pressed={enabled}
              onClick={() => {
                const next = enabled ? patch.allowedTiers.filter((entry) => entry !== tier) : [...patch.allowedTiers, tier];
                onPatchChange({ ...patch, allowedTiers: next });
              }}
            >
              {tier}
            </button>
          );
        })}
      </div>
      <fieldset>
        <legend>Mode</legend>
        {(['strict', 'adaptive', 'simulated'] as const).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="orchestrator-mode"
              disabled={disabled}
              checked={patch.mode === mode}
              onChange={() => {
                onPatchChange({ ...patch, mode });
              }}
            />
            {mode}
          </label>
        ))}
      </fieldset>
    </section>
  );
};
