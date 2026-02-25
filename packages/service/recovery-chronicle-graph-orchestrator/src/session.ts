import {
  asChronicleGraphRunId,
  asChronicleGraphTenantId,
  asChronicleGraphRoute,
  type ChronicleGraphTenantId,
  type ChronicleGraphRoute,
  type ChronicleGraphScenario,
  type ChronicleGraphPluginDescriptor,
  type ChronicleGraphPolicyMode,
} from '@domain/recovery-chronicle-graph-core';
import { fail, ok, type Result } from '@shared/result';
import { runGraphWorkspace, type GraphWorkspaceResult, type OrchestratorRunInput } from './orchestrator.js';

export interface GraphSessionInput {
  readonly tenant: ChronicleGraphTenantId;
  readonly route: ChronicleGraphRoute;
  readonly scenario: ChronicleGraphScenario;
  readonly plugins: readonly ChronicleGraphPluginDescriptor[];
  readonly mode?: ChronicleGraphPolicyMode;
}

export interface GraphSessionState {
  readonly runId: ReturnType<typeof asChronicleGraphRunId>;
  readonly tenant: ChronicleGraphTenantId;
  readonly route: ChronicleGraphRoute;
  readonly startedAt: number;
  readonly active: boolean;
}

export class ChronicleGraphSession {
  #closed = false;
  readonly #state: GraphSessionState;
  readonly #input: GraphSessionInput;

  public constructor(input: GraphSessionInput) {
    this.#input = input;
    this.#state = {
      runId: asChronicleGraphRunId(input.tenant, input.route),
      tenant: input.tenant,
      route: input.route,
      startedAt: Date.now(),
      active: true,
    };
  }

  public async run(): Promise<Result<GraphWorkspaceResult>> {
    if (this.#closed) return fail(new Error('session closed'), 'closed');
    const command: OrchestratorRunInput = {
      scenario: this.#input.scenario,
      plugins: this.#input.plugins,
      mode: this.#input.mode ?? 'balanced',
    };

    return runGraphWorkspace(command);
  }

  public async close(): Promise<void> {
    this.#closed = true;
  }

  public get state(): GraphSessionState {
    return {
      ...this.#state,
      active: !this.#closed,
    };
  }

  public [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

export const createSession = (input: GraphSessionInput): ChronicleGraphSession => new ChronicleGraphSession(input);

export const createSeedSession = (tenant: string, route: string): GraphSessionState => ({
  runId: asChronicleGraphRunId(asChronicleGraphTenantId(tenant), asChronicleGraphRoute(route)),
  tenant: asChronicleGraphTenantId(tenant),
  route: asChronicleGraphRoute(route),
  startedAt: Date.now(),
  active: false,
});

export const runSession = async (input: GraphSessionInput): Promise<Result<GraphWorkspaceResult>> => {
  const session = createSession(input);
  try {
    const result = await session.run();
    return result;
  } finally {
    await session.close();
  }
};
