import { ChronicleService, type OrchestratorWorkspace } from './orchestrator.js';
import { buildAdapter, type ChroniclePluginAdapter, composeBlueprintScenario } from './adapters.js';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { ChronicleTenantId, ChronicleRoute } from '@domain/recovery-chronicle-core';

export interface ServiceSessionInput {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly scenarioName: string;
}

export class ChronicleServiceSession {
  readonly #connector: ChroniclePluginAdapter;

  public constructor(private readonly input: ServiceSessionInput) {
    this.#connector = buildAdapter({
      tenant: input.tenant,
      route: input.route,
    });
  }

  public async bootstrap(): Promise<Result<OrchestratorWorkspace>> {
    const bootstrapResult = await this.#connector.bootstrap();
    if (!bootstrapResult.ok) {
      return fail(bootstrapResult.error, bootstrapResult.code);
    }

    const scenario = composeBlueprintScenario(
      this.input.tenant,
      this.input.scenarioName,
      this.input.route,
    );
    const service = new ChronicleService(scenario);
    return service.runWorkspace({
      planId: scenario.id,
      phases: ['phase:bootstrap', 'phase:execution', 'phase:verification'],
    });
  }

  public async runOnce(): Promise<Result<OrchestratorWorkspace>> {
    const scenario = composeBlueprintScenario(
      this.input.tenant,
      `${this.input.scenarioName}-run`,
      this.input.route,
      ['tag:auto'],
    );
    const service = new ChronicleService(scenario);
    return service.runWorkspace({
      planId: scenario.id,
      phases: ['phase:bootstrap', 'phase:execution'],
    });
  }

  public async close(): Promise<Result<boolean>> {
    await this.#connector.teardown();
    return ok(true);
  }
}

export const createServiceSession = (input: ServiceSessionInput): ChronicleServiceSession =>
  new ChronicleServiceSession(input);

export const runSession = async (input: ServiceSessionInput): Promise<Result<OrchestratorWorkspace>> => {
  const session = createServiceSession(input);
  const bootstrap = await session.bootstrap();
  if (!bootstrap.ok) {
    return fail(bootstrap.error, bootstrap.code);
  }
  return session.runOnce();
};
