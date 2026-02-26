import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import { StressCatalogRouteMatrix } from '../components/StressCatalogRouteMatrix';
import { StressPolicyComposer } from '../components/StressPolicyComposer';
import { useStressTemplateCatalog } from '../hooks/useStressTemplateCatalog';

type CommandIntent = {
  readonly route: string;
  readonly isCritical: boolean;
};

const severityPalette = {
  low: '#2f855a',
  medium: '#d97706',
  high: '#c53030',
  critical: '#7b341e',
  emergency: '#9b2c2c',
} as const;

const intentLabel = (intent: CommandIntent): string => (intent.isCritical ? 'critical-route' : 'normal-route');

export const RecoveryLabStressTemplateStudioPage = (): JSX.Element => {
  const { catalog, loaded, sections, total } = useStressTemplateCatalog();
  const [selected, setSelected] = useState<CommandIntent>({ route: '', isCritical: false });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const orderedSections = useMemo(() => [...sections].sort(), [sections]);
  const routeList = useMemo(
    () => catalog.filter((item) => item.route.length > 0),
    [catalog],
  );

  const severityClassify = (route: string): string => {
    const severity = route.split(':')[2];
    return severityPalette[(severity as keyof typeof severityPalette) ?? 'low'];
  };

  const onInspect = (route: string) => {
    setSelected({
      route,
      isCritical: route.includes('critical') || route.includes('emergency'),
    });
  };

  const onInspectMatrix = (route: string, isCritical: boolean) => {
    setSelected({ route, isCritical });
  };

  const details = useMemo(() => {
    if (!selected.route) {
      return 'No route selected';
    }
    const parts = selected.route.split(':');
    return `${parts[0]} / ${parts[1]} / ${parts[2]} / ${parts[3] ?? 'n/a'} (${intentLabel(selected)})`;
  }, [selected]);

  const summary = useMemo(() => {
    const buckets = orderedSections.reduce<Record<string, number>>((acc, section) => {
      acc[section] = catalog.filter((entry) => entry.action.includes(section)).length;
      return acc;
    }, {});
    return Object.entries(buckets).map(([section, count]) => ({ section, count }));
  }, [catalog, orderedSections]);

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Recovery Lab Stress Template Studio</h1>
      <section style={{ border: '1px solid #dce0e7', borderRadius: 8, padding: 12 }}>
        <h2>Status</h2>
        <p>{`loaded: ${loaded}`}</p>
        <p>{`rows: ${total}`}</p>
        <p>{`sections: ${orderedSections.join(', ')}`}</p>
      </section>
      <section style={{ display: 'grid', gap: 12 }}>
        {summary.map((entry) => (
          <article key={entry.section} style={{ border: '1px solid #edf0f3', borderRadius: 6, padding: 8 }}>
            <h3>{entry.section}</h3>
            <p>count: {entry.count}</p>
          </article>
        ))}
      </section>
      <button type="button" onClick={() => setShowAdvanced((previous) => !previous)}>
        {showAdvanced ? 'Hide matrix' : 'Show matrix'}
      </button>
      <StressPolicyComposer rows={routeList} onSelect={(route) => onInspect(route)} />
      {showAdvanced ? (
        <StressCatalogRouteMatrix catalog={routeList.map((row) => `${row.action}:${row.domain}:${row.severity}:${row.id}`)} onHighlight={onInspectMatrix} />
      ) : null}
      <section style={{ border: '1px solid #dce0e7', borderRadius: 8, padding: 12 }}>
        <h2>Selected Route</h2>
        <p style={{ color: severityClassify(selected.route) }}>{details}</p>
      </section>
    </main>
  );
};
