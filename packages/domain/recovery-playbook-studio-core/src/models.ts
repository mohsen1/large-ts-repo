import { fail, ok, type Result } from '@shared/result';
import {
  artifactId,
  runId,
  sessionId,
  tenantId,
  traceId,
  workspaceId,
  type ArtifactId,
  type RunId,
  type SessionId,
  type TenantId,
  type TraceId,
  type WorkspaceId,
} from '@shared/playbook-studio-runtime';
import { type Brand, withBrand } from '@shared/core';

export const stageKinds = ['plan', 'validate', 'execute', 'observe', 'review'] as const;
export type StageKind = (typeof stageKinds)[number];

export interface PlaybookStepTemplate {
  readonly id: string;
  readonly label: string;
  readonly dependencies: readonly string[];
  readonly durationMs: number;
}

export interface PlaybookTemplateBase {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly artifactId: ArtifactId;
  readonly strategy: 'reactive' | 'predictive' | 'safety';
  readonly title: string;
  readonly tags: readonly string[];
  readonly steps: readonly PlaybookStepTemplate[];
}

export type PlaybookStepState = 'pending' | 'skipped' | 'running' | 'passed' | 'blocked';

export interface PlaybookStepRun {
  readonly stepId: string;
  readonly state: PlaybookStepState;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly message?: string;
}

export interface PlaybookRun {
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly artifactId: ArtifactId;
  readonly traceId: TraceId;
  readonly requestedBy: string;
  readonly startedAt: string;
  readonly status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  readonly stages: readonly StageKind[];
  readonly steps: readonly PlaybookStepRun[];
}

export type TimelineScope<T> = T extends PlaybookRun ? `scope:${T['status']}` : `scope:${string}`;

export interface PlaybookTemplateRecord {
  readonly templateId: string;
  readonly template: PlaybookTemplateBase;
  readonly label: string;
}

export interface RunIntent {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly requestedBy: string;
  readonly templateId: string;
  readonly strategy: PlaybookTemplateBase['strategy'];
}

export type TemplateFor<T extends PlaybookTemplateBase['strategy']> = Extract<PlaybookTemplateBase, { strategy: T }>;

export type StageReport<T extends StageKind = StageKind> = {
  readonly stage: T;
  readonly elapsedMs: number;
  readonly complete: boolean;
  readonly details: string;
};

export type StepByStrategy<TStrategy extends PlaybookTemplateBase['strategy']> =
  TStrategy extends 'reactive'
    ? { readonly dryRun: true }
    : TStrategy extends 'predictive'
      ? { readonly confidence: number }
      : { readonly guardrails: readonly string[] };

export type StageOutput<TStage extends StageKind> = {
  readonly stage: TStage;
  readonly runId: RunId;
  readonly completedAt: string;
  readonly passed: boolean;
  readonly report: StageReport<TStage>;
};

export type PlaybookRunSummary<TStrategy extends PlaybookTemplateBase['strategy'] = PlaybookTemplateBase['strategy']> =
  RunIntent & StepByStrategy<TStrategy> & {
    readonly started: string;
    readonly completed?: string;
    readonly passed: boolean;
    readonly runId: RunId;
  };

const safeDate = (): string => new Date().toISOString();

export const parseRunIntent = (input: RunIntent): Result<RunIntent, string> => {
  if (!input.tenantId || !input.workspaceId || !input.artifactId || !input.requestedBy) {
    return fail('run-intent-incomplete');
  }
  if (!stageKinds.includes('plan')) {
    return fail('invalid-stage-kind');
  }

  return ok(input);
};

export const buildRunFromIntent = (intent: RunIntent): Result<PlaybookRun, string> => {
  const parsed = parseRunIntent(intent);
  if (!parsed.ok) return fail(parsed.error);

  return ok({
    runId: runId(`${intent.tenantId}-${intent.workspaceId}`),
    tenantId: tenantId(intent.tenantId),
    workspaceId: workspaceId(intent.workspaceId),
    artifactId: artifactId(intent.artifactId),
    traceId: traceId(`${intent.tenantId}-${intent.templateId}-${Date.now()}`),
    requestedBy: intent.requestedBy,
    startedAt: safeDate(),
    status: 'running',
    stages: ['plan', 'validate', 'execute'],
    steps: [],
  });
};

export const runStateLabel = (run: PlaybookRun): `${PlaybookRun['status']}:${boolean}` => `${run.status}:${run.steps.length > 0}`;

export type RecordByArtifact<TArtifacts extends readonly ArtifactId[]> = {
  [K in TArtifacts[number]]: {
    readonly artifactId: K;
    readonly active: boolean;
    readonly runCount: number;
  };
};

export type ArtifactRuns<TArtifact extends string> = {
  readonly artifactId: Brand<TArtifact, 'ArtifactKey'>;
  readonly timeline: readonly TimelineScope<PlaybookRun>[];
};

export const createRunRecord = (run: PlaybookRun): ArtifactRuns<PlaybookRun['runId']> => ({
  artifactId: withBrand(run.artifactId, 'ArtifactKey'),
  timeline: [`scope:${run.status}`],
});

export type TemplateIndex = Record<string, PlaybookTemplateRecord>;

export const toTemplateRecord = <
  const TTemplates extends readonly PlaybookTemplateBase[],
>(tenant: TenantId, workspace: WorkspaceId, templates: TTemplates): TemplateIndex => {
  const index: TemplateIndex = {};
  for (const item of templates) {
    const key = `${tenant}/${workspace}/${item.artifactId}`;
    index[key] = {
      templateId: key,
      template: item,
      label: item.title,
    };
  }
  return index;
};
