import { withBrand, type PageResult } from '@shared/core';
import {
  artifactId,
  runId,
  tenantId,
  workspaceId,
  type ArtifactId,
  type RunId,
  type TenantId,
  type WorkspaceId,
} from '@shared/playbook-studio-runtime';
import { buildRunFromIntent, type PlaybookTemplateBase } from './models';

interface SeedFixture {
  readonly artifactId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly title: string;
}

const FALLBACK_TEMPLATE: SeedFixture = {
  artifactId: 'fixture-artifact',
  tenantId: 'tenant-default',
  workspaceId: 'workspace-default',
  title: 'Fixture Playbook',
};

const hydrateTemplate = () => ({
    ...FALLBACK_TEMPLATE,
    strategy: 'predictive' as const,
    tags: ['fixture', 'predictive'],
    steps: [
      {
        id: 'plan',
        label: 'Plan',
        dependencies: [] as readonly string[],
        durationMs: 10,
      },
      {
        id: 'execute',
        label: 'Execute',
        dependencies: ['plan'],
        durationMs: 20,
      },
    ],
});

const loadedTemplate = hydrateTemplate();

export const defaultTemplate: PlaybookTemplateBase = {
  tenantId: tenantId(loadedTemplate.tenantId),
  workspaceId: workspaceId(loadedTemplate.workspaceId),
  artifactId: artifactId(loadedTemplate.artifactId),
  strategy: loadedTemplate.strategy,
  title: loadedTemplate.title,
  tags: [...loadedTemplate.tags],
  steps: [...loadedTemplate.steps],
};

export const defaultRunId = (seed: string): RunId => runId(`${seed}-${Math.floor(Date.now() / 1000)}`);
export const defaultTenant = tenantId(FALLBACK_TEMPLATE.tenantId);
export const defaultWorkspace = workspaceId(FALLBACK_TEMPLATE.workspaceId);
export const defaultArtifact = artifactId(FALLBACK_TEMPLATE.artifactId);

export const defaultTemplateIntent = buildRunFromIntent({
  tenantId: FALLBACK_TEMPLATE.tenantId,
  workspaceId: FALLBACK_TEMPLATE.workspaceId,
  artifactId: FALLBACK_TEMPLATE.artifactId,
  requestedBy: 'studio-bootstrap',
  templateId: `${FALLBACK_TEMPLATE.tenantId}-${FALLBACK_TEMPLATE.workspaceId}-bootstrap`,
  strategy: loadedTemplate.strategy,
});

export interface FixtureIndex {
  readonly tenant: TenantId;
  readonly workspace: WorkspaceId;
  readonly artifact: ArtifactId;
  readonly runId: RunId;
}

export const fallbackFixtureIndex: FixtureIndex = {
  tenant: defaultTenant,
  workspace: defaultWorkspace,
  artifact: defaultArtifact,
  runId: defaultRunId(FALLBACK_TEMPLATE.workspaceId),
};

export const buildTemplatePage = (limit: number): PageResult<PlaybookTemplateBase> => ({
  items: [defaultTemplate],
  nextCursor: withBrand('0', 'Cursor'),
  hasMore: defaultTemplate.tags.length > limit,
});
