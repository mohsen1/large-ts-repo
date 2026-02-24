import type { CadenceDraft, CadencePlan, CadenceWorkspaceState, FabricWorkspaceId } from './types';
import { assessPlan } from './constraints';
import { fail, ok, type Result } from '@shared/result';

export interface FabricCadenceStore {
  saveDraft: (draft: CadenceDraft) => Promise<Result<void, Error>>;
  readLatestDraft: (workspaceId: FabricWorkspaceId) => Promise<CadenceDraft | undefined>;
  clearDraft: (workspaceId: FabricWorkspaceId) => Promise<void>;
}

export interface FabricCadenceLogger {
  pushEvent: (workspaceId: FabricWorkspaceId, event: string, payload: Record<string, unknown>) => void;
}

export const createInMemoryStore = (): FabricCadenceStore => {
  const drafts = new Map<string, CadenceDraft>();
  return {
    async saveDraft(draft) {
      if (draft.candidatePlan.workspaceId.length < 3) {
        return fail(new Error('invalid workspace'));
      }
      drafts.set(draft.candidatePlan.workspaceId, draft);
      return ok(undefined);
    },
    async readLatestDraft(workspaceId) {
      return drafts.get(workspaceId);
    },
    async clearDraft(workspaceId) {
      drafts.delete(workspaceId);
    },
  };
};

export const createInMemoryLogger = (): FabricCadenceLogger => ({
  pushEvent(workspaceId, event, payload) {
    void { workspaceId, event, payload };
  },
});

export const createPlanEvaluator = () => ({
  validatePlan(plan: CadencePlan): boolean {
    return assessPlan(plan).length === 0;
  },
});

export const validateState = (_state: CadenceWorkspaceState | undefined): boolean => true;
