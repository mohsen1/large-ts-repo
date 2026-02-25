export interface HttpAdapterSeed {
  readonly baseUrl: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly headers: Record<string, string>;
}

export interface HttpAdapterOptions {
  readonly timeoutMs?: number;
  readonly tracePrefix?: string;
  readonly validateSsl?: boolean;
}

export class StudioHttpAdapter {
  readonly #seed: HttpAdapterSeed;
  readonly #options: Required<HttpAdapterOptions>;
  #aborted = false;

  constructor(seed: HttpAdapterSeed, options: HttpAdapterOptions = {}) {
    this.#seed = seed;
    this.#options = {
      timeoutMs: 10_000,
      tracePrefix: 'studio',
      validateSsl: true,
      ...options,
    };
  }

  private makeUrl(path: string): string {
    const normalized = path.startsWith('/') ? path.slice(1) : path;
    return `${this.#seed.baseUrl}/v1/${normalized}`;
  }

  async send<T>(path: string, body: unknown): Promise<T> {
    if (this.#aborted) {
      throw new Error('adapter aborted');
    }

    const headers = {
      ...this.#seed.headers,
      'x-tenant': this.#seed.tenantId,
      'x-workspace': this.#seed.workspaceId,
      'x-trace-prefix': this.#options.tracePrefix,
      'content-type': 'application/json',
    };

    const response = await fetch(this.makeUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`http ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(this.makeUrl(path), {
      method: 'GET',
      headers: this.#seed.headers,
    });

    if (!response.ok) {
      throw new Error(`http ${response.status}`);
    }

    return (await response.json()) as T;
  }

  abort() {
    this.#aborted = true;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.abort();
    return Promise.resolve();
  }
}

export interface HttpCommandEnvelope {
  readonly command: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly options?: Record<string, unknown>;
}

export const createHttpEnvelope = (input: {
  tenantId: string;
  workspaceId: string;
  artifactId: string;
  command: string;
  options?: Record<string, unknown>;
}): HttpCommandEnvelope => ({
  command: input.command,
  tenantId: input.tenantId,
  workspaceId: input.workspaceId,
  artifactId: input.artifactId,
  options: input.options,
});

export const resolveCommandUrl = (command: string, tenant: string, workspace: string): string =>
  `/playbooks/${tenant}/${workspace}/${encodeURIComponent(command)}`;
