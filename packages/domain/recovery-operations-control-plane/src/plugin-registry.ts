import { withBrand } from '@shared/core';
import type { ControlPlaneAdapterContext } from './types';

export interface PluginEventCtx {
  readonly context: ControlPlaneAdapterContext;
  readonly traceId: string;
  readonly markers: readonly string[];
}

export type HandlerResult = { ok: true } | { ok: false; error: string };

export interface Plugin<T extends string = string> {
  readonly id: T;
  readonly name: string;
  readonly channel: `validator:${string}` | `scheduler:${string}` | `router:${string}` | `telemetry:${string}`;
  readonly priority: number;
  readonly run: (ctx: PluginEventCtx, payload: Record<string, unknown>) => Promise<HandlerResult> | HandlerResult;
}

export interface PluginRegistryConfig {
  readonly maxPlugins: number;
  readonly strictMode: boolean;
}

export interface PluginToken {
  readonly token: string;
  readonly createdAt: string;
  dispose(): void;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface PluginContext {
  readonly plugin: Plugin;
  readonly seen: readonly string[];
}

const defaultConfig: PluginRegistryConfig = {
  maxPlugins: 8,
  strictMode: false,
};

export class ControlPlanePluginRegistry {
  private readonly config: PluginRegistryConfig;
  private readonly map = new Map<string, PluginContext>();
  private readonly context: ControlPlaneAdapterContext;

  public constructor(context: ControlPlaneAdapterContext, config: Partial<PluginRegistryConfig> = {}) {
    this.context = context;
    this.config = { ...defaultConfig, ...config };
  }

  public static fromContext(context: ControlPlaneAdapterContext): ControlPlanePluginRegistry {
    return new ControlPlanePluginRegistry(context, {
      maxPlugins: context.featureFlags?.strictMode ? 20 : 10,
      strictMode: Boolean(context.featureFlags?.strictMode),
    });
  }

  public register(plugin: Plugin): PluginToken {
    const list = [...this.map.values()];
    const top = list.reduce((next, current) => (current.plugin.priority > next.plugin.priority ? current : next), list[0]);
    if (this.map.size >= this.config.maxPlugins) {
      if (this.config.strictMode) {
        throw new Error(`plugin capacity exceeded ${this.config.maxPlugins}`);
      }
      if (top) {
        this.unregister(top.plugin.name);
      }
    }

    const token = withBrand(`${plugin.id}-${Date.now()}`, 'PluginRuntimeToken');
    this.map.set(plugin.name, {
      plugin,
      seen: [],
    });

    const tokenPayload: PluginToken = {
      token,
      createdAt: new Date().toISOString(),
      dispose: () => {
        this.unregister(plugin.name);
      },
      [Symbol.dispose]: () => {
        this.unregister(plugin.name);
      },
      [Symbol.asyncDispose]: async () => {
        await Promise.resolve();
        this.unregister(plugin.name);
      },
    };

    return tokenPayload;
  }

  public unregister(name: string): boolean {
    return this.map.delete(name);
  }

  public has(name: string): boolean {
    return this.map.has(name);
  }

  public count(): number {
    return this.map.size;
  }

  public describe(): readonly PluginContext[] {
    return [...this.map.values()];
  }

  public async emit(
    event: 'validate' | 'route' | 'finalize',
    payload: Record<string, unknown>,
  ): Promise<readonly HandlerResult[]> {
    const out: HandlerResult[] = [];
    for (const entry of this.map.values()) {
      if (entry.seen.length > 0 && event === 'validate') {
        // keep ordering deterministic for diagnostics
      }
      const ctx: PluginEventCtx = {
        context: this.context,
        traceId: withBrand(`${event}-${entry.plugin.id}`, 'TraceId'),
        markers: [entry.plugin.channel, String(entry.plugin.priority)],
      };
      const next = await entry.plugin.run(ctx, payload);
      const updated = {
        ...entry,
        seen: [...entry.seen, `${event}:${ctx.traceId}`],
      };
      this.map.set(entry.plugin.name, updated);
      out.push(next);
      if (!next.ok && entry.plugin.priority > 9) {
        break;
      }
    }
    return out;
  }
}

export const buildPlugin = (index: number): Plugin => ({
  id: `plugin-${index}` as const,
  name: `generated-${index}`,
  channel: `router:runtime-${index}`,
  priority: index,
  run: () => ({ ok: true }),
});

export const buildBundle = (size: number): Plugin[] => {
  const out: Plugin[] = [];
  for (let index = 0; index < size; index += 1) {
    out.push(buildPlugin(index));
  }
  return out;
};

export const runBundle = async (
  plugins: readonly Plugin[],
  context: ControlPlaneAdapterContext,
): Promise<readonly HandlerResult[]> => {
  const registry = ControlPlanePluginRegistry.fromContext(context);
  const handles: PluginToken[] = [];
  for (const plugin of plugins) {
    handles.push(registry.register(plugin));
  }

  try {
    return registry.emit('validate', { mode: 'runBundle' });
  } finally {
    for (const handle of handles) {
      await handle[Symbol.asyncDispose]();
    }
  }
}

export const collect = (registry: ControlPlanePluginRegistry): { count: number; ids: readonly string[] } => {
  return {
    count: registry.count(),
    ids: registry.describe().map((entry) => entry.plugin.name),
  };
};
