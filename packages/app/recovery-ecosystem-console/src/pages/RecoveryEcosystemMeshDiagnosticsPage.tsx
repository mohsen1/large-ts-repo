import { useEffect, useState, useTransition } from 'react';
import type { MeshPluginDefinition, EcosystemEvent, RunId, TenantId, WorkspaceId, TimelineEventId } from '@domain/recovery-ecosystem-orchestrator-core';
import type { PluginName } from '@shared/typed-orchestration-core';
import { createMeshService, MeshDiagnosticsCollector } from '../services/meshOrchestrationService';
import { OrchestrationRunConsole } from '../components/mesh/OrchestrationRunConsole';

interface PageProps {
  readonly plugins: readonly MeshPluginDefinition[];
}

const stringify = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

export const RecoveryEcosystemMeshDiagnosticsPage = (props: PageProps) => {
  const service = createMeshService(props.plugins);
  const [events, setEvents] = useState<readonly EcosystemEvent[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const collector = new MeshDiagnosticsCollector<EcosystemEvent>();
    const unsubscribe = collector.subscribe((event) => {
      startTransition(() => {
        setEvents((current) => [...current, event]);
      });
    });

    void service.getSnapshot().then(() => {
      const tenantId = 'tenant:mesh' as TenantId;
      const workspaceId = 'workspace:diag' as WorkspaceId;
      collector.push([
        {
          kind: 'plugin.started',
          eventId: `timeline:${Date.now()}` as TimelineEventId,
          pluginId: (props.plugins[0]?.name ?? ('plugin:bootstrap' as PluginName)),
          runId: `run:${tenantId}:${workspaceId}:seed` as RunId,
          tenantId,
          workspaceId,
          at: new Date().toISOString(),
          stage: 'discover',
          inputHash: stringify({ boot: true }),
        },
        {
          kind: 'policy.adjusted',
          eventId: `timeline:${Date.now() + 1}` as TimelineEventId,
          pluginId: (props.plugins[0]?.name ?? ('plugin:bootstrap' as PluginName)),
          runId: `run:${tenantId}:${workspaceId}:seed` as RunId,
          tenantId,
          workspaceId,
          at: new Date().toISOString(),
          stage: 'model',
          policyId: 'mesh-policy',
          adjustments: ['bootstrap', 'diagnostic'],
        },
      ]);
    });

    return () => {
      unsubscribe();
      collector.push([]);
    };
  }, [props.plugins, service, startTransition]);

  return (
    <main>
      <h1>Recovery Ecosystem Mesh Diagnostics</h1>
      <OrchestrationRunConsole events={events} maxRows={100} />
      <section>
        <h2>Event stream</h2>
        <p>{events.length} events buffered</p>
        <ul>
          {events.map((event) => (
            <li key={event.eventId}>
              {event.kind}: {event.pluginId} [{event.stage}]
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
