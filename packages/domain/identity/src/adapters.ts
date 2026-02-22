import { CreateUserCommand, UpdateUserCommand, DisableUserCommand, DeleteUserCommand, IdentityCommand } from './commands';
import { createEnvelope } from '@shared/protocol';

export interface IdentityEvent {
  event: string;
  aggregateId: string;
  payload: unknown;
}

export const toEvent = (command: IdentityCommand): IdentityEvent => {
  switch (command.type) {
    case 'identity.create':
      return {
        event: 'identity.user_created',
        aggregateId: command.userId,
        payload: command,
      };
    case 'identity.update':
      return {
        event: 'identity.user_updated',
        aggregateId: command.userId,
        payload: command,
      };
    case 'identity.disable':
      return {
        event: 'identity.user_disabled',
        aggregateId: command.userId,
        payload: command,
      };
    case 'identity.delete':
      return {
        event: 'identity.user_deleted',
        aggregateId: command.userId,
        payload: command,
      };
  }
};

export const toProtocolEnvelope = <T>(command: IdentityCommand) =>
  createEnvelope<T>(`identity.${command.type}`, {
    command: command.type,
    payload: command,
  } as T);

export const asCreateCommand = (command: IdentityCommand): CreateUserCommand | undefined =>
  command.type === 'identity.create' ? command : undefined;

export const asUpdateCommand = (command: IdentityCommand): UpdateUserCommand | undefined =>
  command.type === 'identity.update' ? command : undefined;

export const asDisableCommand = (command: IdentityCommand): DisableUserCommand | undefined =>
  command.type === 'identity.disable' ? command : undefined;

export const asDeleteCommand = (command: IdentityCommand): DeleteUserCommand | undefined =>
  command.type === 'identity.delete' ? command : undefined;
