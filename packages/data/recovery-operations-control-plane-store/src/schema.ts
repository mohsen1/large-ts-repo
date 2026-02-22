import type { ControlPlaneStoreRecord, ControlPlaneStoreQuery } from './models';
import { withBrand } from '@shared/core';

const isObject = (input: unknown): input is Record<string, unknown> =>
  Object.prototype.toString.call(input) === '[object Object]';

export const parseRecord = (input: unknown): ControlPlaneStoreRecord => {
  if (!isObject(input)) {
    throw new Error('invalid-control-plane-store-record');
  }

  const state = input.state;
  const summary = input.summary;
  const diagnostics = input.diagnostics;
  if (!isObject(state) || !isObject(summary) || !Array.isArray(diagnostics)) {
    throw new Error('invalid-control-plane-store-record');
  }

  return {
    id: withBrand(String(input.id ?? ''), 'ControlPlaneStoreRecordId'),
    state: {
      runId: String(state.runId ?? ''),
      envelopeId: String(state.envelopeId ?? ''),
      tenant: String(state.tenant ?? ''),
      planId: String(state.planId ?? ''),
      state: (state.state as ControlPlaneStoreRecord['state']['state']) ?? 'queued',
      updatedAt: String(state.updatedAt ?? ''),
    },
    summary: {
      tenant: String(summary.tenant ?? ''),
      planId: String(summary.planId ?? ''),
      commandCount: Number(summary.commandCount ?? 0),
      hasConflicts: Boolean(summary.hasConflicts),
      riskBand: (String(summary.riskBand ?? 'low') as 'low' | 'medium' | 'high'),
    },
    diagnostics: diagnostics.map((entry) => ({
      key: String((entry as { key?: unknown }).key ?? ''),
      value: Number((entry as { value?: unknown }).value ?? 0),
      observedAt: String((entry as { observedAt?: unknown }).observedAt ?? ''),
    })),
  };
};

export const parseQuery = (input: unknown): ControlPlaneStoreQuery => {
  if (!isObject(input)) {
    throw new Error('invalid-control-plane-query');
  }
  return {
    tenant: String(input.tenant ?? ''),
    planId: input.planId ? String(input.planId) : undefined,
    from: input.from ? String(input.from) : undefined,
    to: input.to ? String(input.to) : undefined,
    states: Array.isArray(input.states)
      ? input.states.map((state) => String(state))
          .filter((state) => state === 'queued' || state === 'armed' || state === 'executing' || state === 'aborted' || state === 'completed' || state === 'errored') as ControlPlaneStoreQuery['states']
      : undefined,
  };
};
