import { useMemo } from 'react';
import {
  routePreviews as runtimeRoutePreview,
} from '@shared/type-level/stress-conditional-depth-grid';
import {
  compileTemplateCatalog,
  type RoutePipelinePreview,
} from '@shared/type-level/stress-conditional-depth-grid';
import {
  runControlFlowScenario,
  type ControlMode,
  type ControlReport,
} from '@domain/recovery-lab-synthetic-orchestration';
import {
  buildTemplateOrbit,
  type BuildTemplateRouteMap,
} from '@shared/type-level/stress-mapped-template-orbit';
import {
  runInferenceGrid,
  type InstantiationMatrix,
} from '@domain/recovery-lab-synthetic-orchestration/compiler-inference-grid';
import {
  routeCatalog,
  seedCatalog,
  type WorkRoute,
  type SeverityToken,
  type WorkAction,
} from '@shared/type-level/stress-conditional-union-grid';

const toSeedRows = runtimeRoutePreview.slice(0, 12).reduce<Record<WorkRoute, RoutePipelinePreview['parsed']>>((acc, preview) => {
  acc[preview.route] = preview.parsed;
  return acc;
}, {});

const parsedCatalog = {
  ...toSeedRows,
} as Record<WorkRoute, RoutePipelinePreview['parsed']>;

void compileTemplateCatalog(parsedCatalog);

const parsedEntries = Object.entries(parsedCatalog) as readonly [WorkRoute, RoutePipelinePreview['parsed']][];

const resolveSeverity = (parsed: RoutePipelinePreview['parsed']): SeverityToken => {
  if (parsed.kind !== 'routed') {
    return 'low';
  }

  const severity = parsed.severity as 'low' | 'medium' | 'high' | 'critical' | 'emergency';
  if (severity === 'critical') return 'critical';
  if (severity === 'emergency') return 'emergency';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'notice';
  return 'low';
};

const modeOrder: readonly ControlMode[] = ['idle', 'prime', 'warm', 'execute', 'throttle', 'fallback', 'escalate', 'drain', 'verify', 'finish'];

export const TypeLevelHarnessPanel = (): React.JSX.Element => {
  const matrix: BuildTemplateRouteMap<{ route: WorkRoute; severity: SeverityToken }> = useMemo(() => {
    const orbit = buildTemplateOrbit({
      serviceName: 'dashboard-harness',
      endpoints: [
        {
          path: '/recovery/assess/harness/low',
          method: 'GET',
          payload: {
            route: '/recovery/assess/harness/low',
            severity: 'low',
          },
        },
      ],
      metadata: {
        generated: true,
      },
      options: {
        includeBody: true,
      },
    });

    return orbit as unknown as BuildTemplateRouteMap<{ route: WorkRoute; severity: SeverityToken }>;
  }, []);

  const traces = useMemo(() => {
    const rows = parsedEntries.map(([route, parsed], index) => ({
      route,
      mode: modeOrder[index % modeOrder.length] as ControlMode,
      weight: Object.keys(parsed).length,
      severity: resolveSeverity(parsed),
    }));

    return rows.map((entry) => {
      const routeValue = entry.route as WorkRoute;
      const report = runControlFlowScenario(
        [routeValue],
        entry.mode,
        {
          serviceName: `harness-${entry.route}`,
          endpoints: [{
            path: routeValue,
            method: entry.mode === 'idle' ? 'GET' : 'POST',
            payload: entry,
          }],
        },
      ) as ControlReport<WorkRoute>;

      return {
        ...entry,
        score: report.score,
        constraints: report.constraints.length,
        routeCount: report.generatedRoutes.length,
      };
    });
  }, []);

  const inference = useMemo(() => {
    const payload = runInferenceGrid({
      tenant: 'dashboard-harness',
      domain: 'recovery',
      mode: 'execute',
      count: 8,
    });
    return payload as InstantiationMatrix<ControlMode>;
  }, []);

  const harnessState = useMemo(
    () =>
      traces.reduce<{
        readonly bySeverity: Record<SeverityToken, number>;
        readonly byAction: Record<WorkAction, number>;
      }>(
        (acc, entry) => {
          acc.bySeverity[entry.severity] = (acc.bySeverity[entry.severity] ?? 0) + 1;
          const action = routeCatalog.find((candidate) => entry.route === candidate)?.split('/')[2] as WorkAction;
          acc.byAction[action] = (acc.byAction[action] ?? 0) + 1;
          return acc;
        },
        {
          bySeverity: {
            advisory: 0,
            critical: 0,
            degraded: 0,
            emergency: 0,
            high: 0,
            informational: 0,
            low: 0,
            normal: 0,
            notice: 0,
            severe: 0,
          },
          byAction: {
            assess: 0,
            archive: 0,
            assemble: 0,
            audit: 0,
            authorize: 0,
            cancel: 0,
            checkpoint: 0,
            classify: 0,
            compose: 0,
            connect: 0,
            dispatch: 0,
            discover: 0,
            drain: 0,
            escalate: 0,
            notify: 0,
            observe: 0,
            patch: 0,
            queue: 0,
            reconcile: 0,
            recover: 0,
            release: 0,
            repair: 0,
            route: 0,
            safeguard: 0,
            seal: 0,
            simulate: 0,
            suspend: 0,
            verify: 0,
          },
        },
      ),
    [traces],
  );

  const ordered = useMemo(() => Object.entries(matrix).slice(0, 20), [matrix]);

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <header>
        <h2>Type-Level Harness</h2>
        <p>
          traced {traces.length} routes, sample trace count {inference.count}, mode {inference.mode}
        </p>
      </header>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <article style={{ border: '1px solid #cbd5e1', padding: 12, borderRadius: 6 }}>
          <h4>Severity</h4>
          <ul>
            {Object.entries(harnessState.bySeverity).map(([severity, total]) => (
              <li key={severity}>
                {severity}: {total}
              </li>
            ))}
          </ul>
        </article>
        <article style={{ border: '1px solid #cbd5e1', padding: 12, borderRadius: 6 }}>
          <h4>Top route map</h4>
          <ul>
            {ordered.slice(0, 10).map(([route, payload]) => (
              <li key={route}>
                {route}: {JSON.stringify(payload).slice(0, 24)}
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article style={{ border: '1px solid #cbd5e1', padding: 12, borderRadius: 6 }}>
        <h4>Constraint dispatch preview</h4>
        <ul>
          {traces.slice(0, 24).map((entry) => (
            <li key={entry.route} style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: 'monospace' }}>{entry.route}</span>
              <span style={{ marginLeft: 10 }}>mode {entry.mode}</span>
              <span style={{ marginLeft: 10 }}>score {entry.score}</span>
              <span style={{ marginLeft: 10 }}>constraints {entry.constraints}</span>
            </li>
          ))}
        </ul>
      </article>

      <article style={{ border: '1px solid #cbd5e1', padding: 12, borderRadius: 6 }}>
        <h4>Action coverage</h4>
        <ul>
          {Object.entries(harnessState.byAction)
            .filter(([, total]) => total > 0)
            .map(([action, total]) => (
              <li key={action}>
                {action}: {total}
              </li>
            ))}
        </ul>
      </article>
    </section>
  );
};
