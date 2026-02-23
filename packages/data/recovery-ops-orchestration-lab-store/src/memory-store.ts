import type { Result } from '@shared/result';
import { ok, fail, fromPromise } from '@shared/result';
import type {
  OrchestrationLabEnvelope,
  OrchestrationLabRecord,
  RunRecordInput,
  LabRunRecord,
  LabQueryFilter,
  PagedResult,
  StoreSummary,
  LabStoreSnapshot,
} from './model';
import { queryLabs, queryRuns } from './query';
import { encodeRecord, encodeRun, decodeRecord, decodeRun, encodeSummary, decodeSummary } from './serializer';
import { summarizeStore } from './analytics';

const makeRunId = (value: string): LabRunRecord['runId'] => value as LabRunRecord['runId'];

export class RecoveryOpsOrchestrationLabStore {
  private readonly envelopes = new Map<string, OrchestrationLabRecord>();
  private readonly runs = new Map<string, LabRunRecord>();
  private readonly exports: string[] = [];

  upsertEnvelope(envelope: OrchestrationLabEnvelope): Result<OrchestrationLabRecord, Error> {
    try {
      const record: OrchestrationLabRecord = {
        envelope,
        selectedPlanId: envelope.plans[0]?.id,
      };
      this.envelopes.set(String(envelope.id), record);
      return ok(record);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('upsert-envelope'));
    }
  }

  recordRun(input: RunRecordInput): Promise<Result<LabRunRecord, Error>> {
    return fromPromise(
      new Promise<LabRunRecord>((resolve) => {
        const record: LabRunRecord = {
          runId: makeRunId(input.runId),
          labId: input.labId,
          planId: input.planId,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          status: input.status,
          logs: input.logs,
        };
        this.runs.set(String(record.runId), record);
        resolve(record);
      }),
    );
  }

  getEnvelope(id: string): OrchestrationLabRecord | undefined {
    return this.envelopes.get(id);
  }

  getRun(id: string): LabRunRecord | undefined {
    return this.runs.get(id);
  }

  searchEnvelopes(filter: LabQueryFilter): PagedResult<OrchestrationLabEnvelope> {
    return queryLabs([...this.envelopes.values()].map((entry) => entry.envelope), filter);
  }

  searchRuns(filter: LabQueryFilter): PagedResult<LabRunRecord> {
    return queryRuns([...this.runs.values()], filter);
  }

  getSummary(): StoreSummary {
    return summarizeStore([...this.envelopes.values()].map((entry) => entry.envelope), [...this.runs.values()]);
  }

  snapshot = async (): Promise<LabStoreSnapshot> => {
    const envelopes = [...this.envelopes.values()].map((entry) => entry.envelope);
    const runs = [...this.runs.values()];
    return {
      labs: envelopes.map((entry) => entry.lab),
      windows: [],
      runs,
      summary: summarizeStore(envelopes, runs),
      auditTrail: [],
    };
  };

  async exportEncodedEnvelope(id: string): Promise<Result<string, Error>> {
    const record = this.envelopes.get(id);
    if (!record) {
      return fail(new Error('envelope-not-found'));
    }
    return ok(encodeRecord(record));
  }

  async importEncodedEnvelope(payload: string): Promise<Result<OrchestrationLabEnvelope, Error>> {
    return fromPromise((async () => {
      const record = decodeRecord(payload);
      this.envelopes.set(String(record.envelope.id), record);
      return record.envelope;
    })());
  }

  async exportRun(id: string): Promise<Result<string, Error>> {
    const run = this.runs.get(id);
    if (!run) {
      return fail(new Error('run-not-found'));
    }
    return ok(encodeRun(run));
  }

  async importRun(payload: string): Promise<Result<LabRunRecord, Error>> {
    return fromPromise((async () => {
      const run = decodeRun(payload);
      this.runs.set(String(run.runId), run);
      return run;
    })());
  }

  async exportSummary(): Promise<Result<string, Error>> {
    return ok(encodeSummary(this.getSummary()));
  }

  async importSummary(payload: string): Promise<Result<StoreSummary, Error>> {
    return fromPromise(Promise.resolve().then(() => decodeSummary(payload)));
  }
}

export type RecoveryOpsOrchestrationLabStoreType = RecoveryOpsOrchestrationLabStore;
