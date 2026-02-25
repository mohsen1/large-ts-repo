import type { NoInfer } from '@shared/type-level';
import {
  createDisposableScope,
} from '@shared/recovery-lab-kernel';
import {
  type SuiteRequest,
  type SuiteResult,
  OrchestrationSuite,
} from './orchestration-suite';
import type { StudioPolicySpec } from '@domain/recovery-lab-signal-studio';
import { flow } from '@domain/recovery-lab-signal-studio';

export interface SchedulerInput<TInput> {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly policies?: readonly StudioPolicySpec[];
  readonly seedInput: TInput;
}

export interface SchedulerProfile {
  readonly id: string;
  readonly weight: number;
  readonly windowMs: number;
  readonly maxConcurrency: number;
}

const defaultProfile: SchedulerProfile = {
  id: 'recovery-suite',
  weight: 1,
  windowMs: 25,
  maxConcurrency: 3,
};

type QueuedSuiteInput<TInput> = SchedulerInput<TInput> & { readonly rank: number };

export class SuiteScheduler {
  readonly #orchestrator = new OrchestrationSuite();

  public async runProfiledBatch<TInput, TOutput>(
    profile: SchedulerProfile = defaultProfile,
    requests: readonly SchedulerInput<TInput>[],
    transform: (input: TInput) => NoInfer<TOutput>,
  ): Promise<readonly SuiteResult<TOutput>[]> {
    const queue = flow(requests)
      .map((request, state) => ({ ...request, rank: state.index * profile.weight }))
      .toSorted((left, right) => left.rank - right.rank)
      .toArray();

    const groupedByTenant = new Map<string, readonly QueuedSuiteInput<TInput>[]>();
    for (const request of queue) {
      const current = groupedByTenant.get(request.tenant) ?? [];
      groupedByTenant.set(request.tenant, [...current, request]);
    }

    const outputs: SuiteResult<TOutput>[] = [];
    const tenantStreams = [...groupedByTenant.values()];
    const active: Array<Promise<SuiteResult<TOutput>>> = [];
    const max = Math.max(1, profile.maxConcurrency);

    await using _scope = createDisposableScope();
    for (const stream of tenantStreams) {
      for (const entry of stream) {
        const suiteRequest: SuiteRequest<TInput> = {
          tenant: entry.tenant,
          workspace: entry.workspace,
          scenario: entry.scenario,
          policies: entry.policies,
          seedInput: entry.seedInput,
        };
        const job = this.#orchestrator.run(suiteRequest, transform);
        active.push(job);

        if (active.length < max) {
          continue;
        }

        const settled = await Promise.race(
          active.map(async (inFlight) => ({ inFlight, value: await inFlight })),
        );
        const doneIndex = active.findIndex((item) => item === settled.inFlight);
        if (doneIndex >= 0) {
          active.splice(doneIndex, 1);
        }
        outputs.push(settled.value);
        await this.#sleep(profile.windowMs);
      }
    }

    if (active.length > 0) {
      const doneJobs = await Promise.all(active);
      for (const doneJob of doneJobs) {
        outputs.push(doneJob);
      }
    }

    return outputs;
  }

  public async runScenarioSeries<TInput, TOutput>(
    requests: readonly SchedulerInput<TInput>[],
    transform: (input: TInput) => NoInfer<TOutput>,
  ): Promise<readonly SuiteResult<TOutput>[]> {
    const suiteRequests: SuiteRequest<TInput>[] = requests.map((request) => ({
      tenant: request.tenant,
      workspace: request.workspace,
      scenario: request.scenario,
      policies: request.policies,
      seedInput: request.seedInput,
    }));

    return this.#orchestrator.runBatch(suiteRequests, transform);
  }

  public totalProfiles(
    values: readonly SchedulerProfile[],
  ): readonly {
    readonly id: string;
    readonly normalizedWeight: number;
    readonly windowMs: number;
    readonly maxConcurrency: number;
  }[] {
    return values
      .map((value) => ({
        id: value.id,
        normalizedWeight: value.weight / (defaultProfile.weight || 1),
        windowMs: value.windowMs,
        maxConcurrency: value.maxConcurrency,
      }))
      .toSorted((left, right) => right.normalizedWeight - left.normalizedWeight);
  }

  public async pipelineProfiles<TInput, TOutput>(
    inputs: readonly SchedulerInput<TInput>[],
    profiles: readonly SchedulerProfile[],
    transform: (input: TInput) => NoInfer<TOutput>,
  ): Promise<Map<string, readonly SuiteResult<TOutput>[]>> {
    const grouped = new Map<string, readonly SuiteResult<TOutput>[]>();
    const profileList = this.totalProfiles(profiles);
    const flowInputs = flow(inputs).toArray();

    for (const profile of profileList) {
      const inputCount = profile.windowMs % Math.max(1, flowInputs.length);
      const normalized = flowInputs.slice(0, inputCount);
      const run = await this.runProfiledBatch(
        {
          ...defaultProfile,
          id: profile.id,
          weight: profile.normalizedWeight,
          windowMs: profile.windowMs,
          maxConcurrency: profile.maxConcurrency,
        },
        normalized.map((entry) => ({
          ...entry,
          seedInput: entry.seedInput,
        })),
        transform,
      );

      grouped.set(profile.id, run);
    }

    return grouped;
  }

  public profileCount(): number {
    return 1;
  }

  #sleep = (durationMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, durationMs));
}

export const orchestrateBatches = async <TInput, TOutput>(
  requests: readonly SchedulerInput<TInput>[],
  transform: (input: TInput) => NoInfer<TOutput>,
): Promise<readonly SuiteResult<TOutput>[]> => {
  const scheduler = new SuiteScheduler();
  return scheduler.runScenarioSeries(requests, transform);
};

export const runBatchWithProfile = async <TInput, TOutput>(
  requests: readonly SchedulerInput<TInput>[],
  profile: SchedulerProfile,
  transform: (input: TInput) => NoInfer<TOutput>,
): Promise<readonly SuiteResult<TOutput>[]> => {
  const scheduler = new SuiteScheduler();
  return scheduler.runProfiledBatch(profile, requests, transform);
};
