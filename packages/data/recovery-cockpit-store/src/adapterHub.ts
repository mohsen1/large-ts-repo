import { Result, fail, ok } from '@shared/result';
import {
  BlueprintArtifact,
  RecoveryBlueprint,
  summarizeBlueprint,
  buildBlueprintArtifacts,
} from '@domain/recovery-cockpit-models';
import { EntityRef, toTimestamp } from '@domain/recovery-cockpit-models';
import { InMemoryBlueprintCatalog } from './planBlueprintCatalog';

export type BlueprintAdapterMode = 'analysis' | 'simulate' | 'execute' | 'verify';
export type BlueprintAdapterResult = {
  readonly adapterId: string;
  readonly status: 'success' | 'skipped' | 'error';
  readonly count: number;
  readonly details: ReadonlyArray<string>;
  readonly finishedAt: string;
};

export interface AdapterContext {
  readonly actor: EntityRef<'operator'>;
  readonly runId: string;
  readonly mode: BlueprintAdapterMode;
  readonly correlation: {
    readonly trace: string;
    readonly attempt: number;
  };
}

export interface BlueprintAdapter {
  readonly adapterId: string;
  readonly mode: BlueprintAdapterMode;
  execute(blueprint: RecoveryBlueprint, context: AdapterContext): Promise<Result<BlueprintAdapterResult, string>>;
}

type AdapterByMode = Record<BlueprintAdapterMode, BlueprintAdapter[]>;

const noopResult = (adapterId: string, status: BlueprintAdapterResult['status'], details: string[]): BlueprintAdapterResult => ({
  adapterId,
  status,
  count: details.length,
  details,
  finishedAt: toTimestamp(new Date()),
});

export class LoggingAdapter implements BlueprintAdapter {
  public readonly mode = 'analysis' as const;
  public readonly adapterId = `adapter:${Math.random().toString(36).slice(2, 10)}`;

  public async execute(
    blueprint: RecoveryBlueprint,
    context: AdapterContext,
  ): Promise<Result<BlueprintAdapterResult, string>> {
    const summary = summarizeBlueprint(blueprint);
    const details = [
      `actor:${context.actor.id}`,
      `run:${context.runId}`,
      `stageCount:${summary.digest.stageCount}`,
      `risk:${summary.risk}`,
    ];
    return ok(noopResult(this.adapterId, 'success', details));
  }
}

export class SimulationAdapter implements BlueprintAdapter {
  public readonly mode = 'simulate' as const;
  public readonly adapterId = `adapter:${Math.random().toString(36).slice(2, 10)}`;

  public async execute(
    blueprint: RecoveryBlueprint,
    context: AdapterContext,
  ): Promise<Result<BlueprintAdapterResult, string>> {
    if (context.correlation.attempt < 0) {
      return fail('invalid-attempt');
    }
    const details = [context.mode, `${blueprint.steps.length}`, context.actor.kind, context.correlation.trace];
    return ok(noopResult(this.adapterId, 'success', details));
  }
}

export class ExecutionAdapter implements BlueprintAdapter {
  public readonly mode = 'execute' as const;
  public readonly adapterId = `adapter:${Math.random().toString(36).slice(2, 10)}`;
  public constructor(private readonly catalog: InMemoryBlueprintCatalog) {}

  public async execute(
    blueprint: RecoveryBlueprint,
    context: AdapterContext,
  ): Promise<Result<BlueprintAdapterResult, string>> {
    const artifacts = Object.values(buildBlueprintArtifacts(blueprint, context.actor));
    this.catalog.attachArtifacts(blueprint.blueprintId, artifacts as BlueprintArtifact[]);
    return ok(
      noopResult(this.adapterId, 'success', [
        `attach:${artifacts.length}`,
        `actor:${context.actor.id}`,
        context.runId,
      ]),
    );
  }
}

export class VerifyAdapter implements BlueprintAdapter {
  public readonly mode = 'verify' as const;
  public readonly adapterId = `adapter:${Math.random().toString(36).slice(2, 10)}`;

  public async execute(
    blueprint: RecoveryBlueprint,
    context: AdapterContext,
  ): Promise<Result<BlueprintAdapterResult, string>> {
    if (blueprint.steps.length === 0) {
      return fail('empty-blueprint');
    }
    const details = [`verify:${blueprint.blueprintId}`, `attempt:${context.correlation.attempt}`];
    return ok(noopResult(this.adapterId, 'success', details));
  }
}

export class BlueprintAdapterHub {
  #adapters: AdapterByMode;

  public constructor(adapters: BlueprintAdapter[] = []) {
    this.#adapters = {
      analysis: [],
      simulate: [],
      execute: [],
      verify: [],
    };
    for (const adapter of adapters) {
      this.#adapters[adapter.mode].push(adapter);
    }
  }

  public register(adapter: BlueprintAdapter): void {
    this.#adapters[adapter.mode].push(adapter);
  }

  public unregister(mode: BlueprintAdapterMode, adapterId: string): void {
    this.#adapters[mode] = this.#adapters[mode].filter((value) => value.adapterId !== adapterId);
  }

  public modes(): readonly BlueprintAdapterMode[] {
    return ['analysis', 'simulate', 'execute', 'verify'];
  }

  public async runAll(blueprint: RecoveryBlueprint, context: AdapterContext): Promise<Result<BlueprintAdapterResult[], string>> {
    const run = await this.runMode(context.mode, blueprint, context);
    if (!run.ok) {
      return fail(run.error);
    }
    return ok(run.value);
  }

  public async runMode(
    mode: BlueprintAdapterMode,
    blueprint: RecoveryBlueprint,
    context: AdapterContext,
  ): Promise<Result<BlueprintAdapterResult[], string>> {
    const adapters = this.#adapters[mode];
    if (adapters.length === 0) {
      return ok([]);
    }
    const outcomes: BlueprintAdapterResult[] = [];

    for (let index = 0; index < adapters.length; index += 1) {
      const adapter = adapters[index];
      if (!adapter) {
        continue;
      }
      const run = await adapter.execute(blueprint, context);
      if (!run.ok) {
        return fail(run.error);
      }
      outcomes.push(run.value);
    }

    return ok(outcomes);
  }

  public async *stream(
    blueprint: RecoveryBlueprint,
    context: AdapterContext,
  ): AsyncGenerator<BlueprintAdapterResult, void, void> {
    for (const mode of this.modes()) {
      const run = await this.runMode(mode, blueprint, context);
      if (!run.ok) {
        yield noopResult(`stream:${mode}`, 'error', [run.error]);
        continue;
      }

      for (const item of run.value) {
        yield item;
      }
    }
  }
}
