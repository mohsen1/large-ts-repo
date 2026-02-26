import { useEffect, useMemo, useState } from 'react';
import { routeConstraintSet, commandCatalog, resolveRecoveryCommand, stressConditionalGraph } from '@shared/type-level';

import { mapWithIteratorHelpers } from '@shared/type-level';

type StressVerb = stressConditionalGraph.StressLabVerb;
type ResolvedCatalog = Readonly<Record<string, unknown>>;
type StressCatalog = typeof stressConditionalGraph.stressLabCatalog;
type StressLabDashboardRow = {
  readonly action: string;
  readonly domain: string;
  readonly severity: string;
  readonly id: string;
  readonly raw: string;
  readonly route: string;
  readonly signature: string;
};
type BranchByNoInfer = `${string}:${string}:${string}:${string}`;
type StressChainRow = {
  readonly verb: StressVerb;
  readonly domain: string;
  readonly severity: string;
  readonly id: string;
  readonly raw: string;
  readonly path: string;
  readonly next: string;
  readonly score: number;
  readonly command: string;
  readonly routeCode: string;
};

const parseChain = (command: StressCatalog[number]): StressChainRow => {
  const parsed = command.split(':');
  const verb = parsed[0] as StressVerb;
  const domain = parsed[1] ?? '';
  const severity = parsed[2] ?? '';
  const id = parsed[3] ?? '';
  return {
    verb,
    domain,
    severity,
    id,
    raw: command,
    path: `/${verb}/${domain}/${severity}/${id}`,
    next: 'default',
    score: severity === 'critical' || severity === 'emergency' ? 100 : 50,
    command,
    routeCode: `/${verb}/${domain}/${severity}`,
  };
};
const resolveStressChain = stressConditionalGraph.resolveLabCatalog;
const stressCatalog = stressConditionalGraph.stressLabCatalog as StressCatalog;

type RouteRow = {
  readonly rowId: string;
  readonly verb: StressVerb;
  readonly domain: string;
  readonly severity: string;
  readonly valid: boolean;
};

type StressViewModel = {
  readonly rows: readonly RouteRow[];
  readonly signatures: readonly string[];
  readonly signaturesByNoInfer: readonly BranchByNoInfer[];
};

type UseRecoveryStressTypeOpsReturn = {
  readonly catalogRows: readonly StressLabDashboardRow[];
  readonly resolved: ResolvedCatalog;
  readonly signatures: readonly string[];
  readonly profile: {
    readonly total: number;
    readonly hasRoute: boolean;
    readonly severityHistogram: Record<string, number>;
    readonly byVerb: Record<string, number>;
    readonly byDomain: Record<string, number>;
  };
  readonly view: StressViewModel;
  readonly loading: boolean;
  readonly loadError: Error | undefined;
};

export const useRecoveryStressTypeOps = (): UseRecoveryStressTypeOpsReturn => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | undefined>();

  const resolved = useMemo(() => resolveStressChain(stressCatalog) as unknown as ResolvedCatalog, []);
  const catalogRows = useMemo<readonly StressLabDashboardRow[]>(() => {
    const rows: StressLabDashboardRow[] = [];
    for (const command of stressCatalog) {
      const parsed = parseChain(command);
      rows.push({
        action: parsed.verb,
        domain: parsed.domain,
        severity: parsed.severity,
        id: parsed.id,
        raw: parsed.raw,
        route: parsed.path,
        signature: `${parsed.verb}:${parsed.domain}:${parsed.severity}:${parsed.id}`,
      });
    }
    return rows;
  }, [stressCatalog]);
  const signatures = useMemo(() => {
    if (typeof mapWithIteratorHelpers === 'function') {
      return mapWithIteratorHelpers(stressCatalog as readonly string[], (command) => command.replaceAll(':', '/'));
    }

    return stressCatalog.map((command) => command.replaceAll(':', '/'));
  }, []);

  const signaturesByNoInfer = useMemo(
    () =>
      signatures
        .map((path, index): BranchByNoInfer =>
          `${stressCatalog[index]?.split(':')[0] as StressVerb}:${stressCatalog[index]?.split(':')[1] ?? 'agent'}:${
            stressCatalog[index]?.split(':')[2] ?? 'low'
          }:id-${index}` as BranchByNoInfer),
    [signatures],
  );

  const profile = useMemo(() => {
    const severityHistogram: Record<string, number> = {};
    const byVerb: Record<string, number> = {};
    const byDomain: Record<string, number> = {};
    let total = 0;

    for (const command of stressCatalog) {
      const parsed = parseChain(command);
      if (parsed.severity) {
        severityHistogram[parsed.severity] = (severityHistogram[parsed.severity] ?? 0) + 1;
        total += 1;
      }
      byVerb[parsed.verb] = (byVerb[parsed.verb] ?? 0) + 1;
      byDomain[parsed.domain] = (byDomain[parsed.domain] ?? 0) + 1;
    }

    return {
      total,
      hasRoute: 'recover' in routeConstraintSet,
      severityHistogram,
      byVerb,
      byDomain,
    };
  }, []);

  const view = useMemo<StressViewModel>(() => {
    const rows = stressCatalog.reduce<RouteRow[]>((acc, command) => {
      const parsed = parseChain(command);
      acc.push({
        rowId: parsed.id,
        verb: parsed.verb,
        domain: parsed.domain,
        severity: parsed.severity,
        valid: true,
      });
      return acc;
    }, []);

    return {
      rows,
      signatures,
      signaturesByNoInfer,
    };
  }, [signatures, signaturesByNoInfer]);

  useEffect(() => {
    let active = true;
    let aborter = new AbortController();
    const stack = new AsyncDisposableStack();

    (async () => {
      try {
        await Promise.resolve();
        if (!active || aborter.signal.aborted) {
          return;
        }
        for (const command of commandCatalog.slice(0, 4)) {
          resolveRecoveryCommand(command);
        }
      } catch (error) {
        if (active && !aborter.signal.aborted && error instanceof Error) {
          setLoadError(error);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    stack.defer(() => {
      aborter.abort();
      active = false;
    });

    return () => {
      aborter.abort();
      active = false;
    };
  }, [catalogRows, signatures]);

  return {
    catalogRows,
    resolved,
    signatures,
    profile,
    view,
    loading,
    loadError,
  };
};
