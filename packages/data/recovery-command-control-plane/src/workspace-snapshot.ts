import type { CommandIntent, CommandDirective } from '@domain/recovery-command-language';

export interface WorkspaceState {
  commandIntents: CommandIntent[];
  activeDirectives: CommandDirective[];
  lastRefreshedAt: string;
  windowMinutes: number;
}

export interface SnapshotFilters {
  owner?: string;
  minPriority?: number;
  operation?: string;
  state?: string;
}

export function takeSnapshot(
  intents: CommandIntent[],
  directives: CommandDirective[],
  windowMinutes: number,
): WorkspaceState {
  return {
    commandIntents: intents,
    activeDirectives: directives,
    lastRefreshedAt: new Date().toISOString(),
    windowMinutes,
  };
}

export function filterByPriority(intents: CommandIntent[], minPriority: number): CommandIntent[] {
  return intents.filter((intent) => intent.priority >= minPriority);
}

export function isOpenIntent(intent: CommandIntent): boolean {
  return intent.payload?.open === true || intent.payload?.state === 'open';
}

export function buildActiveDirectiveSet(directives: CommandDirective[]): Record<string, CommandDirective[]> {
  return directives.reduce<Record<string, CommandDirective[]>>((acc, directive) => {
    const key = directive.commandIntentId;
    acc[key] = acc[key] ? [...acc[key], directive] : [directive];
    return acc;
  }, {});
}

export function summarizeWorkspace(state: WorkspaceState): string {
  const openCount = state.commandIntents.filter((intent) => isOpenIntent(intent)).length;
  const directiveCount = state.activeDirectives.length;
  return `workspace has ${state.commandIntents.length} intents, ${openCount} open, ${directiveCount} directives.`;
}
