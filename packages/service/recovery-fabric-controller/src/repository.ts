import type { IncidentId, TenantId, ServiceId } from '@domain/incident-management';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type {
  FabricCommand,
  FabricExecutionContext,
  FabricPlan,
  FabricPolicy,
} from '@domain/recovery-fabric-orchestration';
import { selectCommandMap, buildExecutionContext } from '@domain/recovery-fabric-orchestration';
import type { RecoveryRunState, RecoveryProgramId, RecoveryIncidentId } from '@domain/recovery-orchestration';
import { orchestrateByPolicy } from './orchestrator';

export interface AnyStore {
  [key: string]: unknown;
}

export interface FabricRepositoryFacade {
  loadPlans(): Promise<readonly FabricPlan[]>;
  loadPolicies(): Promise<readonly FabricPolicy[]>;
  runRecoveryCycle(policies: readonly FabricPolicy[]): Promise<readonly string[]>;
}

type StoreListFn = () => Promise<readonly Record<string, unknown>[]>;

interface StoreLike {
  readonly listPlans?: StoreListFn;
  readonly listPolicies?: StoreListFn;
}

const asStore = (store: AnyStore): StoreLike => {
  return {
    listPlans: cast<StoreListFn>(store.listPlans, async () => []),
    listPolicies: cast<StoreListFn>(store.listPolicies, async () => []),
  };
};

const cast = <T>(value: unknown, fallback: T): T => {
  return (value as T) ?? fallback;
};

const toText = (value: unknown, fallback: string): string => {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};

const fabricateCommand = (planId: string, index: number): FabricCommand => {
  const tenant = `tenant-${planId}` as TenantId;
  return {
    id: (`${planId}-command-${index}`) as never,
    tenantId: tenant,
    incidentId: (`incident-${planId}`) as IncidentId,
    name: `command-${index}`,
    priority: 2 as 1 | 2 | 3 | 4 | 5,
    blastRadius: 1 + index,
    estimatedRecoveryMinutes: 15 + index * 5,
    strategy: index % 2 === 0 ? 'serial' : 'parallel',
    constraints: [],
    runbook: [],
    context: { planId, index },
    requiresApprovals: (index % 2) + 0,
    requiresWindows: [
      {
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        timezone: 'UTC',
      },
    ],
  };
};

const fabricatePlan = (tenant: TenantId, policy: FabricPolicy, index = 1): FabricPlan => {
  const id = `plan-${policy.id}-${index}`;
  const commands: FabricCommand[] = [fabricateCommand(id, 0), fabricateCommand(id, 1), fabricateCommand(id, 2)];
  return {
    tenantId: tenant,
    policyId: policy.id,
    fabricId: (`fabric-${id}`) as never,
    commands,
    topology: {
      commandIds: commands.map((command) => command.id),
      edges: [
        {
          from: commands[0]?.id ?? (`${id}-from` as never),
          to: commands[1]?.id ?? (`${id}-to` as never),
          mode: 'hard',
          mandatory: true,
          rationale: 'bootstrap dependency',
        },
      ],
      zones: {
        serial: [commands[0]?.id ?? (`${id}-serial` as never)],
        parallel: [commands[1]?.id ?? (`${id}-parallel` as never), commands[2]?.id ?? (`${id}-parallel-b` as never)],
        staged: [],
      },
      metadata: {
        source: 'repository-factory',
        index,
      },
    },
  };
};

const fabricatePolicy = (tenant: TenantId, index = 1): FabricPolicy => ({
  id: (`policy-${index}`) as never,
  tenantId: tenant,
  name: `Policy ${index}`,
  description: `Synthetic recovery fabric policy ${index}`,
  readinessThreshold: 'warm',
  riskTolerance: 'amber',
  maxParallelism: 3,
  maxRetries: 1,
  windowHours: { min: 1, max: 12 },
  gates: [],
});

const makeContext = (policy: FabricPolicy, plans: readonly FabricPlan[]): FabricExecutionContext => {
  const tenant = policy.tenantId;
  const program: RecoveryProgram = {
    id: `program-${policy.id}` as never,
    tenant: tenant as never,
    service: `service-${policy.id}` as never,
    name: `Program ${policy.name}`,
    description: 'synthetic program for orchestration cycle',
    priority: 'silver',
    mode: 'defensive',
    window: {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 45 * 60_000).toISOString(),
      timezone: 'UTC',
    },
    topology: {
      rootServices: plans[0] ? [String(plans[0].commands[0]?.id ?? 'root')] : ['fallback-root'],
      fallbackServices: [],
      immutableDependencies: [],
    },
    constraints: [],
    steps: plans[0]?.commands.map((command) => ({
      id: command.id,
      title: command.name,
      command: command.name,
      timeoutMs: command.estimatedRecoveryMinutes * 60_000,
      dependencies: [],
      requiredApprovals: command.requiresApprovals,
      tags: ['fabric'],
    })),
    owner: 'fabric-service',
    tags: ['synthetic', 'fabric'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const incident = {
    id: `incident-${policy.id}` as never,
    tenantId: tenant,
    serviceId: (`service-${policy.id}`) as ServiceId,
    title: 'Synthetic incident for cycle',
    details: 'Generated by RecoveryFabricRepository',
    state: 'detected',
    triage: {
      tenantId: tenant,
      serviceId: (`service-${policy.id}`) as ServiceId,
      observedAt: new Date().toISOString(),
      source: 'ops-auto',
      severity: 'sev4',
      labels: [],
      confidence: 0.8,
      signals: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adaptedRunStates: RecoveryRunState[] = plans.flatMap((plan) => plan.commands).map((command) => ({
    runId: (command.id + '-run') as never,
    programId: planId(program) as RecoveryProgramId,
    incidentId: (`incident-${command.id}` as RecoveryIncidentId),
    status: 'staging',
    estimatedRecoveryTimeMinutes: command.estimatedRecoveryMinutes,
    currentStepId: command.id,
  }));

  return buildExecutionContext(String(tenant), incident as never, program, policy, [], adaptedRunStates);
};

const planId = (program: RecoveryProgram): string => {
  return program.id;
};

export class RecoveryFabricRepository implements FabricRepositoryFacade {
  constructor(private readonly store: AnyStore) {}

  async loadPlans(): Promise<readonly FabricPlan[]> {
    const { listPlans } = asStore(this.store);
    const rawPlans = await (listPlans ?? (async () => [] as readonly Record<string, unknown>[]))();
    const policies = rawPlans.length > 0
      ? rawPlans.map((record, index) => {
          const policyId = toText(record.id, `policy-${index}`).replace(/[^a-z0-9-]/gi, '');
          const tenant = `tenant-${policyId}` as TenantId;
          const policy: FabricPolicy = {
            id: (policyId || `policy-${index}`) as never,
            tenantId: tenant,
            name: toText(record.name, `policy-${index}`),
            description: toText(record.description, 'synth policy'),
            readinessThreshold: 'warm',
            riskTolerance: 'amber',
            maxParallelism: 2,
            maxRetries: 1,
            windowHours: { min: 1, max: 8 },
            gates: [],
          };
          return fabricatePlan(tenant, policy, index + 1);
        })
      : [fabricatePlan('tenant-default' as TenantId, fabricatePolicy('tenant-default' as TenantId, 1))];

    return policies;
  }

  async loadPolicies(): Promise<readonly FabricPolicy[]> {
    const { listPolicies } = asStore(this.store);
    const rawPolicies = await (listPolicies ?? (async () => [] as readonly Record<string, unknown>[]))();
    return rawPolicies.length > 0
      ? rawPolicies.map((item, index) => ({
          id: (`policy-${toText(item.id, String(index))}`) as never,
          tenantId: (`tenant-${index}`) as never,
          name: toText(item.name, `policy-${index}`),
          description: toText(item.description, 'policy'),
          readinessThreshold: 'warm',
          riskTolerance: 'amber',
          maxParallelism: 4,
          maxRetries: 2,
          windowHours: { min: 1, max: 8 },
          gates: [],
        }))
      : [fabricatePolicy('tenant-default' as TenantId, 1)];
  }

  async runRecoveryCycle(policies: readonly FabricPolicy[]): Promise<readonly string[]> {
    const plans = await this.loadPlans();
    const selectedPolicy = policies[0] ?? fabricatePolicy('tenant-default' as never, 1);
    const context = makeContext(selectedPolicy, plans);

    const outputs = orchestrateByPolicy(plans, selectedPolicy, context, []);
    const selected = outputs
      .filter((output) => output.allowed)
      .flatMap((output) => output.run?.id ? [String(output.run.id)] : []);

    const allCommandIds = new Set(plans.flatMap((plan) => plan.commands).map((command) => command.id));
    const selectedCommandCount = selectCommandMap([...allCommandIds].map((commandId) => ({
      id: commandId,
      tenantId: selectedPolicy.tenantId,
      incidentId: selectedPolicy.id as never,
      name: `summary-${commandId}`,
      priority: 1,
      blastRadius: 1,
      estimatedRecoveryMinutes: 1,
      strategy: 'serial',
      constraints: [],
      runbook: [],
      context: {},
      requiresApprovals: 0,
      requiresWindows: [
        {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 600_000).toISOString(),
          timezone: 'UTC',
        },
      ],
    })));

    const digest = [`selected-runs:${selected.length}`];
    if (selectedCommandCount.size > 0) {
      digest.push(`selected-commands:${selectedCommandCount.size}`);
    }

    return selected.concat(digest);
  }
}

export const createRecoveryFabricRepository = (store: AnyStore): RecoveryFabricRepository => new RecoveryFabricRepository(store);
