import { ok, fail, type Result } from '@shared/result';
import { withBrand } from '@shared/core';

import {
  type FabricAllocation,
  type FabricCommand,
  type FabricCommandInput,
  type FabricExecutionSnapshot,
} from './types';
import {
  buildFabricTrace,
  preparePlanDraft,
  validatePlanDraft,
  type FabricPlanDraft,
  type FabricPlanValidation,
} from './plan';
import { runScenarioSimulation } from './simulation';

export interface FabricExecutorOptions {
  readonly onProgress?: (snapshot: FabricExecutionSnapshot) => Promise<void> | void;
}

export class FabricController {
  private readonly options: FabricExecutorOptions;

  constructor(options: FabricExecutorOptions = {}) {
    this.options = options;
  }

  async execute(input: FabricCommandInput): Promise<Result<FabricCommandInput & { traceStatus: string }, Error>> {
    const draftResult = preparePlanDraft(input);
    if (!draftResult.ok) {
      return fail(draftResult.error);
    }

    const validation = validatePlanDraft(draftResult.value);
    if (!validation.policyAllowed) {
      return fail(new Error(validation.reasons.join(',')));
    }

    const simulation = runScenarioSimulation({
      scenario: input.scenario,
      candidate: input.candidate,
      allocation: input.allocation,
      runId: input.runId,
    });

    if (!simulation.ok) {
      return fail(simulation.error);
    }

    return this.runExecution(draftResult.value, validation, simulation.value.successProbability);
  }

  async executeDryRun(input: FabricCommandInput): Promise<Result<FabricPlanValidation, Error>> {
    const draftResult = preparePlanDraft(input);
    if (!draftResult.ok) return fail(draftResult.error);
    const validation = validatePlanDraft(draftResult.value);
    return ok(validation);
  }

  private async runExecution(
    draft: FabricPlanDraft,
    validation: FabricPlanValidation,
    score: number,
  ): Promise<Result<FabricCommandInput & { traceStatus: string }, Error>> {
    const trace = buildFabricTrace(draft);
    const snapshot: FabricExecutionSnapshot = {
      runId: draft.runId,
      activeCandidateId: draft.candidate.id as FabricCommandInput['candidate']['id'],
      command: withBrand(`fabric-${draft.runId}`, 'FabricCommand') as FabricCommand,
      progressPercent: 0,
      lastUpdatedAt: new Date().toISOString(),
      completedSteps: [],
    };

    await this.options.onProgress?.(snapshot);

    if (trace.status !== 'running') {
      return fail(new Error('trace-not-running'));
    }

    if (score < 0.2) {
      return ok({
        ...inputFromDraft(draft),
        traceStatus: 'warning-low-score',
      });
    }

    return ok({
      ...inputFromDraft(draft),
      traceStatus: validation.reasons.join('|'),
    });
  }
}

const inputFromDraft = (draft: FabricPlanDraft): FabricCommandInput => ({
  scenario: draft.scenario,
  candidate: draft.candidate,
  allocation: draftAllocation(draft),
  planId: draft.planId,
  runId: draft.runId,
});

const draftAllocation = (draft: FabricPlanDraft): FabricAllocation => draft.allocation;
