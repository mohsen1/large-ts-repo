import { useMemo, useState, type ReactElement } from 'react';
import {
  type WindowMode,
  type WindowPolicy,
  defaultWindowPolicy,
  asWindowPriority,
  observerNamespace,
  type PolicyContext,
} from '@domain/recovery-lens-observability-models';
import { renderPolicyMatrix, useRecoveryLensPolicies } from '../hooks/useRecoveryLensPolicies';

export const FabricPolicyCard = ({ namespace }: { readonly namespace: string }): ReactElement => {
  const policies = useRecoveryLensPolicies(namespace);
  const [selectedMode, setSelectedMode] = useState<WindowMode>('realtime');

  const policyRows = useMemo(
    () =>
      policies.map((policy, index) => ({
        index,
        name: policy,
        enabled: index % 2 === 0,
        mode: selectedMode,
      })),
    [policies, selectedMode],
  );

  const buildPolicy = (mode: WindowMode): WindowPolicy => ({
    ...defaultWindowPolicy,
    namespace: observerNamespace(namespace),
    window: `window:${mode}` as WindowPolicy['window'],
    mode,
    ttlMs: mode === 'realtime' ? 1000 : 5000,
    priority: asWindowPriority(mode === 'snapshot' ? 8 : 5),
  });

  const context: PolicyContext = {
    stage: 'ingest',
    namespace: observerNamespace(namespace),
    policy: `policy:${namespace}` as PolicyContext['policy'],
    window: buildPolicy('realtime').window,
    mode: selectedMode,
    priority: buildPolicy(selectedMode).priority,
  };

  return (
    <article>
      <h3>Policy card</h3>
      <p>Namespace: {context.namespace}</p>
      <div>
        <label>
          Window mode
          <select value={selectedMode} onChange={(event) => setSelectedMode(event.currentTarget.value as WindowMode)}>
            <option value="realtime">realtime</option>
            <option value="snapshot">snapshot</option>
            <option value="backfill">backfill</option>
            <option value="simulation">simulation</option>
          </select>
        </label>
      </div>

      <ul>
        {policyRows.map((row) => (
          <li key={row.name}>
            {row.index} {row.name} {String(row.enabled)} {row.mode}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => renderPolicyMatrix(policies)}>
        Render matrix
      </button>
    </article>
  );
};
