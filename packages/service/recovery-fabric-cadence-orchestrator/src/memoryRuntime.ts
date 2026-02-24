import type { CadenceDraft, FabricWorkspaceId } from '@domain/recovery-fabric-cadence-core';
import { fail, ok, type Result } from '@shared/result';

export interface RuntimeState {
  readonly drafts: Map<string, CadenceDraft>;
  readonly activeDrafts: Map<FabricWorkspaceId, string[]>;
  readonly closed: Set<string>;
  readonly startedAtByRun: Map<string, number>;
}

export interface RuntimeRuntime {
  drafts: Map<string, CadenceDraft>;
  activeDrafts: Map<FabricWorkspaceId, string[]>;
  closed: Set<string>;
  startedAtByRun: Map<string, number>;
}

export const createRuntime = (): RuntimeRuntime => ({
  drafts: new Map<string, CadenceDraft>(),
  activeDrafts: new Map<FabricWorkspaceId, string[]>(),
  closed: new Set<string>(),
  startedAtByRun: new Map<string, number>(),
});

export const storeDraft = (runtime: RuntimeState, draft: CadenceDraft): void => {
  runtime.drafts.set(draft.draftId, draft);
  const list = runtime.activeDrafts.get(draft.candidatePlan.workspaceId) ?? [];
  runtime.activeDrafts.set(draft.candidatePlan.workspaceId, [...list, draft.draftId]);
};

export const findDraft = (
  runtime: RuntimeState,
  workspaceId: FabricWorkspaceId,
  draftId: string,
): Result<CadenceDraft, Error> => {
  const draft = runtime.drafts.get(draftId);
  if (!draft) {
    return fail(new Error(`draft ${draftId} not found`));
  }

  if (!runtime.activeDrafts.get(workspaceId)?.includes(draftId)) {
    return fail(new Error(`draft ${draftId} not in workspace ${workspaceId}`));
  }

  return ok(draft);
};

export const closeWorkspace = (runtime: RuntimeState, workspaceId: FabricWorkspaceId): void => {
  runtime.closed.add(workspaceId);
  runtime.activeDrafts.delete(workspaceId);
};

export const isWorkspaceClosed = (runtime: RuntimeState, workspaceId: string): boolean => runtime.closed.has(workspaceId);

export const recordRunStart = (runtime: RuntimeState, runId: string): void => {
  runtime.startedAtByRun.set(runId, Date.now());
};

export const getRunDurationMs = (runtime: RuntimeState, runId: string): number => {
  const start = runtime.startedAtByRun.get(runId);
  return start ? Date.now() - start : 0;
};
