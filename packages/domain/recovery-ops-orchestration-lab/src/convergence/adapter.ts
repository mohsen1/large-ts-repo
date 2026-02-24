import type { JsonValue } from '@shared/type-level';
import type {
  ConvergencePlan,
  ConvergencePlanId,
  ConvergenceRunEvent,
  ConvergenceRunId,
  ConvergenceRunResult,
  ConvergenceSignal,
  ConvergenceTag,
  ConvergenceWorkspace,
  ConvergenceWorkspaceId,
} from './types';
import { isJsonValue, parseConvergenceRun, parseConvergenceWorkspace } from './schemas';

type ConvergenceRawPlanConstraint = readonly { key: string; value: unknown }[];

type ParsedPlan = {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly score: number;
  readonly steps: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly command: string;
    readonly arguments: readonly unknown[];
    readonly reversible: boolean;
    readonly dependencies: readonly string[];
  }>;
  readonly constraints: ConvergenceRawPlanConstraint;
  readonly createdAt: string;
  readonly metadata: Record<string, unknown>;
};

type ParsedWorkspace = {
  readonly id: string;
  readonly domainId: string;
  readonly policyId: string;
  readonly domain: ConvergenceWorkspace['domain'];
  readonly health: ConvergenceWorkspace['health'];
  readonly planBudget: number;
  readonly signals: ReadonlyArray<{
    readonly id: string;
    readonly source: string;
    readonly tier: ConvergenceSignal['tier'];
    readonly score: number;
    readonly domain: ConvergenceWorkspace['domain'];
    readonly tags: ReadonlyArray<{
      readonly key: string;
      readonly value: string;
    }>;
    readonly observedAt: string;
  }>;
  readonly plans: ReadonlyArray<ParsedPlan>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type ParsedRunEvent = {
  readonly type: ConvergenceRunEvent['type'];
  readonly at: string;
  readonly runId: string;
  readonly phase?: ConvergenceRunEvent['phase'];
  readonly payload?: unknown;
};

type ParsedRun = {
  readonly runId: string;
  readonly workspaceId: string;
  readonly durationMs: number;
  readonly status: ConvergenceRunResult['status'];
  readonly metrics: ConvergenceRunResult['metrics'];
  readonly events: readonly ParsedRunEvent[];
};

type TagValue = ConvergenceTag['key'];

export interface ConvergenceAdapter<TInput extends object = object, TOutput extends object = object> {
  readonly id: string;
  readonly name: string;
  transform(input: TInput): Promise<TOutput>;
}

export interface ConvergenceAdapterLease {
  readonly adapterId: string;
  get released(): boolean;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface ConvergenceTransport {
  readonly workspaceId: ConvergenceWorkspaceId;
  readonly fetchWorkspace: () => Promise<unknown>;
  readonly fetchRun: (runId: string) => Promise<unknown>;
}

const toWorkspaceId = (value: string): ConvergenceWorkspaceId => value as ConvergenceWorkspaceId;
const toDomainId = (value: string): ConvergenceWorkspace['domainId'] => value as ConvergenceWorkspace['domainId'];
const toRunId = (value: string): ConvergenceRunId => value as ConvergenceRunId;
const toSignalId = (value: string): ConvergenceSignal['id'] => value as ConvergenceSignal['id'];
const toPlanId = (value: string): ConvergencePlanId => value as ConvergencePlanId;

const toConvergencePhase = (value: string | undefined): ConvergenceRunEvent['phase'] | undefined =>
  value === 'discover'
  || value === 'prioritize'
  || value === 'simulate'
  || value === 'rehearse'
  || value === 'verify'
  || value === 'close'
    ? value
    : undefined;

const normalizeMetadata = (metadata: Record<string, unknown>): Readonly<Record<string, JsonValue>> => {
  if (!isJsonValue(metadata)) {
    return {};
  }
  return metadata as Readonly<Record<string, JsonValue>>;
};

const mapPlanConstraints = (constraints: ConvergenceRawPlanConstraint): ReadonlyMap<string, number> =>
  new Map(
    constraints
      .map((item) => [item.key, typeof item.value === 'number' ? item.value : Number.parseFloat(String(item.value))])
      .filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
  );

const mapPlan = (plan: ParsedPlan): ConvergencePlan => ({
  id: toPlanId(plan.id),
  workspaceId: toWorkspaceId(plan.workspaceId),
  title: plan.title,
  score: plan.score,
  steps: plan.steps.map((step) => ({
    id: step.id as ConvergencePlan['steps'][number]['id'],
    name: step.name,
    command: step.command,
    arguments: step.arguments,
    reversible: step.reversible,
    dependencies: step.dependencies,
  })),
  constraints: mapPlanConstraints(plan.constraints),
  createdAt: plan.createdAt,
  metadata: normalizeMetadata(plan.metadata),
});

const mapSignal = (signal: ParsedWorkspace['signals'][number]): ConvergenceSignal => ({
  id: toSignalId(signal.id),
  source: signal.source,
  tier: signal.tier,
  score: signal.score,
  domain: signal.domain,
  tags: signal.tags.map((entry) => ({
    key: `tag:${entry.key}` as TagValue,
    value: entry.value,
  })),
  observedAt: signal.observedAt,
});

const mapRunEvent = (event: ParsedRunEvent): ConvergenceRunEvent => ({
  type: event.type,
  at: event.at,
  runId: toRunId(event.runId),
  phase: toConvergencePhase(event.phase),
  payload: isJsonValue(event.payload) ? event.payload : null,
});

export const mapWorkspace = (raw: unknown): ConvergenceWorkspace => {
  const parsed = parseConvergenceWorkspace(raw) as ParsedWorkspace;
  return {
    id: toWorkspaceId(parsed.id),
    domainId: toDomainId(parsed.domainId),
    policyId: parsed.policyId,
    domain: parsed.domain,
    health: parsed.health,
    planBudget: parsed.planBudget,
    signals: parsed.signals.map(mapSignal),
    plans: parsed.plans.map(mapPlan),
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
};

export const mapRun = (raw: unknown): ConvergenceRunResult => {
  const parsed = parseConvergenceRun(raw) as ParsedRun;
  return {
    runId: toRunId(parsed.runId),
    workspaceId: toWorkspaceId(parsed.workspaceId),
    durationMs: parsed.durationMs,
    status: parsed.status,
    selectedPlan: undefined,
    metrics: parsed.metrics,
    events: parsed.events.map(mapRunEvent),
  };
};

export const createAdapter = <
  const TInput extends object,
  const TOutput extends object,
>(inputAdapter: ConvergenceAdapter<TInput, TOutput>): ConvergenceAdapter<TInput, TOutput> => inputAdapter;

class InMemoryLease implements ConvergenceAdapterLease {
  #released = false;
  constructor(readonly adapterId: string) {}
  get released(): boolean {
    return this.#released;
  }
  [Symbol.dispose](): void {
    this.#released = true;
  }
  async [Symbol.asyncDispose](): Promise<void> {
    this.#released = true;
  }
}

export const openAdapter = (adapterId: string): ConvergenceAdapterLease => {
  return new InMemoryLease(adapterId);
};

export const withTransport = async <T>(
  transport: ConvergenceTransport,
  action: (workspace: ConvergenceWorkspace, run: ConvergenceRunResult | undefined) => Promise<T>,
): Promise<T> => {
  const workspace = mapWorkspace(await transport.fetchWorkspace());
  const run = await transport.fetchRun(workspace.id).then((run) => {
    if (!run) {
      return undefined;
    }
    return mapRun(run);
  });

  await using lease = openAdapter(transport.workspaceId);
  return action(workspace, run);
};

export const collectWorkspaceSummaries = async (transports: readonly ConvergenceTransport[]): Promise<
  readonly Readonly<{ workspace: ConvergenceWorkspace; runState: ConvergenceRunResult | undefined }>[]
> => {
  const results: Array<{ workspace: ConvergenceWorkspace; runState: ConvergenceRunResult | undefined }> = [];

  for (const transport of transports) {
    await using lease = openAdapter(transport.workspaceId);
    const workspace = mapWorkspace(await transport.fetchWorkspace());
    const runState = await transport.fetchRun(workspace.id).then(async (raw) => {
      if (!raw) {
        return undefined;
      }
      return mapRun(raw);
    });

    results.push({ workspace, runState });
    lease[Symbol.dispose]();
  }

  return results;
};

export const toAdapterPayload = <TInput extends object>(
  adapter: ConvergenceAdapter<TInput, object>,
  values: readonly TInput[],
): readonly unknown[] =>
  values
    .map((value) => ({
      id: adapter.id,
      name: adapter.name,
      value,
      capturedAt: new Date().toISOString(),
    }));
