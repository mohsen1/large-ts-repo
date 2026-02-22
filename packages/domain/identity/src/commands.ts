import { UserId, TenantId } from './types';

export interface CreateUserCommand {
  tenantId: TenantId;
  userId: UserId;
  email: string;
  phone: string;
  displayName: string;
}

export interface UpdateUserCommand {
  userId: UserId;
  patch: {
    displayName?: string;
    phone?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface DisableUserCommand {
  userId: UserId;
  reason: string;
}

export interface DeleteUserCommand {
  userId: UserId;
  requestedBy: UserId;
}

export type IdentityCommand =
  | ({ type: 'identity.create' } & CreateUserCommand)
  | ({ type: 'identity.update' } & UpdateUserCommand)
  | ({ type: 'identity.disable' } & DisableUserCommand)
  | ({ type: 'identity.delete' } & DeleteUserCommand);

export const commandName = (command: IdentityCommand): string => command.type;

export const summarize = (command: IdentityCommand): string => {
  switch (command.type) {
    case 'identity.create':
      return `create:${command.userId}`;
    case 'identity.update':
      return `update:${command.userId}`;
    case 'identity.disable':
      return `disable:${command.userId}`;
    case 'identity.delete':
      return `delete:${command.userId}`;
    default:
      return 'unknown';
  }
};
