import { useMemo } from 'react';
import type {
  ControlPlaneRoute,
  ControlPlaneCommand,
} from '@domain/recovery-operations-control-plane';

interface ControlPlaneCommandTimelineProps {
  readonly routes: readonly ControlPlaneRoute[];
  readonly commands: readonly ControlPlaneCommand[];
  readonly onRefresh: () => Promise<void>;
}

interface GroupedRoute {
  readonly route: ControlPlaneRoute;
  readonly commands: readonly ControlPlaneCommand[];
}

const bucket = (
  routes: readonly ControlPlaneRoute[],
  commands: readonly ControlPlaneCommand[],
): readonly GroupedRoute[] => {
  const commandByTenant = new Map<string, ControlPlaneCommand[]>();
  for (const command of commands) {
    const key = command.runId as string;
    const list = commandByTenant.get(key) ?? [];
    list.push(command);
    commandByTenant.set(key, list);
  }

  return routes.map((route) => {
    const key = route.tenant;
    return {
      route,
      commands: commandByTenant.get(key) ?? [],
    };
  });
};

const toRouteLabel = (route: ControlPlaneRoute): string => `${route.topic} (${route.routeId})`;

export const ControlPlaneCommandTimeline = ({ routes, commands, onRefresh }: ControlPlaneCommandTimelineProps) => {
  const grouped = useMemo(() => bucket(routes, commands), [routes, commands]);
  const counts = useMemo(
    () =>
      grouped.map((entry) => ({
        total: entry.commands.length,
        route: toRouteLabel(entry.route),
      })),
    [grouped],
  );

  const totalCommands = commands.reduce((sum, command) => sum + command.command.length + command.id.length, 0);

  return (
    <section className="control-plane-command-timeline">
      <header>
        <h3>Route-command timeline</h3>
        <button type="button" onClick={() => { void onRefresh(); }}>Refresh timeline</button>
      </header>
      <p>{counts.length} routes, {commands.length} commands</p>
      <p>Payload signal: {totalCommands}</p>
      <div className="route-matrix">
        {counts.map((entry) => (
          <article key={entry.route} className="route-row">
            <header>{entry.route}</header>
            <div>commands: {entry.total}</div>
            <section>
              {grouped
                .find((candidate) => toRouteLabel(candidate.route) === entry.route)
                ?.commands.map((command) => (
                  <div key={command.id}>
                    <span>{command.id}</span>
                    <span>{command.command}</span>
                    <span>{command.createdAt.slice(11, 19)}</span>
                  </div>
                ))}
            </section>
          </article>
        ))}
      </div>
    </section>
  );
};
