import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ensureCampaignWorkspace,
  listCampaignCatalog,
  planWithWindowLimit,
  runCampaignWorkspace,
  type CampaignPlanResult,
  createTenantId,
} from '@domain/recovery-stress-lab';
import {
  CampaignWorkspaceFilters,
  type CampaignCommandRow,
  type CampaignWorkspaceRecord,
  type CampaignSummary,
} from '../types';
import {
  asWorkspaceRecord,
  mapSignalsToRows,
  mapPlanToNodes,
  summarizeCampaignWorkspace,
  routeFromCampaignId,
  enrichSignalsFromQuery,
} from '../services/campaignAdapter';

const starterFilters: CampaignWorkspaceFilters = {
  bands: [{ band: 'low' }, { band: 'medium' }, { band: 'high' }, { band: 'critical' }],
  query: '',
};

export interface CampaignWorkspaceHookReturn {
  readonly tenantId: string;
  readonly catalog: readonly string[];
  readonly workspace: CampaignWorkspaceRecord;
  readonly filters: CampaignWorkspaceFilters;
  readonly selectedCampaign: string;
  readonly commandRows: readonly CampaignCommandRow[];
  readonly signalRows: readonly { readonly id: string; readonly label: string; readonly score: number }[];
  readonly plan: CampaignPlanResult | null;
  readonly summary: CampaignSummary;
  readonly isRunning: boolean;
  readonly route: readonly string[];
  readonly buildPlan: (campaignId: string) => Promise<void>;
  readonly runSimulation: () => Promise<void>;
  readonly seedSignalsFromQuery: () => void;
  readonly setFilters: (next: CampaignWorkspaceFilters) => void;
  readonly setSelectedCampaign: (next: string) => void;
}

export const useStressLabCampaignWorkspace = (tenantId: string): CampaignWorkspaceHookReturn => {
  const typedTenantId = createTenantId(tenantId);
  const [campaignId, setCampaignId] = useState('campaign-alpha');
  const [catalogSeed, setCatalogSeed] = useState(() => listCampaignCatalog());
  const [plan, setPlan] = useState<CampaignPlanResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [filters, setFilters] = useState(starterFilters);
  const [workspace, setWorkspace] = useState<CampaignWorkspaceRecord>(() => asWorkspaceRecord(typedTenantId));

  useEffect(() => {
    const catalog = listCampaignCatalog();
    setCatalogSeed(catalog);
  }, []);

  useEffect(() => {
    const next = campaignId || catalogSeed[0]?.campaignId || 'campaign-alpha';
    const workspaceSnapshot = ensureCampaignWorkspace(typedTenantId, next);
      setWorkspace({
        tenantId: workspaceSnapshot.tenantId,
        campaignId: next,
        phases: [...workspaceSnapshot.phases],
        selectedSignals: [],
        plan: null,
        simulation: null,
        catalogSignature: workspaceSnapshot.seed?.campaignId ? String(workspaceSnapshot.seed.campaignId) : next,
      });
    setCampaignId(next);
  }, [catalogSeed, typedTenantId, campaignId]);

  const filteredCatalog = useMemo(() => {
    if (!filters.query) {
      return catalogSeed;
    }

    const query = filters.query.toLowerCase();
    return catalogSeed.filter((entry) => {
      const signature = `${entry.tenantId}-${entry.campaignId}`.toLowerCase();
      return signature.includes(query);
    });
  }, [catalogSeed, filters.query]);

  const runPlan = useCallback(
    async (nextCampaignId: string) => {
      setIsRunning(true);
      try {
        const nextPlan = await planWithWindowLimit(
          typedTenantId,
          nextCampaignId,
          ['seed', 'modeling', 'orchestration'],
          filters.bands.length,
        );
        setPlan(nextPlan);
        setCampaignId(nextCampaignId);
      } finally {
        setIsRunning(false);
      }
    },
    [filters.bands.length, typedTenantId],
  );

  const runSimulation = useCallback(async () => {
    if (!plan) {
      return;
    }

    setIsRunning(true);
    try {
      const result = await runCampaignWorkspace(typedTenantId, campaignId);
      setWorkspace((next) => ({
        ...next,
        phases: [...next.phases, ...result.plan.phases],
        plan: result.plan,
        simulation: {
          tenantId: typedTenantId,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          selectedRunbooks: [],
          ticks: [],
          riskScore: Math.max(0, result.forecastCount),
          slaCompliance: 0.97,
          notes: ['simulated'],
        },
      }));
      setPlan((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          phases: [...current.phases, 'verification'],
        };
      });
    } finally {
      setIsRunning(false);
    }
  }, [campaignId, plan, typedTenantId, tenantId]);

  const seedSignalsFromQuery = useCallback(() => {
    const querySignals = enrichSignalsFromQuery(filters.query);
    setWorkspace((current) => ({
      ...current,
      selectedSignals: querySignals,
    }));
  }, [filters.query]);

  const selectedRoute = routeFromCampaignId(campaignId);

  const commandRows = useMemo(
    () =>
      mapPlanToNodes(workspace.plan).map((node) => ({
        id: node.id,
        title: node.title,
        severity: node.severity,
      })),
    [workspace.plan],
  );

  const signalRows = useMemo(() => {
    const fromSelection = mapSignalsToRows(workspace.selectedSignals);
    if (!filters.query) {
      return fromSelection;
    }

    return [...fromSelection, ...mapSignalsToRows(enrichSignalsFromQuery(filters.query))];
  }, [workspace.selectedSignals, filters.query]);

  const catalog = filteredCatalog.map((entry) => `${entry.tenantId}:${entry.campaignId}`);

  const summary = useMemo(
    () =>
      summarizeCampaignWorkspace(
        workspace.catalogSignature,
        workspace.plan,
        workspace.simulation,
        workspace.selectedSignals,
      ),
    [workspace.catalogSignature, workspace.plan, workspace.simulation, workspace.selectedSignals],
  );

  return {
    tenantId,
    catalog,
    workspace,
    filters,
    selectedCampaign: campaignId,
    commandRows,
    signalRows,
    plan,
    summary,
    isRunning,
    route: selectedRoute,
    buildPlan: runPlan,
    runSimulation,
    seedSignalsFromQuery,
    setFilters,
    setSelectedCampaign: setCampaignId,
  };
};
