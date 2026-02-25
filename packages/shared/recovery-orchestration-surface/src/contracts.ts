import { z } from 'zod';
import type {
  SurfaceLaneId,
  SurfacePluginId,
  SurfaceRuntimeContext,
  SurfaceRuntimeState as IdentitySurfaceRuntimeState,
  SurfaceSignalId,
  SurfaceWorkspaceId,
  SurfaceTelemetryId,
  SurfaceMetadata,
} from './identity';

export const surfaceLaneKinds = ['ingest', 'synthesize', 'simulate', 'score', 'actuate'] as const;
export const surfaceSignalKinds = ['metric', 'topology', 'forecast', 'command', 'state'] as const;
export const surfaceEventKinds = ['tick', 'state', 'health', 'artifact', 'audit'] as const;

export type SurfaceLaneKind = (typeof surfaceLaneKinds)[number];
export type SurfaceSignalKind = (typeof surfaceSignalKinds)[number];
export type SurfaceEventKind = (typeof surfaceEventKinds)[number];
export type SurfaceRuntimeStage = 'bootstrap' | 'runtime' | 'saturated' | 'recovered' | 'standby';

export interface SurfaceSignalEnvelope {
  readonly signalId: SurfaceSignalId;
  readonly kind: SurfaceEventKind;
  readonly workspaceId: SurfaceWorkspaceId;
  readonly generatedAt: number;
  readonly value: unknown;
  readonly ttlSeconds: number;
}

export const surfaceSignalEnvelopeSchema = z.object({
  signalId: z.string(),
  kind: z.enum(surfaceEventKinds),
  workspaceId: z.string(),
  generatedAt: z.number(),
  value: z.unknown(),
  ttlSeconds: z.number().int().nonnegative(),
});

type PluginShape<TKind extends SurfaceLaneKind> = TKind extends 'ingest'
  ? {
      mode: 'pull' | 'event';
      source: string;
    }
  : TKind extends 'synthesize'
    ? {
        model: string;
        prompt: string;
      }
    : TKind extends 'simulate'
      ? {
          iterations: number;
          scenarioId: string;
        }
      : TKind extends 'score'
        ? {
            model: 'risk' | 'readiness' | 'slo';
            benchmark: number;
          }
        : {
            command: string;
            dryRun: boolean;
          };

export interface SurfacePluginContract<
  TKind extends SurfaceLaneKind = SurfaceLaneKind,
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: SurfacePluginId;
  readonly kind: TKind;
  readonly lane: SurfaceLaneId;
  readonly name: string;
  readonly description: string;
  readonly workspaceId: SurfaceWorkspaceId;
  readonly dependencies: readonly SurfacePluginId[];
  readonly telemetryId: SurfaceTelemetryId;
  readonly shape: PluginShape<TKind> & { kind: TKind };
  readonly input: TInput;
  readonly run: (input: TInput, context: SurfaceRuntimeContext) => Promise<TOutput> | TOutput;
  readonly outputSample?: TOutput;
  readonly schemaVersion: number;
  readonly active: boolean;
  readonly maxConcurrency: number;
  readonly priority: number;
}

type PluginTuple = readonly SurfacePluginContract[];

type RemapPluginByKind<TCatalog extends PluginTuple> = {
  [Plugin in TCatalog[number] as Plugin['kind']]: Plugin extends { outputSample: infer TOutput } ? TOutput : Record<string, unknown>;
};

type RemapPluginInputs<TCatalog extends PluginTuple> = {
  [Plugin in TCatalog[number] as Plugin['id']]: Plugin['input'];
};

export type PluginInputForKind<
  TCatalog extends PluginTuple,
  TKind extends SurfaceLaneKind,
> = TCatalog[number] extends infer Candidate
  ? Candidate extends { kind: TKind }
    ? Candidate extends SurfacePluginContract<TKind, infer TInput, any>
      ? TInput
      : never
    : never
  : never;

export type PluginOutputForKind<
  TCatalog extends PluginTuple,
  TKind extends SurfaceLaneKind,
> = TCatalog[number] extends infer Candidate
  ? Candidate extends { kind: TKind }
    ? Candidate extends SurfacePluginContract<TKind, any, infer TOutput>
      ? TOutput
      : never
    : never
  : never;

export type SurfaceManifestSummary<
  TPlugins extends PluginTuple = readonly SurfacePluginContract[],
> = {
  readonly pluginCount: number;
  readonly laneCount: number;
  readonly remappedInputs: RemapPluginInputs<TPlugins>;
  readonly remappedOutputs: RemapPluginByKind<TPlugins>;
};

export const surfaceContextSchema = z.object({
  workspaceId: z.string(),
  lane: z.string(),
  stage: z.enum(['bootstrap', 'runtime', 'saturated', 'recovered', 'standby']),
  metadata: z.object({
    tenant: z.string(),
    domain: z.string(),
    namespace: z.string(),
    createdAt: z.number(),
    region: z.string().optional(),
    createdBy: z.string(),
  }),
  createdAt: z.number(),
});

export type SurfaceContextSchema = z.infer<typeof surfaceContextSchema> & {
  readonly metadata: SurfaceMetadata;
};

export const surfaceRuntimeStateSchema = z.object({
  workspaceId: z.string(),
  stage: z.enum(['bootstrap', 'runtime', 'saturated', 'recovered', 'standby']),
  activePluginIds: z.array(z.string()),
  nextTickAt: z.number(),
  stageClock: z.string(),
  signalsPerMinute: z.number().positive(),
});

export const surfaceManifestSchema = z.object({
  workspaceId: z.string(),
  nodes: z.array(z.object({ nodeId: z.string(), nodeKind: z.string() })),
  nodesEdges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      weight: z.number().min(1).max(100),
    }),
  ),
  laneIds: z.array(z.string()),
  eventKinds: z.array(z.enum(surfaceEventKinds)),
});

export type SurfaceManifest = z.infer<typeof surfaceManifestSchema> & {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly nodes: readonly { readonly nodeId: string; readonly nodeKind: string }[];
};

export type SurfaceContextState = ExtendedSurfaceRuntimeState & {
  readonly tagList: readonly string[];
};

export type ExtendedSurfaceRuntimeState = IdentitySurfaceRuntimeState & {
  readonly stageClock: string;
  readonly signalsPerMinute: number;
};

export const surfacePluginTemplate = {
  kind: 'ingest' as const,
  lane: 'lane:default' as SurfaceLaneId,
  name: 'Surface Plugin',
  description: 'Template plugin contract',
  workspaceId: 'workspace:template' as SurfaceWorkspaceId,
  dependencies: [] as SurfacePluginId[],
  telemetryId: 'telemetry:template:default' as SurfaceTelemetryId,
  shape: {
    kind: 'ingest' as const,
    mode: 'event' as const,
    source: 'stream',
  },
  schemaVersion: 1,
  active: true,
  maxConcurrency: 1,
  priority: 50,
  input: {} as Record<string, unknown>,
  run: (_input: Record<string, unknown>) => ({} as Record<string, unknown>),
} satisfies Omit<SurfacePluginContract<SurfaceLaneKind, Record<string, unknown>, Record<string, unknown>>, 'id'>;

export const templateKindUnion = Object.values(surfacePluginTemplate.shape).join(',') as string;
export type PluginTemplateKindUnion = typeof templateKindUnion;

export const createSurfacePluginContract = <
  TKind extends SurfaceLaneKind,
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
>(
  contract: Omit<SurfacePluginContract<TKind, TInput, TOutput>, 'id'> & { id: SurfacePluginId },
): SurfacePluginContract<TKind, TInput, TOutput> => ({
  ...contract,
} as SurfacePluginContract<TKind, TInput, TOutput>);

export const surfaceSignalKindsRecord = {
  metric: 0,
  topology: 1,
  forecast: 2,
  command: 3,
  state: 4,
} as const satisfies Record<SurfaceSignalKind, number>;

export const runtimeKindFromSignal = (kind: SurfaceSignalKind): SurfaceRuntimeStage =>
  kind === 'metric'
    ? 'runtime'
    : kind === 'topology'
      ? 'runtime'
      : kind === 'forecast'
        ? 'saturated'
        : kind === 'command'
          ? 'standby'
          : 'bootstrap';

export const createSurfaceRuntimeState = (
  workspaceId: SurfaceWorkspaceId,
  activePluginIds: readonly SurfacePluginId[],
): ExtendedSurfaceRuntimeState => ({
  workspaceId,
  stage: 'runtime',
  tags: ['synthetic'],
  signalWindowMs: 10_000,
  nextTickAt: Date.now() + 60_000,
  stageClock: `${Date.now()}:runtime`,
  signalsPerMinute: 60,
  activePluginIds,
});

export const summarizeRuntimeState = (state: ExtendedSurfaceRuntimeState): string =>
  `${state.workspaceId}@${state.stage}:${state.activePluginIds.length}/${state.signalsPerMinute}`;
