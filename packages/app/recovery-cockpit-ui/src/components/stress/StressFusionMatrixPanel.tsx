import { useMemo, useState } from 'react';
import {
  allFusionRoutes,
  classifyRoute,
  routeResolver,
  routeVerbPriority,
  routeActionClass,
  routeClassLabel,
  type FusionRoute,
  type RouteTuple,
} from '@shared/type-level/stress-conditional-fusion-matrix';
import { executeControlFlow, type BranchTag } from '@shared/type-level/stress-controlflow-galaxy';
import { routeLabyrinthCatalog } from '@shared/type-level/stress-template-route-labyrinth';

type GridItem = {
  readonly route: FusionRoute;
  readonly score: number;
  readonly actionClass: ReturnType<typeof routeActionClass>;
};

const routePriorityRank = (route: FusionRoute): number => {
  const tuple = route.split('/') as unknown as RouteTuple;
  return (routeVerbPriority[tuple[1] as keyof typeof routeVerbPriority] ?? 0) + tuple[2].length;
};

export const StressFusionMatrixPanel = () => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<FusionRoute>(allFusionRoutes[0] as FusionRoute);

  const catalogRows = useMemo(() => {
    const mapped: GridItem[] = allFusionRoutes.map((route) => ({
      route,
      score: routePriorityRank(route),
      actionClass: routeActionClass(route.split('/')[1] as string),
    }));
    const filtered = mapped.filter((row) => !query || row.route.includes(query.toLowerCase()));
    return filtered.toSorted((left, right) => right.score - left.score);
  }, [query]);

  const selectedMeta = classifyRoute(selected);
  const details = routeResolver(selected);

  const routeRows = Object.entries(routeLabyrinthCatalog).map(([key, entry]) => {
    const [domain, action, entity] = entry.route.split('/');
    return {
      key,
      route: entry.route,
      action,
      domain,
      entity,
    };
  });

  const branchTrace = executeControlFlow(
    catalogRows.map((row) => ({
      tag: `branch-0${Math.min(9, row.route.length % 9)}` as BranchTag,
      severity: row.actionClass === 'recovery' ? 'critical' : 'medium',
      payload: row.score,
    })),
  );

  return (
    <section style={{ border: '1px dashed #354d91', borderRadius: 12, padding: 12, background: '#08132a' }}>
      <h3 style={{ marginTop: 0 }}>Stress matrix panel</h3>
      <div style={{ marginBottom: 8 }}>
        <input
          style={{ width: '100%', padding: 8 }}
          value={query}
          placeholder="route search"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <h4>Top routes</h4>
          {catalogRows.slice(0, 16).map((item) => {
            const selectedClass = selected === item.route ? 'selected' : '';
            return (
              <button
                type="button"
                key={item.route}
                style={{
                  display: 'block',
                  width: '100%',
                  marginBottom: 6,
                  border: selectedClass ? '1px solid #89b4ff' : '1px solid #4f5f7e',
                  padding: 6,
                  background: selectedClass ? '#12264c' : '#111c36',
                  color: '#f3f7ff',
                  textAlign: 'left',
                }}
                onClick={() => setSelected(item.route)}
              >
                <div>{item.route}</div>
                <small className={item.actionClass}>
                  {' '}
                  score={item.score}
                </small>
              </button>
            );
          })}
        </div>
        <div>
          <h4>Details</h4>
          <div>domain={selectedMeta.domain}</div>
          <div>action={selectedMeta.action}</div>
          <div>entity={selectedMeta.entity}</div>
          <div>class={selectedMeta.actionClass}</div>
          <div>severity={selectedMeta.severity}</div>
          <div>score={details.score}</div>
          <div>plane={routeClassLabel(details.actionClass)}</div>
        </div>
      </div>
      <h4 style={{ marginTop: 8 }}>Route lab mapping</h4>
      <div>
        {routeRows.map((entry) => (
          <div
            key={entry.key}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: 4 }}
          >
            <span>{entry.key}</span>
            <span>{entry.domain}</span>
            <span>{entry.action}</span>
          </div>
        ))}
      </div>
      <h4 style={{ marginTop: 8 }}>Branch trace</h4>
      <pre style={{ maxHeight: 140, overflowY: 'auto', background: '#050d1f', padding: 8 }}>
{JSON.stringify(branchTrace, null, 2)}
      </pre>
    </section>
  );
};
