import { fail, ok, type Result } from '@shared/result';
import { studioCommandSchema, type StudioCommand } from './contracts';
import {
  normalizeArtifact,
  normalizeTenant,
  normalizeWorkspace,
  type StudioCommandNames,
} from './contracts';

export interface StudioRoute {
  readonly command: StudioCommandNames;
  readonly tenantId: string;
  readonly workspaceId: string;
}

export interface ParsedStudioCommand {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sessionId?: string;
  readonly command: StudioCommand;
  readonly artifactId: string;
  readonly runId?: string;
}

export const parseStudioCommand = (payload: unknown): Result<ParsedStudioCommand, string> => {
  const parsed = studioCommandSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(parsed.error.message);
  }

  const command = parsed.data;
  const artifact = normalizeArtifact(command.artifactId);
  const tenantId = normalizeTenant(command.tenantId);
  const workspaceId = normalizeWorkspace(command.workspaceId);

  const result: ParsedStudioCommand = {
    command,
    artifactId: String(artifact),
    tenantId: String(tenantId),
    workspaceId: String(workspaceId),
  };

  if (command.command === 'prepare') {
    return ok(
      command.sessionId === undefined
        ? result
        : { ...result, sessionId: command.sessionId },
    );
  }

  if (command.command === 'execute' || command.command === 'audit') {
    return ok({ ...result, runId: command.runId });
  }

  return ok(result);
};

export const resolveRoute = (route: StudioRoute): string =>
  `/${route.command}/${route.tenantId}/${route.workspaceId}`;

export const isHighPriority = (command: StudioCommandNames): boolean => command === 'execute';

export const canonicalize = (value: ParsedStudioCommand): ParsedStudioCommand => ({
  ...value,
  artifactId: value.artifactId.trim().toLowerCase(),
  command: value.command,
});
