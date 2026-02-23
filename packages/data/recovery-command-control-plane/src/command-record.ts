import type { CommandBundle, CommandDirective, CommandIntent, CommandIntentEnvelope } from '@domain/recovery-command-language';
import { ok, err, type Result } from '@shared/result';

export interface CommandEnvelopeRecord {
  id: string;
  intent: CommandIntent;
  directives: CommandDirective[];
  state: 'queued' | 'approved' | 'executed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface CommandControlStore {
  read(id: string): Promise<Result<CommandEnvelopeRecord, Error>>;
  write(record: CommandEnvelopeRecord): Promise<Result<void, Error>>;
  listByState(state: CommandEnvelopeRecord['state']): Promise<Result<CommandEnvelopeRecord[], Error>>;
}

const store = new Map<string, CommandEnvelopeRecord>();

export async function buildRecordFromBundle(
  bundle: CommandBundle,
): Promise<Result<CommandEnvelopeRecord, Error>> {
  if (!bundle.intent.id) {
    return err(new Error('Intent id is required'));
  }

  const record: CommandEnvelopeRecord = {
    id: `record-${bundle.intent.id}`,
    intent: bundle.intent,
    directives: bundle.directives,
    state: bundle.dryRun ? 'queued' : 'approved',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return ok(record);
}

export class InMemoryCommandStore implements CommandControlStore {
  private records = store;

  async read(id: string): Promise<Result<CommandEnvelopeRecord, Error>> {
    const record = this.records.get(id);
    if (!record) {
      return err(new Error(`record ${id} not found`));
    }
    return ok(record);
  }

  async write(record: CommandEnvelopeRecord): Promise<Result<void, Error>> {
    if (!record.id) {
      return err(new Error('record id is required'));
    }
    this.records.set(record.id, {
      ...record,
      updatedAt: new Date().toISOString(),
    });
    return ok(undefined);
  }

  async listByState(state: CommandEnvelopeRecord['state']): Promise<Result<CommandEnvelopeRecord[], Error>> {
    const records = Array.from(this.records.values()).filter((record) => record.state === state);
    return ok(records);
  }
}

export function promoteIntentToRecord(intent: CommandIntent, directives: CommandDirective[]): CommandIntent {
  return {
    ...intent,
    payload: { ...intent.payload, promoted: true },
  };
}

export const toEnvelopeRecord = async (
  intent: CommandIntentEnvelope,
  directives: CommandDirective[],
): Promise<Result<CommandEnvelopeRecord, Error>> => {
  return buildRecordFromBundle({
    intent,
    directives,
    dryRun: false,
  });
};
