import { parseAssessment } from '@domain/recovery-situational-intelligence';
import { parsePlan, parseSignal } from './adapter';
import type { AuditEvent, SituationalRepository, PersistedAssessment, SituationalStoreQuery, InMemorySituationState } from './types';
import type {
  SituationalAssessment,
  SituationalSnapshot,
  RecoveryWorkloadNode,
  SituationalSignal,
  RecoveryPlanCandidate,
} from '@domain/recovery-situational-intelligence';
import type { Result } from '@shared/result';

const toIso = () => new Date().toISOString();

const mergeById = <T extends { assessmentId?: string; id?: string }>(items: readonly T[], key: keyof T, value: string): T | undefined =>
  items.find((item) => item[key] === value);

class InMemorySituationalRepository implements SituationalRepository {
  private readonly snapshots = new Map<string, SituationalSnapshot[]>();
  private readonly signals = new Map<string, SituationalSignal[]>();
  private readonly plans = new Map<string, RecoveryPlanCandidate[]>();
  private readonly assessments = new Map<string, PersistedAssessment>();
  private readonly nodes: RecoveryWorkloadNode[] = [];
  private readonly audits: AuditEvent[] = [];

  async saveAssessment(assessment: SituationalAssessment): Promise<PersistedAssessment> {
    const parsed = parseAssessment(assessment);
    const record: PersistedAssessment = {
      id: parsed.assessmentId,
      assessment: parsed,
      createdAt: toIso(),
      updatedAt: toIso(),
    };
    this.assessments.set(parsed.assessmentId, record);
    this.audits.push({ at: toIso(), type: 'assessment.saved', assessmentId: parsed.assessmentId, metadata: { node: parsed.workload.nodeId } });
    return record;
  }

  async listAssessments(query?: SituationalStoreQuery): Promise<readonly PersistedAssessment[]> {
    const records = [...this.assessments.values()];
    if (!query) {
      return records;
    }

    return records.filter((record) => {
      if (query.workloadNodeIds.length === 0) {
        return true;
      }
      return query.workloadNodeIds.includes(record.assessment.workload.nodeId);
    });
  }

  async getAssessment(assessmentId: string): Promise<PersistedAssessment | undefined> {
    return this.assessments.get(assessmentId);
  }

  async appendSnapshots(inputs: readonly SituationalSnapshot[]): Promise<void> {
    const map = new Map<string, SituationalSnapshot[]>();
    for (const snapshot of inputs) {
      const existing = map.get(snapshot.workloadNodeId) ?? [];
      map.set(snapshot.workloadNodeId, [...existing, snapshot].sort((left, right) => left.measuredAt.localeCompare(right.measuredAt)));
    }
    for (const [nodeId, snapshots] of map) {
      const merged = [...(this.snapshots.get(nodeId) ?? []), ...snapshots];
      this.snapshots.set(nodeId, merged);
      this.audits.push({ at: toIso(), type: 'snapshot.ingested', snapshotCount: snapshots.length, metadata: { nodeId } });
    }
  }

  async getSnapshots(workloadNodeId: string): Promise<readonly SituationalSnapshot[]> {
    return [...(this.snapshots.get(workloadNodeId) ?? [])].sort((left, right) => left.measuredAt.localeCompare(right.measuredAt));
  }

  async writePlan(plan: RecoveryPlanCandidate): Promise<void> {
    const normalized = parsePlan(plan);
    const existing = this.plans.get(normalized.workloadNodeId) ?? [];
    this.plans.set(normalized.workloadNodeId, [...existing, normalized]);
    this.audits.push({
      at: toIso(),
      type: 'plan.saved',
      metadata: { workloadNodeId: normalized.workloadNodeId, confidence: normalized.confidence },
    });
  }

  async listPlans(workloadNodeId: string): Promise<readonly RecoveryPlanCandidate[]> {
    const list = this.plans.get(workloadNodeId) ?? [];
    return [...list].sort((left, right) => right.confidence - left.confidence);
  }

  async upsertSignals(signals: readonly SituationalSignal[]): Promise<void> {
    const map = new Map<string, SituationalSignal[]>();
    for (const signal of signals) {
      const parsed = parseSignal(signal);
      const current = map.get(parsed.domain) ?? [];
      map.set(parsed.domain, [...current, parsed]);
    }

    for (const [domain, domainSignals] of map) {
      const existing = this.signals.get(domain) ?? [];
      const merged = [...existing, ...domainSignals]
        .filter((signal, index, all) => all.findIndex((item) => item.signalId === signal.signalId) === index)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      this.signals.set(domain, merged);
      this.audits.push({
        at: toIso(),
        type: 'signal.ingested',
        metadata: { domain, count: merged.length },
      });
    }
  }

  async readSignals(workloadNodeId: string): Promise<readonly SituationalSignal[]> {
    return [...(this.signals.get(workloadNodeId) ?? [])];
  }

  getState(): InMemorySituationState {
    return {
      workloadNodes: [...this.nodes],
      latestAssessments: [...this.assessments.values()].slice(-20),
      snapshots: new Map(this.snapshots),
    };
  }
}

export const createSituationalStore = (): SituationalRepository => new InMemorySituationalRepository();

export const extractResult = async <T>(outcome: Promise<Result<T, string>>): Promise<T> => {
  const result = await outcome;
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};
