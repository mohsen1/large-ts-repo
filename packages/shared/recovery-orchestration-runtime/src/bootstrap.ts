import { buildConductorNamespace, buildWorkflowId } from './ids';
import { ConductorPluginRegistry, type ConductorPluginPhase } from './plugins';
import { buildConductorStages } from './adapter';
import { createTenantId } from '@domain/recovery-stress-lab';

type BootstrapProfile = {
  readonly namespace: string;
  readonly key: string;
  readonly manifest: readonly {
    readonly id: string;
    readonly phase: ConductorPluginPhase;
    readonly readyAt: string;
  }[];
};

const namespace = buildConductorNamespace('recovery-orchestration-runtime');
const bootstrapSeed = buildWorkflowId(namespace, `${namespace}-bootstrap`);

const manifest = {
  namespace: `${namespace}`,
  key: `${bootstrapSeed}`,
  manifest: [
    { id: `${namespace}:discover`, phase: 'discover', readyAt: new Date().toISOString() },
    { id: `${namespace}:assess`, phase: 'assess', readyAt: new Date().toISOString() },
    { id: `${namespace}:simulate`, phase: 'simulate', readyAt: new Date().toISOString() },
    { id: `${namespace}:actuate`, phase: 'actuate', readyAt: new Date().toISOString() },
    { id: `${namespace}:verify`, phase: 'verify', readyAt: new Date().toISOString() },
    { id: `${namespace}:finalize`, phase: 'finalize', readyAt: new Date().toISOString() },
  ],
} as const;

export const defaultBootstrapProfile: BootstrapProfile = manifest;

export const loadBootstrapRegistry = async () => {
  const tenantId = createTenantId('tenant-bootstrap');
  const plugins = buildConductorStages(tenantId, [], []);
  return ConductorPluginRegistry.create(plugins);
};
