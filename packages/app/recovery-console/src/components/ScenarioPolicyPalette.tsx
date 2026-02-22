import { useMemo } from 'react';

export interface ScenarioSignalPolicy {
  readonly id: string;
  readonly name: string;
  readonly mode: 'manual' | 'auto' | 'staged';
  readonly confidence: number;
  readonly enabled: boolean;
}

export interface ScenarioPolicyPaletteProps {
  readonly policies: readonly ScenarioSignalPolicy[];
  readonly onSelectPolicy: (policyId: string) => void;
  readonly onTogglePolicy: (policyId: string) => void;
}

export const ScenarioPolicyPalette = ({ policies, onSelectPolicy, onTogglePolicy }: ScenarioPolicyPaletteProps) => {
  const sorted = useMemo(() => [...policies].sort((left, right) => right.confidence - left.confidence), [policies]);

  if (policies.length === 0) {
    return <p className="policy-palette-empty">No policies discovered</p>;
  }

  return (
    <section className="policy-palette">
      <h3>Signal policy palette</h3>
      <div className="policy-list">
        {sorted.map((policy) => (
          <article key={policy.id} className={`policy-card ${policy.enabled ? 'enabled' : 'disabled'}`}>
            <header>
              <button type="button" onClick={() => onSelectPolicy(policy.id)}>
                {policy.name}
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={policy.enabled}
                  onChange={() => onTogglePolicy(policy.id)}
                />
                enabled
              </label>
            </header>

            <p className="policy-mode">Mode: {policy.mode}</p>
            <p className="policy-score">Confidence: {policy.confidence}%</p>
            <div className="policy-bar-wrap">
              <div className="policy-bar" style={{ width: `${policy.confidence}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
