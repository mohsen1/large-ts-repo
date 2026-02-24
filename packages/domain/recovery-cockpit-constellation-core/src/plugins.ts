import type { NoInfer, Prettify } from '@shared/type-level';
import type {
  PlanId,
  RecoveryAction,
  RecoveryPlan,
  UtcIsoTimestamp,
} from '@domain/recovery-cockpit-models';
import { toTimestamp } from '@domain/recovery-cockpit-models';
import type {
  ConstellationMode,
  ConstellationNode,
  ConstellationPlanEnvelope,
  ConstellationScope,
  ConstellationStage,
  ConstellationTemplateId,
  ConstellationTopology,
} from './ids';

export type ConstellationRoute = `route:${string}`;
export type PluginChannel = `channel:${string}`;
export type PluginOutputBucket<T extends string> = `bucket:${T}`;
export type PluginRoutePattern<T extends ConstellationStage = ConstellationStage> = `route:${T}`;
export type PluginInputTopic<T extends ConstellationStage = ConstellationStage> = `input:${T}`;
export type PluginTag = `tag:${string}`;
export type PluginId = `plugin:${string}`;

export type StagePayload<
  TStage extends ConstellationStage = ConstellationStage,
  TMode extends ConstellationMode = ConstellationMode,
> = TStage extends 'bootstrap'
  ? {
      readonly planId: PlanId;
      readonly scope: ConstellationScope;
      readonly mode: TMode;
      readonly runbookId: ConstellationTemplateId;
    }
  : TStage extends 'ingest'
    ? {
        readonly sources: readonly string[];
        readonly correlationId: string;
        readonly plan: ConstellationPlanEnvelope;
      }
    : TStage extends 'synthesize'
      ? {
          readonly actions: readonly RecoveryAction[];
          readonly topology: ConstellationTopology;
          readonly stageHints: readonly ConstellationStage[];
        }
      : TStage extends 'validate'
        ? {
            readonly plan: RecoveryPlan;
            readonly checks: readonly string[];
          }
        : TStage extends 'simulate'
          ? {
              readonly scenarioId: string;
              readonly intensity: number;
              readonly topology: ConstellationTopology;
            }
          : TStage extends 'execute'
            ? {
                readonly commandIds: readonly string[];
                readonly runId: string;
              }
            : TStage extends 'recover'
              ? {
                  readonly recoveredNodes: readonly ConstellationNode[];
                  readonly summaryNotes: readonly string[];
                  readonly timelineAt: UtcIsoTimestamp;
                }
              : {
                  readonly recoveredNodes: readonly ConstellationNode[];
                  readonly timelineAt: UtcIsoTimestamp;
                  readonly summaryNotes: readonly string[];
                };

export type StageOutput<
  TStage extends ConstellationStage = ConstellationStage,
  TMode extends ConstellationMode = ConstellationMode,
> = TStage extends 'bootstrap'
  ? {
      readonly topology: ConstellationTopology;
      readonly fingerprint: ConstellationTemplateId;
      readonly mode: TMode;
    }
  : TStage extends 'ingest'
    ? {
        readonly nodes: readonly ConstellationNode[];
        readonly channels: readonly PluginChannel[];
      }
    : TStage extends 'synthesize'
      ? {
          readonly topology: ConstellationTopology;
          readonly metrics: {
            readonly scores: readonly [ConstellationStage, number, UtcIsoTimestamp][];
            readonly health: number;
          };
        }
      : TStage extends 'validate'
        ? {
            readonly isSafe: boolean;
            readonly violations: readonly string[];
            readonly confidence: number;
          }
        : TStage extends 'simulate'
          ? {
              readonly timeline: readonly ConstellationEvent[];
              readonly score: number;
            }
          : TStage extends 'execute'
            ? {
                readonly startedAt: UtcIsoTimestamp;
                readonly estimatedMinutes: number;
                readonly actionsPrepared: readonly RecoveryAction[];
              }
            : TStage extends 'recover'
              ? {
                  readonly done: true;
                  readonly summary: ConstellationPlanEnvelope;
                }
              : {
                  readonly done: true;
                  readonly checksum: string;
                  readonly summary: string;
                };

export interface ConstellationContext {
  readonly runId: string;
  readonly stage: ConstellationStage;
  readonly startedAt: UtcIsoTimestamp;
  readonly runbookId: string;
  readonly correlationId: string;
}

export type ConstellationEventCategory = 'metric' | 'risk' | 'policy' | 'telemetry' | 'plan';

export interface ConstellationEvent {
  readonly kind: ConstellationEventCategory;
  readonly message: string;
  readonly timestamp: UtcIsoTimestamp;
  readonly tags: readonly string[];
}

export interface ConstellationPlugin<
  TStage extends ConstellationStage = ConstellationStage,
  TMode extends ConstellationMode = ConstellationMode,
> {
  readonly id: PluginId;
  readonly name: string;
  readonly kind: TStage;
  readonly tags: readonly PluginTag[];
  readonly route: PluginRoutePattern<TStage>;
  readonly mode: TMode;
  readonly dependsOn: readonly PluginRoutePattern[];
  readonly enabled: boolean;
  readonly timeoutMs: number;
  readonly execute: (
    input: NoInfer<StagePayload<TStage, TMode>>,
    context: ConstellationContext,
  ) => Promise<PluginExecutionResult<TStage, TMode>>;
  readonly dispose?: () => void | Promise<void>;
}

export type PluginExecutionResult<
  TStage extends ConstellationStage = ConstellationStage,
  TMode extends ConstellationMode = ConstellationMode,
> = Prettify<{
  readonly output: StageOutput<TStage, TMode>;
  readonly events: readonly ConstellationEvent[];
  readonly metrics?: Readonly<Record<string, number>>;
}>;

export type PluginInput<TPlugin extends ConstellationPlugin> = TPlugin extends ConstellationPlugin<
  infer TStage,
  infer TMode
>
  ? StagePayload<TStage, TMode>
  : never;

export type PluginOutput<TPlugin extends ConstellationPlugin> = TPlugin extends ConstellationPlugin<
  infer TStage,
  infer TMode
>
  ? StageOutput<TStage, TMode>
  : never;

export type PluginByStage<
  TStage extends ConstellationStage,
  TPlugins extends readonly ConstellationPlugin[] = readonly ConstellationPlugin[],
> = Extract<TPlugins[number], { kind: TStage }>;

type DefinitionShape = {
  readonly id: string;
  readonly name: string;
  readonly kind: ConstellationStage;
  readonly enabled: boolean;
  readonly mode: ConstellationMode;
  readonly route: string;
  readonly timeoutMs: number;
  readonly tags: readonly string[];
};

const pluginKindLabels = {
  bootstrap: 'bootstrap pipeline',
  ingest: 'signal ingest',
  synthesize: 'topology synthesis',
  validate: 'policy validation',
  simulate: 'risk simulation',
  execute: 'execution planning',
  recover: 'post-recovery stabilization',
  sweep: 'telemetry cleanup',
} as const;

export const pluginKindLabelMap = pluginKindLabels satisfies Readonly<Record<ConstellationStage, string>>;
export const pluginKindKeys = Object.keys(pluginKindLabels) as ReadonlyArray<ConstellationStage>;

export const isPluginDefinition = (value: unknown): value is DefinitionShape => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<DefinitionShape>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.kind === 'bootstrap'
      || candidate.kind === 'ingest'
      || candidate.kind === 'synthesize'
      || candidate.kind === 'validate'
      || candidate.kind === 'simulate'
      || candidate.kind === 'execute'
      || candidate.kind === 'recover'
      || candidate.kind === 'sweep') &&
    typeof candidate.mode === 'string' &&
    candidate.mode.length > 0 &&
    typeof candidate.route === 'string' &&
    typeof candidate.timeoutMs === 'number' &&
    Array.isArray(candidate.tags)
  );
};

export const pluginConfig = (value: string): Promise<boolean> => Promise.resolve(value.length > 0);
export const isPluginEnabled = (plugin: { enabled: boolean }): boolean => plugin.enabled;

export const pluginLabel = (plugin: { kind: ConstellationStage }): string =>
  pluginKindLabelMap[plugin.kind] ?? 'unknown stage';

export const pluginEvent = (
  message: string,
  category: ConstellationEventCategory,
  ...tags: readonly string[]
): ConstellationEvent => ({
  kind: category,
  message,
  timestamp: toTimestamp(new Date()),
  tags,
});

export const pluginInputFingerprint = <T extends ConstellationPlugin>(plugin: T, input: PluginInput<T>): string =>
  `${plugin.id}:${plugin.kind}:${JSON.stringify(input).length}`;

export const pluginOutputEventProjection = <T extends readonly ConstellationEvent[]>(
  _: Readonly<{ [K in T[number] as K['kind']]: { kind: K['kind']; message: K['message'] } }>,
): readonly ConstellationEvent[] => [];
