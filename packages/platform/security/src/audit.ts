export interface AuditRecord {
  at: Date;
  actor: string;
  action: string;
  target: string;
  allowed: boolean;
}

export interface AuditBackend {
  emit(record: AuditRecord): Promise<void>;
}

export class InMemoryAudit implements AuditBackend {
  private logs: AuditRecord[] = [];
  async emit(record: AuditRecord): Promise<void> {
    this.logs.push(record);
  }
  all(): AuditRecord[] {
    return [...this.logs];
  }
}

export function authorize(actor: string, action: string, target: string): boolean {
  return actor.length > 0 && action.length > 0 && target.length > 0;
}

export async function guard(provider: AuditBackend, actor: string, action: string, target: string): Promise<boolean> {
  const allowed = authorize(actor, action, target);
  await provider.emit({
    at: new Date(),
    actor,
    action,
    target,
    allowed,
  });
  return allowed;
}
