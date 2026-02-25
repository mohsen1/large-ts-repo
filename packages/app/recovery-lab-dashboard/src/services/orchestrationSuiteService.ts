import { OrchestrationSuite, runSuiteCatalog, type SuiteRequest, type SuiteResult } from '@service/recovery-lab-orchestrator';

export interface OrchestrationSuiteRunInput {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly policies?: readonly string[];
  readonly repeats: number;
}

export interface OrchestrationSuiteRunPayload {
  readonly status: 'ok' | 'batch-ok' | 'catalog-ok';
  readonly payload: Record<string, unknown>;
  readonly generated: string;
}

export interface OrchestrationSuiteRunOutput {
  readonly seed: string;
  readonly startedAt: number;
  readonly result: SuiteResult<OrchestrationSuiteRunPayload>;
}

const toSeed = (input: OrchestrationSuiteRunInput): Record<string, unknown> => ({
  tenant: input.tenant,
  workspace: input.workspace,
  scenario: input.scenario,
  policies: input.policies ?? [],
  repeats: input.repeats,
  generatedAt: new Date().toISOString(),
});

export const buildRequest = (input: OrchestrationSuiteRunInput): SuiteRequest<Record<string, unknown>> => ({
  tenant: input.tenant,
  workspace: input.workspace,
  scenario: input.scenario,
  seedInput: toSeed(input),
});

const toSuitePayload = (status: OrchestrationSuiteRunPayload['status']) =>
  (seed: Record<string, unknown>): OrchestrationSuiteRunPayload => ({
    status,
    payload: seed,
    generated: `${seed.tenant}:${seed.workspace}:${seed.scenario}`,
  });

export const runStudioSuite = async (request: OrchestrationSuiteRunInput): Promise<OrchestrationSuiteRunOutput> => {
  const suiteRequest = buildRequest(request);
  const orchestrator = new OrchestrationSuite();
  const result = await orchestrator.run<Record<string, unknown>, OrchestrationSuiteRunPayload>(suiteRequest, toSuitePayload('ok'));

  return {
    seed: `${suiteRequest.tenant}:${suiteRequest.workspace}:${suiteRequest.scenario}`,
    startedAt: Date.now(),
    result,
  };
};

export const runBatchStudioSuite = async (
  inputs: readonly OrchestrationSuiteRunInput[],
): Promise<readonly OrchestrationSuiteRunOutput[]> => {
  const orchestrator = new OrchestrationSuite();
  const requestPayload = inputs.map((input) => buildRequest(input));
  const outputs = await orchestrator.runBatch<Record<string, unknown>, OrchestrationSuiteRunPayload>(
    requestPayload,
    toSuitePayload('batch-ok'),
  );

  return outputs.map((result, index) => ({
    seed: requestPayload[index]?.scenario ?? 'scenario',
    startedAt: Date.now(),
    result,
  }));
};

export const runLegacySuiteCatalog = async (
  request: OrchestrationSuiteRunInput,
): Promise<OrchestrationSuiteRunOutput> => {
  const result = await runSuiteCatalog<Record<string, unknown>, OrchestrationSuiteRunPayload>(
    buildRequest(request),
    toSuitePayload('catalog-ok'),
  );
  return {
    seed: `${request.tenant}:${request.workspace}:${request.scenario}`,
    startedAt: Date.now(),
    result,
  };
};
