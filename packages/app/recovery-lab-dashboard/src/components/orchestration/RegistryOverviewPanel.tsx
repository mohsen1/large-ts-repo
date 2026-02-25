import { useMemo } from 'react';
import { inspectRegistry, mapStepsToPluginIds } from '../../services/advancedStudioService';
import { hydrateCascadeCatalog } from '@shared/stress-lab-runtime/cascade-registry';
import { canonicalizeNamespace, buildPluginId, type PluginDependency } from '@shared/stress-lab-runtime/ids';
import { type PluginDefinition, type PluginContext } from '@shared/stress-lab-runtime/plugin-registry';
import type { GraphStep } from '@domain/recovery-lab-synthetic-orchestration';

interface RegistryOverviewPanelProps {
  readonly tenant: string;
  readonly namespace: string;
  readonly steps: readonly GraphStep<string>[];
}

interface RegistrySummary {
  readonly key: string;
  readonly namespace: string;
  readonly kind: string;
  readonly dependencies: number;
}

export const RegistryOverviewPanel = ({ tenant, namespace, steps }: RegistryOverviewPanelProps) => {
  const registrySummary = inspectRegistry();
  const pluginIds = useMemo(() => mapStepsToPluginIds(steps), [steps]);
  const summary = useMemo<readonly RegistrySummary[]>(() => {
    const registry = hydrateCascadeCatalog(
      canonicalizeNamespace(namespace),
      [
        {
          id: buildPluginId(canonicalizeNamespace('recovery:stress:lab'), 'stress-lab/registry', `overview-${tenant}`),
          name: 'overview-plugin',
          namespace: canonicalizeNamespace('recovery:stress:lab'),
          kind: 'stress-lab/registry',
          version: '1.0.0',
          tags: ['overview'],
          dependencies: ['dep:recovery:stress:lab'] as readonly PluginDependency[],
          config: { tenant },
          run: async (_context: PluginContext<{ tenant: string }>, input: unknown) => ({
            ok: true,
            value: input,
            generatedAt: new Date().toISOString(),
          }),
        } satisfies PluginDefinition<unknown, unknown, { tenant: string }, 'stress-lab/registry'>,
      ],
    );
    const buckets = new Map<string, RegistrySummary>();
    for (const item of registry.list()) {
      const key = `${item.namespace}:${item.kind}`;
      buckets.set(key, {
        key,
        namespace: item.namespace,
        kind: item.kind,
        dependencies: item.dependencyCount,
      });
    }
    return [...buckets.values()];
  }, [tenant, namespace]);

  const allKinds = useMemo(() => [...new Set(summary.map((entry) => entry.kind))], [summary]);

  return (
    <section style={{ border: '1px solid #93c5fd', padding: 12, borderRadius: 12, background: '#f8fafc' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Registry Overview</h3>
        <code>{registrySummary.namespace}</code>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <article>
          <strong>Fingerprint</strong>
          <p style={{ fontFamily: 'monospace', margin: '4px 0' }}>{registrySummary.fingerprint}</p>
        </article>
        <article>
          <strong>Registered kinds</strong>
          <p style={{ margin: '4px 0' }}>{allKinds.join(', ') || 'none'}</p>
        </article>
      </div>
      <div style={{ marginBottom: 12 }}>
        <strong>Namespace</strong>: {namespace}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {summary.map((entry) => (
          <li
            key={entry.key}
            style={{
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: 8,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{entry.namespace}</span>
            <span>
              kind={entry.kind} deps={entry.dependencies}
            </span>
          </li>
        ))}
      </ul>
      <footer style={{ marginTop: 10, display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>plugin ids</div>
        <div style={{ fontFamily: 'monospace' }}>{pluginIds.slice(0, 3).join(', ')}</div>
      </footer>
    </section>
  );
};
