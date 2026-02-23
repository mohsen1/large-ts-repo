import { CommandRunbook, CommandStep, RecoverySignal, SeverityBand, TenantId, WorkloadTarget, WorkloadId, RecoverySignalId, CommandStepId, createWorkloadId, createRunbookId, createStepId, createSignalId, WorkloadTopology } from './models';
import { mapTargetsToNodes, inferRiskBandFromSignals, mapNodeExposure, TopologyHealth } from './topology-intelligence';

export interface CatalogItem {
  readonly id: CommandRunbook['id'];
  readonly label: string;
  readonly hints: readonly string[];
}

export interface SignalTemplate {
  readonly id: RecoverySignalId;
  readonly title: string;
  readonly classHint: RecoverySignal['class'];
  readonly severityHint: SeverityBand;
}

export interface ScenarioTemplate {
  readonly tenantId: TenantId;
  readonly scenarioName: string;
  readonly selectedBand: SeverityBand;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly SignalTemplate[];
  readonly topology: WorkloadTopology;
}

export interface TemplateRecommendation {
  readonly catalogId: string;
  readonly title: string;
  readonly rationale: string;
  readonly targetRunbooks: readonly CommandRunbook['id'][];
}

export interface ScenarioBundle {
  readonly tenantId: TenantId;
  readonly profile: string;
  readonly plans: readonly ScenarioTemplate[];
}

interface SignalEnvelope {
  readonly signal: RecoverySignal;
  readonly impact: number;
}

const defaultHint = (tenantId: TenantId): ScenarioTemplate => {
  return {
    tenantId,
    scenarioName: `catalog-${tenantId}-baseline`,
    selectedBand: 'medium',
    runbooks: [],
    signals: [
      {
        id: createSignalId('default-latency'),
        title: 'baseline latency anomaly',
        classHint: 'performance',
        severityHint: 'low',
      },
    ],
    topology: {
      tenantId,
      nodes: [],
      edges: [],
    },
  };
};

const catalogSignals = (signals: readonly RecoverySignal[]): readonly SignalTemplate[] => {
  return signals.map((signal) => ({
    id: signal.id,
    title: signal.title,
    classHint: signal.class,
    severityHint: signal.severity,
  }));
};

export const buildCatalog = (tenantId: TenantId, plans: readonly CommandRunbook[]): readonly CatalogItem[] => {
  return plans.map((runbook) => {
    const activeHints = new Set<string>();
    for (const step of runbook.steps) {
      activeHints.add(step.phase);
      activeHints.add(`${step.estimatedMinutes}m`);
    }
    return {
      id: runbook.id,
      label: `${runbook.name} (${runbook.steps.length} steps)`,
      hints: [...activeHints].sort(),
    };
  });
};

export const planTemplateFromTargets = (
  tenantId: TenantId,
  targets: readonly WorkloadTarget[],
  selectedSignals: readonly RecoverySignal[],
): ScenarioTemplate => {
  const topology = mapTargetsToNodes(targets);
  const exposures = mapNodeExposure(topology);
  const criticalNodes = new Set(exposures.filter((entry) => entry.incoming > 0).map((entry) => entry.nodeId));
  const selectedBand = inferRiskBandFromSignals(selectedSignals);

  const stepsBySeverity: Record<SeverityBand, CommandStep[]> = {
    low: [
      {
        commandId: createStepId(`${tenantId}-step-audit`),
        title: 'Assess blast radius',
        phase: 'observe',
        estimatedMinutes: 15,
        prerequisites: [],
        requiredSignals: [selectedSignals[0]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-stabilize`),
        title: 'Stabilize workload dependencies',
        phase: 'isolate',
        estimatedMinutes: 18,
        prerequisites: [createStepId(`${tenantId}-step-audit`)],
        requiredSignals: [selectedSignals[1]?.id ?? createSignalId('signal-default')],
      },
    ],
    medium: [
      {
        commandId: createStepId(`${tenantId}-step-triage`),
        title: 'Triage affected services',
        phase: 'observe',
        estimatedMinutes: 18,
        prerequisites: [],
        requiredSignals: [selectedSignals[0]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-pause`),
        title: 'Pause risky traffic',
        phase: 'isolate',
        estimatedMinutes: 20,
        prerequisites: [createStepId(`${tenantId}-step-triage`)],
        requiredSignals: [selectedSignals[1]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-migrate`),
        title: 'Migrate recovery tasks',
        phase: 'migrate',
        estimatedMinutes: 25,
        prerequisites: [createStepId(`${tenantId}-step-pause`)],
        requiredSignals: [selectedSignals[2]?.id ?? createSignalId('signal-default')],
      },
    ],
    high: [
      {
        commandId: createStepId(`${tenantId}-step-segment`),
        title: 'Segment primary zone',
        phase: 'isolate',
        estimatedMinutes: 18,
        prerequisites: [],
        requiredSignals: [selectedSignals[0]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-failover`),
        title: 'Activate failover runbook',
        phase: 'migrate',
        estimatedMinutes: 30,
        prerequisites: [createStepId(`${tenantId}-step-segment`)],
        requiredSignals: [selectedSignals[1]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-verify`),
        title: 'Verify recovery behavior',
        phase: 'verify',
        estimatedMinutes: 22,
        prerequisites: [createStepId(`${tenantId}-step-failover`)],
        requiredSignals: [selectedSignals[2]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-restore`),
        title: 'Restore baseline controls',
        phase: 'restore',
        estimatedMinutes: 20,
        prerequisites: [createStepId(`${tenantId}-step-verify`)],
        requiredSignals: [selectedSignals[3]?.id ?? createSignalId('signal-default')],
      },
    ],
    critical: [
      {
        commandId: createStepId(`${tenantId}-step-degrade`),
        title: 'Controlled degrade',
        phase: 'observe',
        estimatedMinutes: 12,
        prerequisites: [],
        requiredSignals: [selectedSignals[0]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-isolate`),
        title: 'Isolate blast radius',
        phase: 'isolate',
        estimatedMinutes: 20,
        prerequisites: [createStepId(`${tenantId}-step-degrade`)],
        requiredSignals: [selectedSignals[1]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-migrate`),
        title: 'Migrate critical traffic',
        phase: 'migrate',
        estimatedMinutes: 28,
        prerequisites: [createStepId(`${tenantId}-step-isolate`)],
        requiredSignals: [selectedSignals[2]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-verify`),
        title: 'Rapid verification',
        phase: 'verify',
        estimatedMinutes: 18,
        prerequisites: [createStepId(`${tenantId}-step-migrate`)],
        requiredSignals: [selectedSignals[3]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-restore`),
        title: 'Restore all zones',
        phase: 'restore',
        estimatedMinutes: 30,
        prerequisites: [createStepId(`${tenantId}-step-verify`)],
        requiredSignals: [selectedSignals[4]?.id ?? createSignalId('signal-default')],
      },
      {
        commandId: createStepId(`${tenantId}-step-standdown`),
        title: 'Standdown and archive',
        phase: 'standdown',
        estimatedMinutes: 10,
        prerequisites: [createStepId(`${tenantId}-step-restore`)],
        requiredSignals: [selectedSignals[4]?.id ?? createSignalId('signal-default')],
      },
    ],
  };

  const workloadNodes = topology.nodes.map((node) => ({
    id: createRunbookId(`${tenantId}-runbook-${node.name.toLowerCase().replace(/\W+/g, '-')}`),
    tenantId,
    name: `${node.name} contingency playbook`,
    description: `Automated recovery path for ${node.name}`,
    steps: stepsBySeverity[selectedBand],
    ownerTeam: criticalNodes.has(node.id) ? 'platform' : 'operations',
    cadence: {
      weekday: (node.criticality + Number(new Date().getUTCDay())) % 7,
      windowStartMinute: 300 + node.criticality * 10,
      windowEndMinute: 480 + node.criticality * 12,
    },
  }));

  return {
    tenantId,
    scenarioName: `catalog-${tenantId}-${selectedBand}`,
    selectedBand,
    runbooks: workloadNodes,
    signals: catalogSignals(selectedSignals),
    topology,
  };
};

export const recommendTemplates = (tenantId: TenantId, targets: readonly WorkloadTarget[], signals: readonly RecoverySignal[]) => {
  const topology = mapTargetsToNodes(targets);
  const health: TopologyHealth = {
    tenantId,
    nodeCount: topology.nodes.length,
    edgeCount: topology.edges.length,
    maxInDegree: 0,
    maxOutDegree: 0,
    dependencyDepth: 0,
    hasCycle: false,
    criticalFanIn: [],
  };

  const selectedBand = inferRiskBandFromSignals(signals);
  const catalog = buildCatalog(tenantId, planTemplateFromTargets(tenantId, targets, signals).runbooks);
  const recommendations: TemplateRecommendation[] = [];

  const exposures = mapNodeExposure(topology);
  const criticalCount = exposures.filter((entry) => entry.incoming > entry.outgoing).length;
  for (const item of catalog) {
    const rationale =
      criticalCount > 0
        ? `Prioritize ${criticalCount} nodes with high incoming dependency pressure`
        : 'Balanced topology with low critical coupling';
    recommendations.push({
      catalogId: item.id,
      title: item.label,
      rationale,
      targetRunbooks: [item.id],
    });
  }

  const signalsByClass = new Map<RecoverySignal['class'], number>();
  for (const signal of signals) {
    signalsByClass.set(signal.class, (signalsByClass.get(signal.class) ?? 0) + 1);
  }
  const topSignalClass = [...signalsByClass.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const recommendationLabel = `${tenantId}-${selectedBand}-${topSignalClass ?? 'no-signal'}`;

  const bundle: ScenarioBundle = {
    tenantId,
    profile: recommendationLabel,
    plans: [planTemplateFromTargets(tenantId, targets, signals)],
  };

  const expanded: TemplateRecommendation[] = [
    {
      catalogId: recommendationLabel,
      title: bundle.profile,
      rationale: `Band ${selectedBand} selected from ${signals.length} active signals`,
      targetRunbooks: bundle.plans.flatMap((plan) => plan.runbooks.map((runbook) => runbook.id)),
    },
    ...recommendations,
  ];

  const sorted: SignalEnvelope[] = [...signals].map((signal) => {
    const impact = signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : signal.severity === 'medium' ? 2 : 1;
    return {
      signal,
      impact,
    };
  });
  sorted.sort((left, right) => right.impact - left.impact);

  if (sorted[0]) {
    const top = sorted[0];
    expanded.push({
      catalogId: top.signal.id,
      title: `Priority: ${top.signal.title}`,
      rationale: `Top severity signal ${top.signal.title} drives ${top.impact} impact`,
      targetRunbooks: bundle.plans.flatMap((plan) => plan.runbooks.map((runbook) => runbook.id)),
    });
  }

  return {
    health,
    selectedBand,
    recommendations: expanded,
    bundle,
  };
};

export const enrichWithSampleSignals = (
  tenantId: TenantId,
  baseSignals: readonly RecoverySignal[],
): readonly RecoverySignal[] => {
  const withSeed = [...baseSignals];
  if (baseSignals.length === 0) {
    withSeed.push({
      id: createSignalId('seed-latency'),
      class: 'performance',
      severity: 'low',
      title: 'synthetic warm-up signal',
      createdAt: new Date().toISOString(),
      metadata: {
        tenantId,
        origin: 'catalog',
      },
    });
  }

  if (!baseSignals.some((signal) => signal.class === 'integrity')) {
    withSeed.push({
      id: createSignalId('seed-integrity'),
      class: 'integrity',
      severity: 'medium',
      title: 'data consistency drift',
      createdAt: new Date().toISOString(),
      metadata: {
        tenantId,
        origin: 'catalog',
      },
    });
  }

  return withSeed;
};
