export class RecoverySynthesisPlaybookError extends Error {
  constructor(message: string, public readonly context: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = 'RecoverySynthesisPlaybookError';
  }
}

export class RecoverySynthesisLifecycleError extends Error {
  constructor(message: string, public readonly runId?: string) {
    super(`${runId ? `[${runId}] ` : ''}${message}`);
    this.name = 'RecoverySynthesisLifecycleError';
  }
}

