import { Brand } from '@shared/type-level';
import { type Result, fail, ok } from '@shared/result';
import {
  type AutomationBlueprint,
  type AutomationBlueprintStep,
  type AutomationStage,
  type PluginId,
  parseBlueprintFromJson,
  buildManifest,
  type RecoveryCockpitPluginDescriptor,
} from '@domain/recovery-cockpit-orchestration-core';

export type CompilePhase = 'normalize' | 'validate' | 'materialize';

export type AutomationCompileReport = {
  readonly blueprintId: Brand<string, 'AutomationBlueprintId'>;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly phases: readonly CompilePhase[];
  readonly issues: ReadonlyArray<string>;
  readonly manifest: ReturnType<typeof buildManifest>;
};

export type CompiledBlueprint<TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>> = {
  readonly blueprint: AutomationBlueprint<TDescriptor>;
  readonly report: AutomationCompileReport;
  readonly descriptors: ReadonlyArray<TDescriptor>;
};

export type CompileResult<TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>> =
  Result<CompiledBlueprint<TDescriptor>, Error>;

type PlanIssue = {
  readonly code: 'W001' | 'E001' | 'E002';
  readonly message: string;
};

const toArray = <T>(value: Iterable<T>): T[] => {
  const out: T[] = [];
  for (const item of value) {
    out.push(item);
  }
  return out;
};

const isValidDependsOn = <TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>(
  steps: readonly AutomationBlueprintStep<TDescriptor>[],
): PlanIssue[] => {
  const byStep = new Set(steps.map((step) => step.stepId));
  const issues: PlanIssue[] = [];
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!byStep.has(dependency)) {
        issues.push({
          code: 'E001',
          message: `missing dependency ${dependency} for ${step.stepId}`,
        });
      }
    }
    if (step.retries < 0) {
      issues.push({
        code: 'E002',
        message: `invalid retries ${step.retries} for ${step.stepId}`,
      });
    }
    if (step.timeoutMs < 10) {
      issues.push({
        code: 'W001',
        message: `timeout too low for ${step.stepId}`,
      });
    }
  }
  return issues;
};

const rankStage = (stage: AutomationStage): number => ['discover', 'compose', 'execute', 'verify', 'audit'].indexOf(stage);

const normalizeSteps = <TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>(
  steps: readonly AutomationBlueprintStep<TDescriptor>[],
): readonly AutomationBlueprintStep<TDescriptor>[] => {
  return toArray(steps).slice().sort((left, right) => rankStage(left.plugin.stage) - rankStage(right.plugin.stage));
};

export const compileFromJson = async <TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>(
  source: string,
  manifestTenant: Brand<string, 'Tenant'>,
): Promise<CompileResult<TDescriptor>> => {
  const parsed = parseBlueprintFromJson(source) as AutomationBlueprint<TDescriptor> | undefined;
  if (!parsed) {
    return fail(new Error('invalid JSON blueprint'));
  }
  return compileBlueprint(parsed, manifestTenant);
};

export const compileBlueprint = async <TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>(
  blueprint: AutomationBlueprint<TDescriptor>,
  manifestTenant: Brand<string, 'Tenant'>,
): Promise<CompileResult<TDescriptor>> => {
  const startedAt = new Date().toISOString();
  const phases: CompilePhase[] = ['normalize'];
  const issues = isValidDependsOn(blueprint.steps);

  const normalized = {
    ...blueprint,
    steps: normalizeSteps(blueprint.steps),
  };

  phases.push('validate');
  if (issues.some((issue) => issue.code.startsWith('E'))) {
    return fail(new Error(issues[0]?.message ?? 'validation errors'));
  }

  const descriptors = normalized.steps.map((step) => step.plugin);
  const manifest = buildManifest(manifestTenant, normalized);

  phases.push('materialize');
  return ok({
    blueprint: normalized,
    report: {
      blueprintId: normalized.header.blueprintId,
      startedAt,
      finishedAt: new Date().toISOString(),
      phases,
      issues: issues.map((issue) => issue.message),
      manifest,
    },
    descriptors,
  });
};

export const runCompilationDry = async <TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>(
  blueprint: AutomationBlueprint<TDescriptor>,
  tenant: Brand<string, 'Tenant'>,
): Promise<Result<CompiledBlueprint<TDescriptor>, Error>> => {
  const result = await compileBlueprint(blueprint, tenant);
  if (!result.ok) return fail(result.error, result.code);
  return ok(result.value);
};

export const runBlueprintValidation = <TDescriptor extends RecoveryCockpitPluginDescriptor<PluginId, AutomationStage>>(
  blueprint: AutomationBlueprint<TDescriptor>,
): ReadonlyArray<string> => isValidDependsOn(blueprint.steps).map((issue) => issue.message);
