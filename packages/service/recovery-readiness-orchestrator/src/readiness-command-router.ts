import { Result, ok, fail } from '@shared/result';
import { RecoveryReadinessOrchestrator } from './orchestrator';
import type { ReadinessPolicy, ReadinessRunId, RecoveryTargetId, DirectiveId } from '@domain/recovery-readiness';
import { createReadinessPolicy, ReadinessWorkbench } from './readiness-workbench';
import type { ReadinessSignal } from '@domain/recovery-readiness';

export type ReadinessCommandVerb = 'bootstrap' | 'reconcile' | 'inspect' | 'health';

export interface ReadinessCommandInput {
  verb: ReadinessCommandVerb;
  tenantId: string;
  runId?: ReadinessRunId;
  signals?: number;
  owner?: string;
}

export interface ReadinessCommandRecord {
  commandId: string;
  tenantId: string;
  verb: ReadinessCommandVerb;
  createdAt: string;
  status: 'accepted' | 'rejected';
  statusMessage: string;
}

interface ReadinessBootstrapInput {
  tenantId: string;
  owner: string;
  targetIds: readonly string[];
  signalCount: number;
}

const toPlanDraft = ({ tenantId, owner, targetIds }: ReadinessBootstrapInput) => ({
  runId: `${tenantId}:${Date.now()}` as ReadinessRunId,
  title: `bootstrap:${tenantId}`,
  objective: 'continuous readiness',
  owner,
  targetIds: targetIds.map((targetId) => targetId as RecoveryTargetId),
  directiveIds: [] as DirectiveId[],
});

const severityCycle = (value: number): ReadinessSignal['severity'] => {
  if (value % 17 === 0) return 'critical';
  if (value % 7 === 0) return 'high';
  if (value % 3 === 0) return 'medium';
  return 'low';
};

const buildSignals = (count: number, runId: ReadinessRunId): ReadinessSignal[] =>
  new Array(Math.max(1, count)).fill(0).map((_, index) => ({
    signalId: `${runId}:signal:${index}` as ReadinessSignal['signalId'],
    runId,
    source: index % 2 === 0 ? 'telemetry' : 'synthetic',
    targetId: `target:${index % 3}` as ReadinessSignal['targetId'],
    name: `Signal ${index}`,
    severity: severityCycle(index),
    capturedAt: new Date(Date.now() + index * 60_000).toISOString(),
    details: {
      idx: index,
      target: `target-${index % 3}`,
    },
  }));

export class ReadinessCommandRouter {
  private readonly orchestrator: RecoveryReadinessOrchestrator;
  private readonly history: ReadinessCommandRecord[] = [];
  private readonly workbench: ReadinessWorkbench;

  constructor(policy?: ReadinessPolicy) {
    const resolved = policy ?? createReadinessPolicy('readiness-router');
    this.orchestrator = new RecoveryReadinessOrchestrator({ policy: resolved });
    this.workbench = new ReadinessWorkbench(resolved);
  }

  async dispatch(input: ReadinessCommandInput): Promise<Result<string, Error>> {
    const commandId = `${input.verb}:${input.tenantId}:${Date.now()}`;
    try {
      let statusMessage = 'ok';

      if (input.verb === 'bootstrap') {
        const draft = toPlanDraft({
          tenantId: input.tenantId,
          owner: input.owner ?? input.tenantId,
          targetIds: [input.tenantId, 'global'],
          signalCount: input.signals ?? 8,
        });
        const signals = buildSignals(input.signals ?? 8, draft.runId);
        const bootstrap = await this.orchestrator.bootstrap(draft, signals);
        if (!bootstrap.ok) {
          return this.recordFailure(commandId, input.tenantId, input.verb, bootstrap.error.message);
        }
        this.workbench.inspectPlan({ targets: [], signals });
        statusMessage = `bootstrapped=${bootstrap.value}`;
      }

      if (input.verb === 'reconcile') {
        if (!input.runId) {
          return this.recordFailure(commandId, input.tenantId, input.verb, 'runId-required');
        }
        const result = await this.orchestrator.reconcile(input.runId);
        if (!result.ok) {
          return this.recordFailure(commandId, input.tenantId, input.verb, result.error.message);
        }
        statusMessage = `state=${result.value}`;
      }

      if (input.verb === 'inspect') {
        if (!input.runId) {
          return this.recordFailure(commandId, input.tenantId, input.verb, 'runId-required');
        }
        await this.orchestrator.inspect(input.runId);
        statusMessage = `inspected=${input.runId}`;
      }

      if (input.verb === 'health') {
        await this.orchestrator.healthSnapshot();
        statusMessage = 'health-ok';
      }

      this.pushRecord({
        commandId,
        tenantId: input.tenantId,
        verb: input.verb,
        createdAt: new Date().toISOString(),
        status: 'accepted',
        statusMessage,
      });
      return ok(commandId);
    } catch (error) {
      return this.recordFailure(commandId, input.tenantId, input.verb, error instanceof Error ? error.message : 'command-failed');
    }
  }

  listHistory(limit = 12): ReadinessCommandRecord[] {
    return [...this.history].slice(-limit).reverse();
  }

  clearHistory(): void {
    this.history.length = 0;
  }

  private pushRecord(record: ReadinessCommandRecord): void {
    this.history.push(record);
    if (this.history.length > 250) {
      this.history.splice(0, this.history.length - 250);
    }
  }

  private recordFailure(commandId: string, tenantId: string, verb: ReadinessCommandVerb, message: string): Result<string, Error> {
    this.pushRecord({
      commandId,
      tenantId,
      verb,
      createdAt: new Date().toISOString(),
      status: 'rejected',
      statusMessage: message,
    });
    return fail(new Error(message));
  }
}
