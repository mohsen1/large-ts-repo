import { useMemo } from 'react';
import type { ChangeEvent } from 'react';
import type { ReadinessLabPluginStatus } from '../types';

interface ReadinessLabControlsProps {
  readonly tenant: string;
  readonly namespace: string;
  readonly pluginStates: readonly ReadinessLabPluginStatus[];
  readonly onTenantChange: (tenant: string) => void;
  readonly onNamespaceChange: (namespace: string) => void;
  readonly onRun: () => void | Promise<void>;
}

export const ReadinessLabControls = ({
  tenant,
  namespace,
  pluginStates,
  onTenantChange,
  onNamespaceChange,
  onRun,
}: ReadinessLabControlsProps) => {
  const enabled = pluginStates.filter((plugin) => plugin.enabled).length;
  const disabled = pluginStates.filter((plugin) => !plugin.enabled).length;

  const header = useMemo(() => `${tenant || 'tenant'} / ${namespace || 'namespace'}`, [tenant, namespace]);

  return (
    <section className="readiness-lab-controls">
      <h2>{header}</h2>
      <label>
        Tenant
        <input value={tenant} onChange={(event: ChangeEvent<HTMLInputElement>) => onTenantChange(event.target.value)} />
      </label>
      <label>
        Namespace
        <input
          value={namespace}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onNamespaceChange(event.target.value)}
        />
      </label>
      <p>
        plugins enabled: {enabled} · disabled: {disabled}
      </p>
      <button type="button" onClick={onRun}>
        Run Orchestrator
      </button>
      <ul>
        {pluginStates.map((plugin) => (
          <li key={plugin.id}>
            {plugin.name} · {plugin.state} · {plugin.warnings.join(',')}
          </li>
        ))}
      </ul>
    </section>
  );
};
