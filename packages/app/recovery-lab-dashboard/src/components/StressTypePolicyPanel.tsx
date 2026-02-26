import type { JSX } from 'react';
import { useMemo } from 'react';
import { stressConditionalGraph } from '@shared/type-level';

type StressCatalog = typeof stressConditionalGraph.stressLabCatalog;
type StressVerb = stressConditionalGraph.StressLabVerb;
type ChainBranch = stressConditionalGraph.StressLabBranch<StressCatalog[number]>;
type BranchByNoInfer = `${string}:${string}:${string}:${string}`;
type StressLabDashboardRow = {
  readonly action: string;
  readonly domain: string;
  readonly severity: string;
  readonly id: string;
  readonly raw: string;
  readonly route: string;
  readonly signature: string;
};
const parseChain = (command: StressCatalog[number]): ChainBranch =>
  stressConditionalGraph.parseLabChain(command as unknown as string) as unknown as ChainBranch;
const stressCatalog = stressConditionalGraph.stressLabCatalog;

type RouteRecord = {
  readonly route: string;
  readonly verb: StressVerb;
  readonly command: string;
  readonly branch: ChainBranch;
};

type PanelProps = {
  readonly rows: readonly StressLabDashboardRow[];
  readonly signatures: readonly string[];
  readonly signaturesByNoInfer: readonly BranchByNoInfer[];
  readonly onInspect: (route: string) => void;
};

const normalize = (routes: readonly StressLabDashboardRow[]): Record<string, number> => {
  return routes.reduce<Record<string, number>>((acc, row) => {
    acc[row.action] = (acc[row.action] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

const previewRoute = (route: string): string => route.includes('/') ? route : route.replaceAll(':', '/');

const buildRouteRows = (catalog: StressCatalog): readonly RouteRecord[] =>
  catalog.map((item) => {
    const row = parseChain(item);
    return {
      route: row.path,
      verb: row.verb as StressVerb,
      command: item,
      branch: row,
    };
  });

export const StressTypePolicyPanel = ({ rows, signatures, signaturesByNoInfer, onInspect }: PanelProps): JSX.Element => {
  const severityTotals = useMemo(() => normalize(rows), [rows]);
  const routeRows = useMemo(() => buildRouteRows(stressCatalog as StressCatalog), []);
  const routeSet = useMemo(() => new Set(signatures), [signatures]);
  const normalized = useMemo(
    () =>
      signaturesByNoInfer.reduce<Record<string, number>>((acc, signature) => {
        const [verb, domain] = signature.split(':');
        const key = `${verb}:${domain}`;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    [signaturesByNoInfer],
  );

  const samplePayload = signatures.reduce<readonly string[]>((acc, route) => [...acc, previewRoute(route)], [] as readonly string[]);

  return (
    <section style={{ border: '1px solid #dfe3e8', padding: 12, borderRadius: 8 }}>
      <h3>Stress Type Policy Panel</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <h4>By Verb</h4>
          <ul>
            {Object.entries(severityTotals).map(([verb, count]) => (
              <li key={verb}>
                {verb}: {count}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>By Domain</h4>
          <ul>
            {Object.entries(normalized)
              .sort((left, right) => right[1] - left[1])
              .map(([route, count]) => (
                <li key={route}>
                  {route}: {count}
                </li>
              ))}
          </ul>
        </div>
        <h4>Route Signatures</h4>
        <ul>
          {routeRows.slice(0, 12).map((entry) => (
            <li key={entry.route}>
              <button
                type="button"
                onClick={() => onInspect(entry.route)}
                style={{ display: 'inline-flex', gap: 8 }}
              >
                <span>{entry.command}</span>
                <span>→</span>
                <span>{entry.branch.gate}</span>
              </button>
            </li>
          ))}
        </ul>
        <h4>Payload Preview</h4>
        <ul>
          {samplePayload.slice(0, 8).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Total known routes: {routeSet.size}</p>
      </div>
    </section>
  );
};
