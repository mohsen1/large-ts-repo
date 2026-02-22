import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import type { ReadinessSignal, RecoveryReadinessPlanDraft, RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { ReadinessRunId } from '@domain/recovery-readiness';

export type StageResult<T> = {
  ok: boolean;
  value?: T;
  errors: readonly string[];
};

export interface StageContext {
  runId: ReadinessRunId;
  requestedBy: string;
  traceId: string;
}

export interface PipelineStep<I, O> {
  name: string;
  execute(context: StageContext, input: I): Promise<StageResult<O>>;
}

export class ReadinessPipeline<I, O> {
  private readonly steps: PipelineStep<any, any>[];

  constructor(steps: PipelineStep<any, any>[]) {
    this.steps = steps;
  }

  async run(input: I, context: StageContext): Promise<StageResult<O>> {
    let cursor: any = input;
    const errors: string[] = [];

    for (const step of this.steps) {
      const outcome = await step.execute(context, cursor);
      errors.push(...outcome.errors);
      if (!outcome.ok) {
        return {
          ok: false,
          errors,
        };
      }
      cursor = outcome.value;
    }

    return {
      ok: true,
      value: cursor as O,
      errors: [],
    };
  }
}

export function buildSignalsStep() : PipelineStep<RecoveryReadinessPlanDraft, ReadinessSignal[]> {
  return {
    name: 'seedSignals',
    async execute(context: StageContext, input: RecoveryReadinessPlanDraft) {
      const signals = input.targetIds.map((targetId, index: number) => ({
        signalId: `signal:${context.runId}:${targetId}` as never,
        runId: context.runId as never,
        targetId,
        source: 'telemetry',
        name: `bootstrap:${targetId}`,
        severity: (index % 4 === 0 ? 'high' : index % 3 === 0 ? 'medium' : 'low') as ReadinessSignal['severity'],
        capturedAt: new Date().toISOString(),
        details: { generatedBy: context.traceId },
      }));

      return { ok: true, value: signals as ReadinessSignal[], errors: [] };
    },
  };
}

export function buildDraftStep(): PipelineStep<{ draft: RecoveryReadinessPlanDraft; signals: ReadinessSignal[] }, ReadinessReadModel> {
  return {
    name: 'materializeDraft',
    async execute(context: StageContext, input: { draft: RecoveryReadinessPlanDraft; signals: ReadinessSignal[] }) {
      const model: ReadinessReadModel = {
        plan: {
          planId: `${context.runId}:plan:${input.draft.title.toLowerCase().replace(/\s+/g, '-')}` as RecoveryReadinessPlan['planId'],
          runId: context.runId as ReadinessReadModel['plan']['runId'],
          title: input.draft.title,
          objective: input.draft.objective,
          state: 'draft',
          createdAt: new Date().toISOString(),
          targets: input.draft.targetIds.map((targetId) => ({
            id: targetId as ReadinessReadModel['targets'][number]['id'],
            name: `Target ${targetId}`,
            ownerTeam: input.draft.owner,
            region: 'us-east-1',
            criticality: 'medium',
            owners: [input.draft.owner],
          })),
          windows: [],
          signals: input.signals,
          riskBand: 'green',
          metadata: { owner: input.draft.owner, tags: ['bootstrap', context.traceId], tenant: context.runId },
        },
        targets: [],
        signals: input.signals,
        directives: [],
        revision: 0,
        updatedAt: new Date().toISOString(),
      };

      return { ok: true, value: model, errors: [] };
    },
  };
}
