import {
  createRoute,
  pluginKinds,
  pluginLifecycleEvents,
  type PluginKind,
  type PluginManifestId,
  type PluginRoute,
} from '@domain/recovery-incident-lab-core';
import { type Brand, type HorizonIdentity, type HorizonStage, type HorizonTemplate, defaultStages } from '@domain/recovery-stress-lab';
import { type NoInfer } from '@shared/type-level';
import { err, ok, type Result } from '@shared/result';

export type PluginId = Brand<string, 'HorizonPluginId'>;

export interface PluginEnvelope<TInput, TOutput> {
  readonly id: PluginId;
  readonly kind: PluginKind;
  readonly label: string;
  readonly route: PluginRoute;
  readonly manifestId: PluginManifestId;
  readonly supportedStages: readonly HorizonStage[];
  readonly execute: (input: {
    readonly payload: NoInfer<TInput>;
    readonly stage: HorizonStage;
    readonly route: PluginRoute;
    readonly identity: HorizonIdentity;
    readonly signal: AbortSignal;
  }) => Promise<TOutput>;
}

export interface PluginRunRecord<TOutput> {
  readonly pluginId: PluginId;
  readonly manifestId: PluginManifestId;
  readonly stage: HorizonStage;
  readonly route: PluginRoute;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly output: TOutput;
  readonly events: readonly string[];
}

const stackCtor = (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableStack }).AsyncDisposableStack;

const createFallbackStack = (): AsyncDisposableStack =>
  ({
    defer: () => undefined,
    disposeAsync: async () => undefined,
  }) as unknown as AsyncDisposableStack;

const routeForKind = (kind: PluginKind, stage: HorizonStage): PluginRoute =>
  createRoute('horizon', kind, stage === 'plan' ? 'bootstrap' : 'prepare');

const pluginCatalogSeed = pluginKinds.slice(0, 3).map((kind, index) => ({
  id: `seed-${kind}-${index}` as PluginId,
  kind,
  route: routeForKind(kind, defaultStages[index % defaultStages.length] ?? 'sense'),
}));

export class HorizonPluginLattice<TInput = unknown> {
  readonly #template: HorizonTemplate;
  readonly #identity: HorizonIdentity;
  readonly #plugins = new Map<PluginId, PluginEnvelope<TInput, unknown>>();
  readonly #stack: AsyncDisposableStack;

  constructor(template: HorizonTemplate, identity: HorizonIdentity) {
    this.#template = template;
    this.#identity = identity;
    this.#stack = stackCtor ? new stackCtor() : createFallbackStack();
    this.#stack.defer(() => {
      this.#plugins.clear();
    });
  }

  get template(): HorizonTemplate {
    return this.#template;
  }

  get size(): number {
    return this.#plugins.size;
  }

  get pluginRouteFingerprint(): readonly string[] {
    return [...this.#plugins.values()].map((plugin) => `${plugin.kind}:${plugin.route}`);
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#stack.disposeAsync();
  }

  [Symbol.dispose](): void {
    const dispose = (this.#stack as unknown as { dispose?: () => void }).dispose;
    if (typeof dispose === 'function') {
      dispose.call(this.#stack);
    }
  }

  register<TStageInput, TOutput>(plugin: PluginEnvelope<TStageInput, TOutput>): Result<void> {
    if (!pluginKinds.includes(plugin.kind)) {
      return err(new Error(`invalid plugin kind: ${plugin.kind}`));
    }

    const supported = new Set(plugin.supportedStages);
    if ([...supported].some((stage) => !this.#template.stageOrder.includes(stage))) {
      return err(new Error(`unsupported stage for template ${plugin.id}`));
    }

    if (this.#plugins.has(plugin.id)) {
      return err(new Error(`plugin already registered: ${plugin.id}`));
    }

    this.#plugins.set(
      plugin.id,
      plugin as unknown as PluginEnvelope<TInput, unknown>,
    );
    return ok(undefined);
  }

  async executeByStage<TOutput>(
    payload: TInput,
    stage: HorizonStage,
    signal: AbortSignal,
  ): Promise<Result<readonly PluginRunRecord<TOutput>[]>> {
    const selected = [...this.#plugins.values()].filter((plugin) => plugin.supportedStages.includes(stage));
    if (selected.length === 0) {
      return err(new Error(`no plugin for stage ${stage}`));
    }

    const out: PluginRunRecord<TOutput>[] = [];
    for (const plugin of selected) {
      const start = Date.now();
      const output = await plugin.execute({
        payload,
        stage,
        route: plugin.route,
        identity: this.#identity,
        signal,
      });
      const elapsed = Date.now() - start;
      const record: PluginRunRecord<TOutput> = {
        pluginId: plugin.id,
        manifestId: plugin.manifestId,
        stage,
        route: plugin.route,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: elapsed,
        output: output as TOutput,
        events: pluginLifecycleEvents.map((event) => `${plugin.id}:${event}:${stage}`),
      };
      out.push(record);
    }

    return ok(out);
  }

  seedCatalog(template: HorizonTemplate): void {
    for (const seed of pluginCatalogSeed) {
      this.register({
        id: `seed-${seed.id}` as PluginId,
        kind: seed.kind,
        label: `seed:${seed.id}`,
        route: seed.route,
        manifestId: `${seed.id}-${template.templateId}` as PluginManifestId,
        supportedStages: [...template.stageOrder],
        execute: async ({ payload }) => ({
          seed: seed.id,
          payload,
          stageCount: template.stageOrder.length,
        }),
      });
    }
  }
}

export const buildDefaultLattice = <TInput>(template: HorizonTemplate, identity: HorizonIdentity): HorizonPluginLattice<TInput> => {
  const lattice = new HorizonPluginLattice<TInput>(template, identity);
  lattice.seedCatalog(template);
  return lattice;
};
