import { useMemo, type ReactElement } from 'react';

export interface ManifestEnvelope {
  readonly tenantId: string;
  readonly scope: string;
  readonly pluginCount: number;
  readonly planCount: number;
  readonly generatedAt: string;
  readonly labels: readonly string[];
}

const parseEnvelope = (value: string): ManifestEnvelope => {
  const [tenantId, scope, pluginCount, planCount, generatedAt] = value.split('::');
  return {
    tenantId,
    scope,
    pluginCount: Number(pluginCount ?? '0'),
    planCount: Number(planCount ?? '0'),
    generatedAt: generatedAt ?? new Date().toISOString(),
    labels: value.split(':'),
  };
}

interface ManifestExplorerProps {
  readonly manifests: readonly string[];
}

export const RecoveryLabManifestExplorer = ({ manifests }: ManifestExplorerProps): ReactElement => {
  const entries = useMemo(() => manifests.map(parseEnvelope), [manifests]);

  return (
    <section className="recovery-lab-manifest-explorer">
      <h3>Manifest Explorer</h3>
      <div className="manifest-count">entries={entries.length}</div>
      <ul>
        {entries.map((entry) => (
          <li key={
            `${entry.tenantId}:${entry.scope}:${entry.generatedAt}:${entry.pluginCount}`
          }>
            <strong>{entry.tenantId}</strong>
            <em>{entry.scope}</em>
            <p>
              plugins={entry.pluginCount} plans={entry.planCount} labels={entry.labels.join(',')} generated={entry.generatedAt}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};
