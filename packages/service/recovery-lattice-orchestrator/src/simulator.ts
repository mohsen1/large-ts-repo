import { fromPromise } from '@shared/result';
import { withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import { asRouteId, asTenantId } from '@domain/recovery-lattice';
import {
  type LatticeOrchestratorMode,
  type LatticeSimConfig,
  type LatticePlanResult,
  type LatticeOrchestratorRequest,
} from './types';
import {
  createLatticeOrchestrator,
  type RecoveryLatticeOrchestrator,
  type OrchestratorConfig,
} from './orchestrator';

const iteratorFrom =
  (globalThis as {
    Iterator?: {
      from?: <T>(value: Iterable<T>) => IterableIterator<T>;
    };
  }).Iterator?.from;

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

const normalizeChecksum = (routeId: string, value: number): string =>
  withBrand(value.toString(16).padStart(8, '0'), `checksum:${routeId}`);

export interface SimulationOutcome {
  readonly mode: LatticeOrchestratorMode;
  readonly steps: number;
  readonly payloads: readonly string[];
  readonly errors: readonly string[];
  readonly checksum: string;
}

export class RecoveryLatticeSimulator {
  readonly #config: Required<LatticeSimConfig>;

  public constructor(
    private readonly config: Partial<LatticeSimConfig> = {},
  ) {
    this.#config = {
      limit: clamp(config.limit ?? 25, 1, 500),
      iterations: clamp(config.iterations ?? 3, 1, 20),
      strictMode: config.strictMode ?? false,
    };
  }

  public async runSimulation<TPayload>(
    request: NoInfer<LatticeOrchestratorRequest<TPayload>>,
    mode: LatticeOrchestratorMode,
    orchestrator: RecoveryLatticeOrchestrator,
  ): Promise<SimulationOutcome> {
    const snapshots = Array.from({ length: this.#config.iterations }, (_, index) => ({
      index,
      payload: JSON.stringify({
        request: String(request.routeId),
        mode,
        index,
      }),
    }));

    const payloads: string[] = [];
    const errors: string[] = [];

    for (const snapshot of snapshots) {
      const result = await fromPromise(Promise.resolve(this.#simulateStep(request, mode, snapshot)));
      if (!result.ok) {
        errors.push(result.error instanceof Error ? result.error.message : 'simulation-error');
        if (this.#config.strictMode) {
          break;
        }
        continue;
      }

      payloads.push(result.value);
    }

    const iterator = iteratorFrom?.(payloads);
    const values = iterator ? Array.from(iterator) : payloads;

    await orchestrator.stop(request.routeId);

    return {
      mode,
      steps: request.blueprint.steps.length,
      payloads,
      errors,
      checksum: normalizeChecksum(String(request.routeId), values.join('|').length),
    };
  }

  #simulateStep<TPayload>(
    request: LatticeOrchestratorRequest<TPayload>,
    mode: LatticeOrchestratorMode,
    snapshot: { index: number; payload: string },
  ): string {
    const label = request.blueprint.steps
      .map((step) => `${step.kind}:${snapshot.index}`)
      .join('>');

    return withBrand(`${label}::${mode}::${request.routeId}`, 'simulation-step');
  }
}

export const runPlannerDryRun = async <
  TPayload,
>(
  blueprint: Parameters<RecoveryLatticeOrchestrator['requestBlueprintAnalysis']>[0]['blueprint'],
  payload: TPayload,
  mode: LatticeOrchestratorMode,
): Promise<LatticePlanResult[]> => {
  const simulation = new RecoveryLatticeSimulator({
    limit: 10,
    iterations: 4,
    strictMode: true,
  });

  const tenantId = asTenantId('tenant:simulation');
  const routeId = asRouteId('route:simulation');
  const orchestrator = await createLatticeOrchestrator({
    tenantId,
    namespace: 'simulation',
  } as OrchestratorConfig);

  const request: LatticeOrchestratorRequest<TPayload> = {
    tenantId,
    routeId,
    mode,
    blueprint,
    payload,
  };

  const outcome = await simulation.runSimulation(request, mode, orchestrator);
  return [
    {
      blueprint,
      route: String(blueprint.route),
      ok: outcome.errors.length === 0,
      diagnostics: outcome.payloads,
      snapshot: null,
    },
  ];
};

export const parsePlannerResponse = (response: SimulationOutcome): LatticeSimConfig => ({
  limit: response.payloads.length,
  iterations: response.steps,
  strictMode: response.errors.length > 0,
});
