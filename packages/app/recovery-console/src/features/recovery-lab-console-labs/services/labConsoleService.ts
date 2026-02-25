import {
  buildPluginId,
  executeControlLabRun,
  asLabBlueprintId,
  asLabPluginName,
  pluginTopicFor,
  readManifestSummary,
  asLabOperator,
  asLabTenantId,
  asLabWorkspaceId,
  buildEventRoute,
  type ControlLabBlueprint,
  type ControlLabContext,
  type ControlLabPlugin,
  type ControlLabTimeline,
  type LabRunOutput,
} from '@domain/recovery-lab-console-labs';
import {
  type RuntimeFacadeOptions,
  type RuntimeResultRow,
} from '../types';

type RawSignalPayload = Readonly<{
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly signal: string;
  readonly score: number;
  readonly payload: Record<string, unknown>;
}>;

interface PluginResultEnvelope {
  readonly stage: string;
  readonly plugin: string;
  readonly payload: string;
}

type PluginRunPayload = Readonly<{
  readonly input: ReturnType<typeof createInputPayload>;
  readonly source: string;
  readonly signal: string;
}>;

const createInputPayload = (signal: RawSignalPayload): Readonly<{
  readonly signal: string;
  readonly score: number;
  readonly values: readonly number[];
}> => ({
  signal: signal.signal,
  score: signal.score,
  values: Object.values(signal.payload).filter((value): value is number => typeof value === 'number'),
});

const buildPlugin = (name: string, stage: 'collect' | 'validate' | 'simulate' | 'synthesize' | 'audit'): ControlLabPlugin => ({
  id: buildPluginId(name, 'topology'),
  name: asLabPluginName(`plugin:${name}`),
  kind: `${name}-kind`,
  topic: pluginTopicFor(`${name}:${stage}`),
  verbs: ['run'],
  emits: ['event'],
  category: stage === 'collect' ? 'telemetry' : stage === 'validate' ? 'planner' : 'simulator',
  domain: 'topology',
  dependencies: [] as const,
  stage,
  transport: 'inproc',
  weight: 1,
  metadata: {
    createdBy: 'recovery-console',
    strategy: 'adaptive',
  },
  async run(input, context) {
    return {
      status: 'passed' as const,
      emitted: true,
      notes: [
        `tenant=${context.tenantId}`,
        `run=${context.runId}`,
        `stage=${stage}`,
      ],
      output: {
        stage,
        input,
        plugin: name,
        signature: buildEventRoute(context.runId, stage),
      },
    };
  },
});

const pluginCatalog = [
  buildPlugin('collect', 'collect'),
  buildPlugin('validate', 'validate'),
  buildPlugin('simulate', 'simulate'),
  buildPlugin('synthesize', 'synthesize'),
  buildPlugin('audit', 'audit'),
] as const;

const blueprintFromOptions = (options: RuntimeFacadeOptions): ControlLabBlueprint => ({
  blueprintId: asLabBlueprintId(`${options.tenantId}::${options.workspaceId}::lab`),
  tenantId: asLabTenantId(options.tenantId),
  workspaceId: asLabWorkspaceId(options.workspaceId),
  signalClasses: ['topology', 'signal'],
  stageOrder: ['collect', 'validate', 'simulate', 'synthesize', 'audit'],
  operator: asLabOperator(options.operator),
  startedAt: new Date().toISOString(),
  pluginKinds: ['telemetry', 'planner', 'simulator', 'advice', 'observer'],
});

const enrichTimeline = (timeline: ControlLabTimeline): readonly PluginResultEnvelope[] =>
  timeline.events.map((event, index) => ({
    stage: event.kind,
    plugin: String((event.payload as { plugin?: string }).plugin ?? 'unknown'),
    payload: `${index}-${event.trace}`,
  }));

const mapToRegistrySummary = (run: LabRunOutput<Record<string, unknown>>): RuntimeResultRow => ({
  runId: run.runId,
  elapsedMs: run.elapsedMs,
  summary: `${run.blueprintId} ${run.output['stage'] ?? 'aggregate'}`,
  pluginNames: run.timeline.events.map((event) => event.kind),
});

export interface LabWorkspaceService {
  run(signal: RawSignalPayload): Promise<{
    readonly run: LabRunOutput<Record<string, unknown>>;
    readonly timeline: readonly PluginResultEnvelope[];
    readonly summary: RuntimeResultRow;
  }>;
  bootstrapDiagnostics(): string[];
}

export const createLabWorkspaceService = (options: RuntimeFacadeOptions): LabWorkspaceService => {
  const summary = readManifestSummary({
    tenantId: options.tenantId,
    workspaceId: options.workspaceId,
    operator: options.operator,
    signalClasses: ['topology', 'signal'],
    stageOrder: ['collect', 'validate', 'simulate', 'synthesize', 'audit'],
  });

  const blueprint = blueprintFromOptions(options);
  const runContext: Omit<ControlLabContext, 'runId' | 'pluginId'> = {
    tenantId: asLabTenantId(options.tenantId),
    workspaceId: asLabWorkspaceId(options.workspaceId),
    operator: asLabOperator(options.operator),
    signature: `${options.tenantId}::${options.workspaceId}::${options.operator}`,
    context: {
      bootstrap: 'runtime',
      signalCount: summary.topicCount,
    },
  };

  return {
    async run(signal: RawSignalPayload) {
      const payload = createInputPayload(signal);
      const runResult = await executeControlLabRun<typeof pluginCatalog, PluginRunPayload, Record<string, unknown>>(
        pluginCatalog,
        blueprint,
        {
          ...runContext,
          signature: `${runContext.signature}::${signal.signal}`,
        },
        {
          input: payload,
          source: signal.tenantId,
          signal: payload.signal,
        },
        {
          timeoutMs: 30_000,
          allowPartial: options.mode === 'audit-only',
          retryCount: options.mode === 'simulate+policy' ? 3 : 1,
        },
      );

      const timeline = enrichTimeline(runResult.timeline);
      const summaryRow = mapToRegistrySummary(runResult);
      return {
        run: runResult as LabRunOutput<Record<string, unknown>>,
        timeline,
        summary: summaryRow,
      };
    },
    bootstrapDiagnostics() {
      return [
        `blueprint=${blueprint.blueprintId}`,
        `tenant=${options.tenantId}`,
        `runTopics=${summary.topicCount}`,
        `stageCount=${summary.stageCount}`,
      ];
    },
  };
};
