import { useEffect, useMemo, useState } from 'react';
import type { RouteTupleLike } from '@shared/type-level/stress-recursive-constraint-lattice';
import type { OrchestratorCommand } from '@service/recovery-stress-lab-orchestrator';

export type TypeStressHarnessCase = {
  readonly label: string;
  readonly route: RouteTupleLike;
  readonly routeTokens: readonly string[];
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
};

type HarnessMode = 'bootstrap' | 'simulate' | 'stabilize' | 'restore';
type HarnessSignal = {
  readonly command: OrchestratorCommand;
  readonly mode: HarnessMode;
};

const routeCandidates: readonly TypeStressHarnessCase[] = [
  { label: 'bootstrap-atlas', route: 'atlas/bootstrap/seed', routeTokens: ['atlas', 'bootstrap', 'seed'], severity: 'low' },
  { label: 'simulate-ops', route: 'ops/simulate/loop', routeTokens: ['ops', 'simulate', 'loop'], severity: 'medium' },
  { label: 'stabilize-mesh', route: 'mesh/stabilize/zone', routeTokens: ['mesh', 'stabilize', 'zone'], severity: 'high' },
  { label: 'restore-ops', route: 'ops/restore/terminal', routeTokens: ['ops', 'restore', 'terminal'], severity: 'critical' },
];

const toMode = (label: string): HarnessMode => {
  if (label.includes('bootstrap')) {
    return 'bootstrap';
  }
  if (label.includes('simulate')) {
    return 'simulate';
  }
  if (label.includes('restore')) {
    return 'restore';
  }
  return 'stabilize';
};

const commandFromCase = (seed: TypeStressHarnessCase): HarnessSignal => {
  const mode = toMode(seed.label);
  return {
    command: {
      id: `${seed.route}-${mode}`,
      route: seed.route,
      createdAt: Date.now(),
    },
    mode,
  };
};

export const useTypeStressControlHarness = () => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TypeStressHarnessCase>(routeCandidates[0]);
  const [history, setHistory] = useState<readonly HarnessSignal[]>([]);

  const filtered = useMemo(() => {
    const lowered = search.toLowerCase();
    return routeCandidates.filter((entry) => {
      if (!lowered) return true;
      if (entry.label.includes(lowered)) return true;
      if (entry.route.includes(lowered)) return true;
      return entry.routeTokens.some((token) => token.includes(lowered));
    });
  }, [search]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSelected((current) => {
        const next = routeCandidates[(routeCandidates.indexOf(current) + 1) % routeCandidates.length];
        setHistory((currentHistory) => [
          ...currentHistory.slice(-20),
          {
            command: {
              id: `${Date.now()}`,
              route: next.route,
              createdAt: Date.now(),
            },
            mode: toMode(next.label),
          },
        ]);
        return next;
      });
    }, 3000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const commands = useMemo(() => filtered.map(commandFromCase), [filtered]);

  const criticalCount = useMemo(() => commands.reduce((acc, command) => (command.mode === 'restore' || command.mode === 'simulate' ? acc + 1 : acc), 0), [commands]);

  const hasCritical = criticalCount > 0;

  return {
    search,
    setSearch,
    selected,
    setSelected,
    commands,
    filtered,
    history,
    criticalCount,
    hasCritical,
  };
};
