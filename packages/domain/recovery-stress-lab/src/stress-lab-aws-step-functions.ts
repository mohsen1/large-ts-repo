import {
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
  type DescribeExecutionCommandInput,
  type DescribeExecutionOutput,
  type StartExecutionCommandInput,
} from '@aws-sdk/client-sfn';
import { normalizeLimit } from '@shared/core';
import { canonicalizeNamespace, type PluginNamespace } from '@shared/stress-lab-runtime/ids';
import { PluginSession, pluginSessionConfigFrom, withAsyncPluginScope } from '@shared/stress-lab-runtime/lifecycle';

export type AwsRunState = 'ready' | 'scheduled' | 'running' | 'success' | 'failed' | 'cancelled';
export type AwsRunId = `arn:${string}`;
export type AwsRunRequestId = `${string}-${string}-${number}`;

export interface AwsRunRecord<TPayload extends object = object> {
  readonly runId: AwsRunId;
  readonly name: string;
  readonly requestedAt: string;
  readonly payload: TPayload;
  readonly region: string;
}

export interface AwsRunResult<TPayload extends object = object> {
  readonly requestId: AwsRunRequestId;
  readonly payload: TPayload;
  readonly runId: AwsRunId;
  readonly status: AwsRunState;
  readonly details: string;
}

const toRunRequestId = () => {
  const now = Date.now();
  return `${Math.floor(now / 1000)}-${Math.floor(Math.random() * 1000)}-${now}` as AwsRunRequestId;
};

const toRegionSeed = (region: string) => Math.max(1, normalizeLimit(region.replace('_', '-').length));
const toPayload = (output: Record<string, unknown> | undefined) => output ?? {};

export class StressLabAwsAdapter {
  readonly tenantId: string;
  readonly region: string;
  readonly stateMachineArn: string;
  readonly namespace: PluginNamespace;
  readonly #client: SFNClient;
  readonly #session: PluginSession;

  constructor(tenantId: string, stateMachineArn: string, region = 'us-east-1') {
    this.tenantId = tenantId;
    this.region = region;
    this.stateMachineArn = stateMachineArn;
    this.namespace = canonicalizeNamespace(`recovery:stress:lab:aws:${region}`);
    this.#client = new SFNClient({ region, maxAttempts: toRegionSeed(region) });
    this.#session = new PluginSession(
      pluginSessionConfigFrom(tenantId, this.namespace, `aws-adapter:${tenantId}:${region}`),
    );
  }

  [Symbol.dispose](): void {
    this.#client.destroy();
    this.#session[Symbol.dispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#session[Symbol.asyncDispose]();
  }

  async run<TInput extends object = object, TOutput extends object = object>(
    tenantToken: string,
    input: TInput,
  ): Promise<AwsRunResult<TOutput>> {
    const requestId = `${tenantToken}-${toRunRequestId()}`;

    return withAsyncPluginScope(
      pluginSessionConfigFrom(this.tenantId, this.namespace, requestId),
      async () => {
        const payload = JSON.stringify(input);
        try {
          const startCommand = new StartExecutionCommand({
            stateMachineArn: this.stateMachineArn,
            name: requestId,
            input: payload,
          } satisfies StartExecutionCommandInput);

          const started = await this.#client.send(startCommand);
          if (!started.executionArn) {
            return {
              requestId: requestId as AwsRunRequestId,
              payload: (input as unknown as TOutput),
              runId: `${this.stateMachineArn}:missing-exec` as AwsRunId,
              status: 'failed',
              details: 'missing executionArn',
            };
          }

          return this.poll<TOutput>(started.executionArn, requestId, payload);
        } catch (error) {
          return {
            requestId: requestId as AwsRunRequestId,
            payload: (input as unknown as TOutput),
            runId: `${this.stateMachineArn}:failed-start` as AwsRunId,
            status: 'failed',
            details: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );
  }

  async poll<TOutput extends object = object>(
    executionArn: string,
    requestId: string,
    payload: string,
  ): Promise<AwsRunResult<TOutput>> {
    const input = JSON.parse(payload) as Record<string, unknown>;
    const describeCommand = new DescribeExecutionCommand({
      executionArn,
    } satisfies DescribeExecutionCommandInput);
    const described = (await this.#client.send(describeCommand)) as DescribeExecutionOutput;
    const status = this.mapStatus(described.status ?? 'RUNNING');

    return {
      requestId: requestId as AwsRunRequestId,
      payload: toPayload((described.output as unknown) as Record<string, unknown>) as TOutput,
      runId: (executionArn === '' ? `${this.stateMachineArn}:empty` : executionArn) as AwsRunId,
      status,
      details:
        status === 'failed' ? this.resolveFailureReason(input, described) : JSON.stringify(described),
    };
  }

  private mapStatus(status: string): AwsRunState {
    if (status === 'SUCCEEDED') return 'success';
    if (status === 'FAILED') return 'failed';
    if (status === 'TIMED_OUT') return 'failed';
    if (status === 'ABORTED') return 'cancelled';
    if (status === 'RUNNING') return 'running';
    if (status === 'STARTED') return 'scheduled';
    return 'ready';
  }

  private resolveFailureReason(input: Record<string, unknown>, described: DescribeExecutionOutput): string {
    if (described.error) {
      return described.error;
    }
    if (described.cause) {
      return described.cause;
    }
    if (typeof input.tenantId === 'string' && input.tenantId.length > 0) {
      return `state-machine-ready:${input.tenantId}`;
    }
    return 'state-machine-unknown';
  }
}

export const createAwsAdapter = (
  tenantId: string,
  stateMachineArn: string,
  region?: string,
): StressLabAwsAdapter => new StressLabAwsAdapter(tenantId, stateMachineArn, region);

export const supportsAwsAdapter = Boolean(
  typeof process.env.AWS_REGION === 'string' && process.env.AWS_REGION.length > 0 &&
    typeof process.env.AWS_ACCESS_KEY_ID === 'string' && process.env.AWS_ACCESS_KEY_ID.length > 0,
);
