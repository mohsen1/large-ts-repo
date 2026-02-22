import { withBrand } from '@shared/core';
import type { ControlPlaneManifest } from '@domain/recovery-operations-control-plane';
import type { ControlPlaneSequence, ControlPlaneStoreQuery, ControlPlaneStoreRecord, ControlPlaneStoreRecordId, ControlPlaneStoreResult, ControlPlanePlanSummary } from './models';
import { ControlPlaneStore, toStoreRecord } from './repository';

const defaultBrand = (value: string, seed = '0'): ControlPlaneStoreRecordId =>
  withBrand(`${seed}:${value}`, 'ControlPlaneStoreRecordId');

const brandSequence = (value: number): ControlPlaneSequence =>
  value as unknown as ControlPlaneSequence;

interface StateRow {
  readonly id: ControlPlaneStoreRecordId;
  readonly tenant: string;
  readonly runId: string;
  readonly manifest: ControlPlaneManifest;
  readonly summary: ControlPlanePlanSummary;
  readonly sequence: number;
}

interface TenantState {
  readonly nextSequence: number;
  readonly rows: readonly StateRow[];
}

interface Index {
  [tenant: string]: TenantState | undefined;
}

export class InMemoryControlPlaneStore implements ControlPlaneStore {
  private readonly index: Index = {};

  private readTenant(tenant: string): TenantState {
    const existing = this.index[tenant];
    if (existing) return existing;
    const next: TenantState = { nextSequence: 0, rows: [] };
    this.index[tenant] = next;
    return next;
  }

  private writeTenant(tenant: string, state: TenantState): void {
    this.index[tenant] = state;
  }

  private nextSequence(tenant: string): number {
    const state = this.readTenant(tenant);
    const next = state.nextSequence + 1;
    this.writeTenant(tenant, { ...state, nextSequence: next });
    return next;
  }

  private inferState(manifest: ControlPlaneManifest): ControlPlaneStoreRecord['state']['state'] {
    if (manifest.plan.commands.some((command) => command.command === 'seal')) {
      return 'completed';
    }
    if (manifest.checkpoints.some((checkpoint) => checkpoint.status === 'blocked')) {
      return 'aborted';
    }
    if (manifest.plan.commands.length === 0) {
      return 'queued';
    }
    if (manifest.plan.commands.length < 3) {
      return 'armed';
    }
    if (manifest.checkpoints.length > 0) {
      return 'executing';
    }
    return 'queued';
  }

  async save(manifest: ControlPlaneManifest): Promise<ControlPlaneStoreResult<ControlPlaneStoreRecord>> {
    const tenant = manifest.tenant;
    const state = this.readTenant(tenant);
    const nextRowSequence = state.nextSequence + 1;
    const summary: ControlPlanePlanSummary = {
      tenant,
      planId: String(manifest.plan.programId),
      commandCount: manifest.plan.commands.length,
      hasConflicts: manifest.plan.gates.some((item) => item.includes('conflict')),
      riskBand: manifest.checkpoints.length > 5 ? 'high' : manifest.checkpoints.length > 2 ? 'medium' : 'low',
    };
    const baseline = toStoreRecord(manifest, summary);
    const record: StateRow = {
      id: defaultBrand(`${tenant}-${manifest.run}`, `row-${nextRowSequence}`),
      tenant,
      runId: String(manifest.run),
      manifest,
      summary,
      sequence: nextRowSequence,
    };
    const normalizedState = {
      id: record.id,
      state: {
        ...baseline.state,
        tenant,
        state: this.inferState(manifest),
      },
      summary: baseline.summary,
      diagnostics: baseline.diagnostics,
    };

    const nextRows = [...state.rows, record];
    this.writeTenant(tenant, { nextSequence: nextRowSequence, rows: nextRows });
    return {
      ok: true,
      value: normalizedState,
      sequence: brandSequence(nextRowSequence),
    };
  }

  async findByRun(tenant: string, runId: string): Promise<ControlPlaneStoreResult<ControlPlaneStoreRecord | undefined>> {
    const state = this.readTenant(tenant);
    const matched = state.rows.find((row) => row.runId === runId);
    if (!matched) {
      return {
        ok: false,
        error: 'record-not-found',
        sequence: brandSequence(this.nextSequence(tenant)),
      };
    }

    const resolved = toStoreRecord(matched.manifest, matched.summary);
    const resultRecord: ControlPlaneStoreRecord = {
      id: matched.id,
      state: {
        ...resolved.state,
        tenant,
        state: this.inferState(matched.manifest),
      },
      summary: resolved.summary,
      diagnostics: resolved.diagnostics,
    };

    return {
      ok: true,
      value: resultRecord,
      sequence: brandSequence(matched.sequence),
    };
  }

  async query(query: ControlPlaneStoreQuery): Promise<ControlPlaneStoreResult<readonly ControlPlaneStoreRecord[]>> {
    const state = this.readTenant(query.tenant);
    const now = Date.now();
    const rows = state.rows
      .map((entry) => {
        const parsed = toStoreRecord(entry.manifest, entry.summary);
        const resolvedState: ControlPlaneStoreRecord['state']['state'] = this.inferState(entry.manifest);
        const stateRecord: ControlPlaneStoreRecord = {
          id: entry.id,
          state: { ...parsed.state, tenant: query.tenant, state: resolvedState },
          summary: parsed.summary,
          diagnostics: parsed.diagnostics,
        };
        return stateRecord;
      })
      .filter((item) => (query.planId ? item.state.planId === query.planId : true))
      .filter((item) => {
        if (!query.states) return true;
        return query.states.includes(item.state.state);
      })
      .filter((item) => (query.from ? Date.parse(item.state.updatedAt) >= Date.parse(query.from) : true))
      .filter((item) => (query.to ? Date.parse(item.state.updatedAt) <= Date.parse(query.to) : true))
      .filter((item) => {
        const stale = now - Date.parse(item.state.updatedAt);
        return stale >= 0;
      });

    return {
      ok: true,
      value: rows,
      sequence: brandSequence(state.nextSequence),
    };
  };

  async delete(recordId: string): Promise<ControlPlaneStoreResult<boolean>> {
    const tenants = Object.keys(this.index);
    for (const tenant of tenants) {
      const state = this.readTenant(tenant);
      const nextRows = state.rows.filter((entry) => String(entry.id) !== recordId);
      if (nextRows.length !== state.rows.length) {
        this.writeTenant(tenant, {
          nextSequence: state.nextSequence,
          rows: nextRows,
        });
        return {
          ok: true,
          value: true,
          sequence: brandSequence(state.nextSequence),
        };
      }
    }

    return {
      ok: false,
      error: 'record-not-found',
      sequence: brandSequence(this.nextSequence('fallback')),
    };
  }
}

export const createStoreForTenant = (tenant: string): InMemoryControlPlaneStore => {
  if (!tenant) {
    throw new Error('tenant required');
  }
  return new InMemoryControlPlaneStore();
};
