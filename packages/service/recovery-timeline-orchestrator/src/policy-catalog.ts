import type { Brand, RegistryPlugin, PluginResult, PluginTrace, PluginStepInput } from '@shared/type-level';
import type { OrchestrationPolicy } from './types';
import { DEFAULT_ORCHESTRATION_POLICY } from './types';

export type TimelineAction = 'advance' | 'simulate' | 'reopen';

export type TimelineActionCode<T extends TimelineAction> = Brand<T, `timeline-action:${T}`>;

export type TimelinePluginId = Brand<`@recovery/${string}`, 'plugin-id'>;

export type TimelinePluginPayload = { timelineId: string };

export interface PluginExecutionState {
  readonly action: TimelineAction;
  readonly actor: string;
  readonly startedAt: Date;
  readonly policy: OrchestrationPolicy;
}

export interface PluginExecutionContext {
  readonly trace: PluginTrace;
  readonly state: PluginExecutionState;
  readonly correlationPath: string;
}

export interface TimelinePluginDescriptor<TName extends string = string> {
  readonly id: TimelinePluginId;
  readonly name: TName;
  readonly phase: `phase:${string}`;
  readonly priority: number;
  readonly tags: readonly `tag:${string}`[];
  readonly requires: readonly TimelinePluginId[];
  readonly supports: readonly TimelineAction[];
}

export interface TimelinePluginInput<TName extends string, TPayload extends TimelinePluginPayload> extends PluginStepInput<TPayload> {
  readonly id: TimelinePluginId;
  readonly name: TName;
  readonly action: TimelineAction;
  readonly namespace: string;
}

export interface TimelinePluginOutput {
  readonly pluginId: TimelinePluginId;
  readonly timelineId: string;
  readonly durationMs: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type TimelinePolicyResult<T> = PluginResult<T>;

export interface TimelineCommandPlugin<
  TName extends string,
  TInput extends TimelinePluginPayload,
  TOutput,
> extends RegistryPlugin<TName, TimelinePluginInput<TName, TInput>, TimelinePluginOutput, `@recovery/${TName}`> {
  readonly phase: `phase:${string}`;
  readonly supports: readonly TimelineAction[];
  execute: (input: TimelinePluginInput<TName, TInput>, context: PluginExecutionContext) => Promise<TimelinePolicyResult<TOutput>>;
}

export type CommandPluginList = readonly TimelineCommandPlugin<
  string,
  TimelinePluginPayload,
  TimelinePluginOutput
>[];

export interface PluginManifest {
  readonly version: string;
  readonly namespace: string;
  readonly entries: CommandPluginList;
}

export type PluginSummary = {
  [K in CommandPluginList[number]['name']]: {
    version: string;
    phase: `phase:${string}`;
    supports: TimelineAction[];
    requires: number;
  };
};

export function isTimelinePlugin<TName extends string>(
  plugin: RegistryPlugin<string, unknown, unknown, `@recovery/${string}`>,
): plugin is TimelineCommandPlugin<TName, TimelinePluginPayload, TimelinePluginOutput> {
  return plugin.name.length > 0 && plugin.version.length > 0 && plugin.id.length > 0;
}

export const POLICY_PLUGIN_NAMES = [
  'risk-evaluator',
  'forecast-builder',
  'state-transition',
  'timeline-gate',
  'telemetry-emitter',
] as const satisfies readonly string[];

export function normalizeTag(tag: string): `tag:${string}` {
  return `tag:${tag.replace(/^tag:/, '')}` as `tag:${string}`;
}

export function createDescriptor<TName extends string>(
  name: TName,
  phase: `phase:${string}`,
  priority: number,
  support: readonly TimelineAction[],
): TimelinePluginDescriptor<TName> {
  const required = support.filter((_) => _ !== 'reopen').map((_) => `${_}` as TimelineAction).sort();
  return {
    id: `@recovery/${name}:descriptor` as TimelinePluginId,
    name,
    phase,
    priority,
    tags: required.length > 0
    ? [normalizeTag('core'), ...required.map((action) => `tag:${action}` as const)]
      : [normalizeTag('core')],
    requires: [],
    supports: required,
  };
}

function createOutput(plugin: TimelinePluginDescriptor, timelineId: string): TimelinePluginOutput {
  return {
    pluginId: plugin.id,
    timelineId,
    durationMs: 0,
    metadata: {
      plugin: plugin.name,
      phase: plugin.phase,
    },
  };
}

function delayMs(seed: number): number {
  return (seed % 50) + 20;
}

export function buildBuiltinPlugins(policy: OrchestrationPolicy = DEFAULT_ORCHESTRATION_POLICY): CommandPluginList {
  const createSupport = (name: string, action: TimelineAction): readonly TimelineAction[] => [action];
  const descriptorPayload = (name: string, phase: `phase:${string}`, action: TimelineAction): TimelinePluginDescriptor => ({
    id: `@recovery/${name}:${action}` as TimelinePluginDescriptor['id'],
    name,
    phase,
    priority: policy.failureTolerance + 1,
    tags: [normalizeTag(phase), normalizeTag(action)],
    requires: [],
    supports: createSupport(name, action),
  });
  const entries = POLICY_PLUGIN_NAMES.map((name) => {
    const phase = `phase:${name}` as `phase:${string}`;
    const descriptor = descriptorPayload(name, phase, name === 'risk-evaluator' ? 'simulate' : 'advance');
    const plugin: TimelineCommandPlugin<string, TimelinePluginPayload, TimelinePluginOutput> = {
      id: descriptor.id,
      name: descriptor.name,
      phase: descriptor.phase,
      version: '1.0.0',
      dependsOn: descriptor.requires,
      supports: descriptor.supports,
      canProcess: () => true,
      process: async (_input: PluginStepInput<TimelinePluginInput<string, TimelinePluginPayload>>, _trace) => ({
        status: 'ok',
        payload: createOutput(descriptor, _input.payload.payload.timelineId),
      }),
      execute: async (input: TimelinePluginInput<string, TimelinePluginPayload>, context) => {
        const started = Date.now();
        await new Promise((resolve) => setTimeout(resolve, delayMs(input.payload.timelineId.length)));
        const output = createOutput(descriptor, input.payload.timelineId);
        const durationMs = Date.now() - started;
        return {
          status: 'ok',
          payload: { ...output, durationMs, metadata: { ...output.metadata, actor: context.state.actor, correlation: context.trace.correlationId } },
        };
      },
    };
    return plugin satisfies TimelineCommandPlugin<string, TimelinePluginPayload, TimelinePluginOutput>;
  });
  return entries as CommandPluginList;
}

export function buildManifest(
  policies: OrchestrationPolicy,
  overrides: Partial<Record<string, Partial<TimelinePluginDescriptor | TimelineCommandPlugin<string, TimelinePluginPayload, TimelinePluginOutput> & { version?: string }>>> = {},
): PluginManifest {
  const entries = buildBuiltinPlugins(policies);
  const manifestEntries: CommandPluginList = entries.map((plugin) => {
    const override = overrides[plugin.name];
    if (!override) {
      return plugin;
    }
    return {
      ...plugin,
      ...override,
    } as TimelineCommandPlugin<string, TimelinePluginPayload, TimelinePluginOutput>;
  });
  return {
    version: '0.0.1',
    namespace: 'recovery/timeline',
    entries: manifestEntries,
  };
}

export function summarizeManifest(manifest: PluginManifest): PluginSummary {
  const summary = {} as PluginSummary;
  for (const plugin of manifest.entries) {
    const typed = plugin;
    summary[typed.name] = {
      version: typed.version,
      phase: typed.phase,
      supports: [...typed.supports],
      requires: typed.dependsOn.length,
    };
  }
  return summary;
}

export function toExecutionContext(actor: string, action: TimelineAction, policy: OrchestrationPolicy): PluginExecutionContext {
  const trace: PluginTrace = {
    namespace: 'recovery/timeline',
    correlationId: `${actor}-${Date.now()}` as Brand<string, 'plugin-correlation-id'>,
    startedAt: Date.now(),
    metadata: {},
  };
  return {
    trace,
    state: {
      action,
      actor,
      startedAt: new Date(),
      policy,
    },
    correlationPath: trace.correlationId,
  };
}
