import { createPluginAdapter, ObservatoryPluginRegistry, type PluginDescriptor } from '@domain/recovery-horizon-observability';
import type { JsonLike, PluginStage } from '@domain/recovery-horizon-engine';
import { buildPayloadTemplate } from '@domain/recovery-horizon-observability';

export interface RegistryNode {
  readonly id: string;
  readonly stage: PluginStage;
  readonly route: string;
  readonly payload: JsonLike;
}

export interface RegistrySnapshot {
  readonly stages: readonly PluginStage[];
  readonly nodes: readonly RegistryNode[];
}

const ensureRoute = <T extends string>(stage: PluginStage, route: T): `${PluginStage}/${T}` =>
  `${stage}/${route}`;

const defaultAdapterPayload = (stage: PluginStage): JsonLike => ({
  stage,
  route: buildPayloadTemplate(stage),
  enabled: true,
  bootstrap: true,
});

const adapterId = (stage: PluginStage, suffix: string): `${PluginStage}:${string}` =>
  `${stage}:${suffix}`;

const normalizeKey = <T extends PluginStage>(stage: T): T => stage;

const createRegistryNode = <T extends PluginStage>(
  stage: T,
  index: number,
): PluginDescriptor<T, JsonLike> => {
  const id = adapterId(stage, `${stage}-${index}`) as unknown as Parameters<typeof createPluginAdapter>[0];
  return createPluginAdapter(
    id,
    stage,
    defaultAdapterPayload(stage),
    (tenantId, payload) => {
      const p = payload as Record<string, unknown>;
      return {
        ...p,
        tenantId,
        route: ensureRoute(stage, p.route as string),
        normalized: p.normalized ?? false,
      } as unknown as JsonLike;
    },
  );
};

export const createRuntimeRegistry = (): ObservatoryPluginRegistry<readonly PluginDescriptor[]> => {
  const registry = new ObservatoryPluginRegistry<readonly PluginDescriptor[]>('runtime');
  const stages = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const satisfies readonly PluginStage[];
  const nodes = stages.flatMap((stage, index) => [
    createRegistryNode(normalizeKey(stage), index),
    createRegistryNode(normalizeKey(stage), index + 1),
  ]);
  for (const node of nodes) {
    void registry.register(node);
  }
  return registry;
};

export const createRegistrySnapshot = (
  registry: ObservatoryPluginRegistry<readonly PluginDescriptor[]>,
): RegistrySnapshot => ({
  stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  nodes: [...registry].map((entry) => ({
    id: entry.id,
    stage: entry.stage as PluginStage,
    route: `runtime/${entry.kind}`,
    payload: entry.payload,
  })),
});
