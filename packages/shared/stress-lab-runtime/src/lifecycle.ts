import {
  PluginContext,
  type PluginNamespace,
  type PluginResultOk,
} from './plugin-registry';
import { type PluginNamespace as RuntimePluginNamespace } from './ids';

export interface PluginSessionConfig {
  readonly startedAt: string;
  readonly requestId: string;
  readonly tenantId: string;
  readonly namespace: RuntimePluginNamespace;
}

export interface PluginSessionHandle<T> {
  readonly value: T;
  readonly session: PluginSession;
}

export class PluginSession {
  #open = true;
  #createdAt = new Date().toISOString();

  constructor(private readonly config: PluginSessionConfig) {}

  [Symbol.dispose](): void {
    this.#open = false;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#open = false;
    return Promise.resolve();
  }

  getId(): string {
    return this.config.requestId;
  }

  isOpen(): boolean {
    return this.#open;
  }

  asContext<TConfig>(): PluginContext<TConfig> {
    return {
      startedAt: this.#createdAt,
      tenantId: this.config.tenantId,
      requestId: this.config.requestId,
      namespace: this.config.namespace,
      config: {} as TConfig,
    };
  }

  getContext<TConfig = Record<string, unknown>>(): PluginContext<TConfig> {
    return this.asContext<TConfig>();
  }
}

export class SessionPool {
  private readonly sessions = new Map<string, PluginSession>();

  create(config: PluginSessionConfig): PluginSession {
    const session = new PluginSession(config);
    this.sessions.set(session.getId(), session);
    return session;
  }

  size(): number {
    return this.sessions.size;
  }
}

export const createPluginContext = <TConfig>(
  tenantId: string,
  namespace: PluginNamespace,
  requestId: string,
  config: TConfig,
): PluginContext<TConfig> => ({
  tenantId,
  requestId,
  namespace,
  startedAt: new Date().toISOString(),
  config,
});

export const withPluginScope = async <T>(
  config: PluginSessionConfig,
  run: (session: PluginSession) => Promise<T>,
): Promise<T> => {
  using session = new PluginSession(config);
  return run(session);
};

export const withAsyncPluginScope = async <T>(
  config: PluginSessionConfig,
  run: (session: PluginSession) => Promise<T>,
): Promise<T> => {
  await using pool = new AsyncDisposableStack();
  const session = new PluginSession(config);
  pool.defer(() => session[Symbol.dispose]());
  return run(session);
};

export const buildPluginResult = <T>(value: T): PluginResultOk<T> => ({
  ok: true,
  value,
  generatedAt: new Date().toISOString(),
});

export const pluginSessionConfigFrom = (tenantId: string, namespace: PluginNamespace, requestId: string): PluginSessionConfig => ({
  tenantId,
  namespace,
  requestId,
  startedAt: new Date().toISOString(),
});
