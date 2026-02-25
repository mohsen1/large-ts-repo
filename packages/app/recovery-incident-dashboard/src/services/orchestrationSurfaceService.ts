import { createSurfaceRuntime, runBootstrapSurface, type RuntimeSessionResult } from '@shared/recovery-orchestration-surface';
import { createSurfaceWorkspaceId, type SurfaceWorkspaceId } from '@shared/recovery-orchestration-surface';
import type {
  SurfaceWorkspaceDescriptor,
  SurfaceWorkspaceEvent,
  SurfaceSummary,
  SurfaceWorkspaceState,
} from '../types/recoveryOrchestrationSurface';
import type { SurfaceLaneKind } from '@shared/recovery-orchestration-surface';

const now = (): number => Date.now();

const workspaceFromSeed = (seed: string): SurfaceWorkspaceDescriptor => ({
  workspaceId: createSurfaceWorkspaceId('us-east-1', seed),
  tenant: seed.includes(':') ? seed.split(':')[0] : seed,
  domain: 'recovery-surface',
  zone: 'us-east-1',
  status: 'idle',
  createdAt: now(),
});

export class SurfaceWorkspaceService {
  readonly #seed: string;

  constructor(seed: string) {
    this.#seed = seed;
  }

  async bootstrap(): Promise<SurfaceWorkspaceState> {
    await createSurfaceRuntime(this.#seed, {
      tenant: this.#seed,
      domain: 'recovery-surface',
      zone: 'us-east-1',
    });
    const summary = await runBootstrapSurface(this.#seed);

    const workspace = workspaceFromSeed(this.#seed);
    return this.normalizeWorkspaceState(workspace, summary, 'warming', {
      kind: 'boot',
      workspace,
    });
  }

  async run(kind: SurfaceLaneKind, payload: Record<string, unknown>): Promise<SurfaceWorkspaceState> {
    const runtime = await createSurfaceRuntime(this.#seed, {
      tenant: this.#seed,
      domain: 'recovery-surface',
    });
    const result = await runtime.run(kind, payload);

    const workspace = workspaceFromSeed(this.#seed);
    const baseEvents: SurfaceWorkspaceEvent = {
      kind: 'run',
      workspaceId: workspace.workspaceId,
      score: result.score,
      records: result.records.length,
    };

    return this.normalizeWorkspaceState(workspace, result, result.ready ? 'ready' : 'error', baseEvents);
  }

  async getSummary(): Promise<SurfaceSummary> {
    const workspace = workspaceFromSeed(this.#seed);
    return {
      workspace: workspace,
      laneCount: 0,
      pluginCount: 0,
      pluginCountByKind: {
        ingest: 0,
        synthesize: 0,
        simulate: 0,
        score: 0,
        actuate: 0,
      },
      pluginKinds: [],
      tags: ['tenant:uninitialized'],
    };
  }

  private normalizeWorkspaceState(
    workspace: SurfaceWorkspaceDescriptor,
    result: RuntimeSessionResult,
    status: SurfaceWorkspaceDescriptor['status'],
    event: SurfaceWorkspaceEvent,
  ): SurfaceWorkspaceState {
    const context = {
      workspaceId: workspace.workspaceId,
      lane: `lane:${workspace.workspaceId}:runtime`,
      stage: 'runtime',
      metadata: {
        tenant: workspace.tenant,
        domain: workspace.domain,
        namespace: 'runtime',
        createdAt: now(),
        region: workspace.zone,
        createdBy: 'surface-ui',
      },
      createdAt: now(),
    };

    const records = result.records.map((record) => ({
      pluginId: `${record.pluginId}`,
      ok: record.ok,
      latency: record.endedAt - record.startedAt,
    }));

    const signal: SurfaceWorkspaceState['signals'] = result.eventIds.map((eventId, index) => ({
      signalId: eventId,
      kind: index % 2 === 0 ? 'state' : 'tick',
      workspaceId: workspace.workspaceId as SurfaceWorkspaceId,
      generatedAt: now() + index,
      value: event,
      ttlSeconds: 30,
    }));

    return {
      workspace: {
        ...workspace,
        status,
      },
      context,
      records,
      signals: signal,
      tags: this.deriveTags(event, workspace),
    };
  }

  private deriveTags(event: SurfaceWorkspaceEvent, workspace: SurfaceWorkspaceDescriptor): readonly string[] {
    const base = [`tenant:${workspace.tenant}`, `domain:${workspace.domain}`, `status:${workspace.status}`];
    const eventTag = event.kind === 'boot' ? `boot:${workspace.workspaceId}` : `run:${event.kind === 'run' ? event.workspaceId : workspace.workspaceId}`;
    return [...base, eventTag, `zone:${workspace.zone}`] as const;
  }
}
