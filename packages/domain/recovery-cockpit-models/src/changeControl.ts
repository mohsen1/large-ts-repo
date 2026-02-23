import { RecoveryAction, RecoveryPlan } from './runtime';
import { AuditContext, EntityId, PlanId, toTimestamp } from './identifiers';
import { Region } from './identifiers';

export type ChangeId = `change:${string}`;

export type ChangeSeverity = 'low' | 'medium' | 'high' | 'critical';

export type PlanChangeCommand =
  | { kind: 'add-action'; action: RecoveryAction; at: string }
  | { kind: 'remove-action'; actionId: RecoveryAction['id']; at: string }
  | { kind: 'retag-action'; actionId: RecoveryAction['id']; tags: readonly string[]; at: string }
  | { kind: 'set-mode'; mode: RecoveryPlan['mode']; at: string }
  | { kind: 'set-safety'; safe: boolean; at: string };

export type ChangeValidation = {
  readonly commandId: ChangeId;
  readonly command: PlanChangeCommand;
  readonly valid: boolean;
  readonly reasons: readonly string[];
  readonly requestedBy: AuditContext['actor']['id'];
};

export type PlanChangeProposal = {
  readonly planId: PlanId;
  readonly requestId: string;
  readonly requestedBy: AuditContext['actor']['id'];
  readonly createdAt: string;
  readonly commands: readonly PlanChangeCommand[];
  readonly validation: readonly ChangeValidation[];
};

export type PlanChangeResult = {
  readonly plan: RecoveryPlan;
  readonly proposal: PlanChangeProposal;
  readonly touchedRegions: ReadonlyArray<Region>;
};

const normalizeTags = (tags: readonly string[]): ReadonlyArray<string> =>
  [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0))];

const touchRegions = (actions: readonly RecoveryAction[]): ReadonlyArray<Region> => {
  const regions = new Set<Region>();
  for (const action of actions) {
    regions.add(action.region as Region);
  }
  return [...regions];
};

export const newChangeId = (): ChangeId => `change:${Math.random().toString(36).slice(2)}` as ChangeId;

export const createEmptyProposal = (
  plan: RecoveryPlan,
  requestedBy: AuditContext['actor']['id'],
  requestId: string,
): PlanChangeProposal => ({
  planId: plan.planId,
  requestId,
  requestedBy,
  createdAt: toTimestamp(new Date()),
  commands: [],
  validation: [],
});

const validateCommand = (command: PlanChangeCommand, plan: RecoveryPlan): ChangeValidation => {
  const reasons: string[] = [];
  if (command.kind === 'add-action' && command.action.id.length < 3) {
    reasons.push('action id is too short');
  }
  if (command.kind === 'remove-action' && !plan.actions.some((action) => action.id === command.actionId)) {
    reasons.push('action does not exist');
  }
  if (command.kind === 'set-mode' && !['automated', 'manual', 'semi'].includes(command.mode)) {
    reasons.push('unsupported mode');
  }
  return {
    commandId: newChangeId(),
    command,
    valid: reasons.length === 0,
    reasons,
    requestedBy: 'system' as AuditContext['actor']['id'],
  };
};

export const mergePlanActions = (actions: readonly RecoveryAction[]): ReadonlyArray<RecoveryAction> =>
  actions
    .map((action) => action.id)
    .filter((id, index, all) => all.indexOf(id) === index)
    .map((id) => actions.find((action) => action.id === id))
    .filter((action): action is RecoveryAction => action !== undefined);

export const applyPlanChanges = (plan: RecoveryPlan, changes: readonly PlanChangeCommand[]): PlanChangeResult => {
  let nextPlan = { ...plan, actions: [...plan.actions] } as RecoveryPlan;
  for (const command of changes) {
    if (command.kind === 'add-action') {
      nextPlan = {
        ...nextPlan,
        actions: mergePlanActions([...nextPlan.actions, command.action]),
      };
      continue;
    }
    if (command.kind === 'remove-action') {
      nextPlan = {
        ...nextPlan,
        actions: nextPlan.actions.filter((action) => action.id !== command.actionId),
      };
      continue;
    }
    if (command.kind === 'retag-action') {
      const tags = normalizeTags(command.tags);
      nextPlan = {
        ...nextPlan,
        actions: nextPlan.actions.map((action) =>
          action.id === command.actionId ? { ...action, tags: tags.length ? tags : action.tags } : action,
        ),
      };
      continue;
    }
    if (command.kind === 'set-mode') {
      nextPlan = {
        ...nextPlan,
        mode: command.mode,
      };
      continue;
    }
    if (command.kind === 'set-safety') {
      nextPlan = {
        ...nextPlan,
        isSafe: command.safe,
      };
      continue;
    }
  }

  const proposal: PlanChangeProposal = {
    planId: plan.planId,
    requestId: `req:${new Date().toISOString()}`,
    requestedBy: 'orchestrator' as AuditContext['actor']['id'],
    createdAt: toTimestamp(new Date()),
    commands: changes,
    validation: changes.map((command) => validateCommand(command, nextPlan)),
  };

  return {
    plan: nextPlan,
    proposal,
    touchedRegions: touchRegions(nextPlan.actions),
  };
};

export const buildDefaultSafetyPatch = (plan: RecoveryPlan): PlanChangeProposal => {
  const command: PlanChangeCommand = {
    kind: 'set-safety',
    safe: plan.actions.every((action) => action.tags.includes('safe')),
    at: toTimestamp(new Date()),
  };
  return {
    planId: plan.planId,
    requestId: `default-safety:${plan.planId}`,
    requestedBy: 'policy' as AuditContext['actor']['id'],
    createdAt: toTimestamp(new Date()),
    commands: [command],
    validation: [validateCommand(command, plan)],
  };
};

export const buildDependencyFixupCommand = (plan: RecoveryPlan): PlanChangeCommand[] => {
  const duplicateRegions = touchRegions(plan.actions).filter((region, index, regions) => regions.indexOf(region) === index);
  return duplicateRegions.map((region) => ({
    kind: 'add-action',
    action: {
      id: `action:${region}` as EntityId,
      serviceCode: 'system' as unknown as RecoveryAction['serviceCode'],
      region: region as unknown as RecoveryAction['region'],
      command: `noop:${region}`,
      desiredState: 'up',
      dependencies: [],
      expectedDurationMinutes: 0,
      retriesAllowed: 0,
      tags: ['safe', 'dependency-fix'],
    },
    at: toTimestamp(new Date()),
  }));
};
