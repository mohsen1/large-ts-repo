import { useMemo } from 'react';
import { rawRouteTemplateSource, nestedRemap, mapTemplateWithTemplateLiteral } from '@shared/type-level/stress-template-route-fabric';
import { nestedRemap as mapMapped, type NestedRemapMap } from '@shared/type-level/stress-template-route-fabric';

type AtlasMode = 'domain' | 'verbatim' | 'mapped';

type AtlasRow = Readonly<{
  readonly domain: string;
  readonly verb: string;
  readonly identifier: string;
  readonly metricCount: number;
  readonly alias: string;
  readonly metrics: readonly string[];
}>;

const summarize = (rows: readonly AtlasRow[]) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.domain] = (acc[row.domain] ?? 0) + row.metricCount;
    return acc;
  }, {});

export const StressTemplateAtlasPanel = (): React.JSX.Element => {
  const templateRows = useMemo(() => mapTemplateWithTemplateLiteral(rawRouteTemplateSource), []);
  const mapped = useMemo(() => nestedRemap(rawRouteTemplateSource), []);
  const remapped = useMemo(
    () => mapMapped(rawRouteTemplateSource) as NestedRemapMap<typeof rawRouteTemplateSource>,
    [],
  );

  const rows = useMemo(() => {
    const entries = Object.entries(rawRouteTemplateSource).flatMap(([domain, verbs]) =>
      Object.entries(verbs).map(([verb, value]) => ({
        domain,
        verb,
        identifier: value.identifier,
        metricCount: value.metrics.length,
        alias: `alias.${domain}.${verb}.${value.identifier}`,
        metrics: value.metrics,
      })),
    );
    return entries as readonly AtlasRow[];
  }, []);

  const atlas = useMemo(() => summarize(rows), [rows]);
  const domainRows = useMemo(() => Object.keys(atlas).join(', '), [atlas]);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h3>Stress Template Atlas</h3>
      <p>entries {rows.length}</p>
      <p>domains {domainRows}</p>
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((row) => {
          return (
            <article key={`${row.domain}:${row.verb}:${row.identifier}`} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
              <strong>{row.domain}/{row.verb}</strong>
              <p style={{ margin: '4px 0' }}>{row.alias}</p>
              <small>identifier {row.identifier}</small>
              <small style={{ display: 'block' }}>metrics {row.metricCount}</small>
            </article>
          );
        })}
      </div>
      <details>
        <summary>Template paths</summary>
        <pre style={{ background: '#f8fafc', padding: 10 }}>{templateRows.join('\n')}</pre>
      </details>
      <details>
        <summary>Mapped keys</summary>
        <pre style={{ background: '#f8fafc', padding: 10 }}>{JSON.stringify(mapped, null, 2)}</pre>
      </details>
      <details>
        <summary>Nested remap</summary>
        <pre style={{ background: '#f8fafc', padding: 10 }}>{JSON.stringify(remapped, null, 2)}</pre>
      </details>
      <style>{'.stress-atlas pre { white-space: pre-wrap; }'}</style>
    </section>
  );
};

