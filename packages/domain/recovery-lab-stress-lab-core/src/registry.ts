import { randomUUID } from 'node:crypto';
import { Brand, toRuntimeChecksum, toTenantId } from '@shared/orchestration-lab-core';
import { PluginRegistry } from '@shared/orchestration-lab-core';
import { type RuntimeSignal } from '@shared/orchestration-lab-core';
import type { ChaosPluginDefinition, ChaosRuntimeSignal, ChaosTelemetry } from './contracts';
import {
  artifactId,
  type LabArtifact,
  type LabDirective,
  type LabMode,
  type LabPlanOutput,
  type RunPlanId,
  type TenantId,
  type LabPlanInput,
} from './types';

type Wait = (ms: number) => Promise<void>;
const sleep: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toDirectiveWeight = (value: number): Brand<number, 'DirectiveWeight'> => value as Brand<number, 'DirectiveWeight'>;
const asTenant = (value: string): TenantId => toTenantId(value);
const toPriority = (index: number): 1 | 2 | 3 | 4 | 5 => ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5;
const asChaosRuntime = (tenant: TenantId, mode: LabMode, runtime: readonly RuntimeSignal[]): readonly ChaosRuntimeSignal[] =>
  runtime.map((value) => ({
    ...value,
    tenant,
    mode,
  }));

const makeTelemetry = (mode: LabMode, phase: string, signalCount: number): ChaosTelemetry => ({
  scope: `scope:lab:${mode}`,
  durationMs: 5,
  signalCount,
  metric: 1 as Brand<number, 'ReliabilityMetric'>,
  phase: `stage:${phase}`,
});

const buildArtifact = (mode: LabMode, tenant: string): LabArtifact => ({
  id: artifactId(tenant),
  tenant: asTenant(tenant),
  mode,
  createdAt: new Date().toISOString(),
  checksum: toRuntimeChecksum(`artifact:${mode}:${tenant}:${randomUUID()}`),
  metadata: {
    mode,
    generated: new Date().toISOString(),
    source: 'registry',
  },
});

const makeDirective = (mode: LabMode, signal: ChaosRuntimeSignal, index: number): LabDirective => ({
  id: `directive:${mode}:${signal.fingerprint}:${index}`,
  mode,
  priority: toPriority(index),
  title: `Directive ${index} for ${mode}`,
  tags: [`tag:${mode}`, `tag:${index}`],
  clauses: [
    {
      id: `directive:${mode}:${index}`,
      service: signal.category,
      action: String(signal.fingerprint),
      budget: Math.max(1, String(signal.fingerprint).length % 10),
    },
  ],
  weight: toDirectiveWeight(index + 1),
  summary: `severity=${signal.severity};mode=${mode}`,
});

export type LabExecutionInput = {
  readonly runId: RunPlanId;
  readonly tenant: TenantId;
  readonly title: string;
  readonly mode: LabMode;
  readonly directives: readonly LabDirective[];
  readonly artifacts: readonly LabArtifact[];
};

const outputFromInput = (mode: LabMode, tenant: string, input: LabExecutionInput): LabPlanOutput => ({
  runId: input.runId,
  tenant: toTenantId(tenant),
  title: input.title,
  mode,
  directives: [],
  artifacts: [buildArtifact(mode, tenant)],
});

type DiscoverPluginName<TMode extends LabMode> = `plugin:${TMode}-discover`;
type ValidatePluginName<TMode extends LabMode> = `plugin:${TMode}-validate`;
type ExecutePluginName<TMode extends LabMode> = `plugin:${TMode}-execute`;
type RollbackPluginName<TMode extends LabMode> = `plugin:${TMode}-rollback`;

type PluginList<TMode extends LabMode> = readonly [
  ChaosPluginDefinition<DiscoverPluginName<TMode>, LabExecutionInput, LabPlanOutput>,
  ChaosPluginDefinition<ValidatePluginName<TMode>, LabExecutionInput, LabPlanOutput>,
  ChaosPluginDefinition<ExecutePluginName<TMode>, LabExecutionInput, LabPlanOutput>,
  ChaosPluginDefinition<RollbackPluginName<TMode>, LabExecutionInput, LabPlanOutput>,
];

const createStepPlugin = <TMode extends LabMode>(mode: TMode): PluginList<TMode>[0] => ({
  name: `plugin:${mode}-discover`,
  namespace: `namespace:${mode}-lab`,
  version: 'v1.0',
  dependsOn: [],
  tags: ['tag:discover'],
  description: `${mode} discovery`,
  run: async (input, _context, runtime) => {
    const parsed = input as LabExecutionInput;
    await sleep(5);
    const chaosRuntime = asChaosRuntime(parsed.tenant, mode, runtime);
    const directives = chaosRuntime.map((signal, index) => makeDirective(mode, signal, index));
    const output = outputFromInput(mode, String(parsed.tenant), parsed);
    return {
      status: 'success',
      output: { ...output, directives },
      telemetry: makeTelemetry(mode, 'discovery', chaosRuntime.length),
      summary: `discover:${directives.length}`,
      message: 'Discovery completed',
    };
  },
});

const createValidatePlugin = <TMode extends LabMode>(mode: TMode): PluginList<TMode>[1] => ({
  name: `plugin:${mode}-validate`,
  namespace: `namespace:${mode}-lab`,
  version: 'v1.0',
  dependsOn: [`plugin:${mode}-discover`],
  tags: ['tag:validate'],
  description: `${mode} validation`,
  run: async (input, _context, runtime) => {
    const parsed = input as LabExecutionInput;
    await sleep(8);
    const chaosRuntime = asChaosRuntime(parsed.tenant, mode, runtime);
    const enriched = parsed.directives.map((directive, index) => ({
      ...directive,
      title: `Validated ${directive.title} (${index})`,
      summary: `${directive.summary}::validated`,
    }));
    return {
      status: 'success',
      output: {
        ...parsed,
        directives: enriched,
      },
      telemetry: makeTelemetry(mode, 'validation', chaosRuntime.length),
      summary: `validate:${enriched.length}`,
      message: 'Validation completed',
    };
  },
});

const createExecutePlugin = <TMode extends LabMode>(mode: TMode): PluginList<TMode>[2] => ({
  name: `plugin:${mode}-execute`,
  namespace: `namespace:${mode}-lab`,
  version: 'v1.0',
  dependsOn: [`plugin:${mode}-validate`],
  tags: ['tag:execute'],
  description: `${mode} execution`,
  run: async (input, context, runtime) => {
    const parsed = input as LabExecutionInput;
    await sleep(11);
    const chaosRuntime = asChaosRuntime(parsed.tenant, mode, runtime);
    const result = {
      ...parsed,
      artifacts: [
        ...parsed.artifacts,
        {
          ...buildArtifact(mode, String(parsed.tenant)),
          id: artifactId(`${String(context.tenant)}-${String(context.commandId)}`),
          metadata: {
            mode,
            runtime: chaosRuntime.length,
          },
        },
      ],
      directives: parsed.directives,
    };
    return {
      status: 'success',
      output: result,
      telemetry: makeTelemetry(mode, 'execution', chaosRuntime.length),
      summary: `execute:${result.artifacts.length}`,
      message: 'Execution stage complete',
    };
  },
});

const createRollbackPlugin = <TMode extends LabMode>(mode: TMode): PluginList<TMode>[3] => ({
  name: `plugin:${mode}-rollback`,
  namespace: `namespace:${mode}-lab`,
  version: 'v1.0',
  dependsOn: [`plugin:${mode}-execute`],
  tags: ['tag:rollback'],
  description: `${mode} rollback`,
  run: async (input, _context, runtime) => {
    const parsed = input as LabExecutionInput;
    await sleep(2);
    const chaosRuntime = asChaosRuntime(parsed.tenant, mode, runtime);
    return {
      status: chaosRuntime.length > 8 ? 'error' : 'success',
      output: {
        ...parsed,
      },
      telemetry: makeTelemetry(mode, 'rollback', chaosRuntime.length),
      summary: `rollback:${chaosRuntime.length}`,
      message: 'Rollback stage complete',
    };
  },
});

export const createChaosPlugins = <TMode extends LabMode>(mode: TMode): PluginList<TMode> => [
  createStepPlugin(mode),
  createValidatePlugin(mode),
  createExecutePlugin(mode),
  createRollbackPlugin(mode),
];

export const pluginNamesFor = (mode: LabMode): readonly [
  DiscoverPluginName<typeof mode>,
  ValidatePluginName<typeof mode>,
  ExecutePluginName<typeof mode>,
  RollbackPluginName<typeof mode>,
] => [
  `plugin:${mode}-discover`,
  `plugin:${mode}-validate`,
  `plugin:${mode}-execute`,
  `plugin:${mode}-rollback`,
] as const;

export const buildRegistry = <TMode extends LabMode>(mode: TMode): PluginRegistry<PluginList<TMode>> =>
  new PluginRegistry(createChaosPlugins(mode));

export const buildExecutionSeed = (input: LabPlanInput): LabExecutionInput => ({
  runId: input.runId,
  tenant: input.tenant,
  title: input.title,
  mode: input.mode,
  directives: [],
  artifacts: [],
});
