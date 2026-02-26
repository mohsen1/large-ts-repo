import { type FC, useMemo, useState } from 'react';
import {
  analyzeSignalCatalog,
  signalPriority,
  signalRouteCatalog,
  signalTruthProfile,
  type SignalCatalogUnion,
  type SignalDomain,
  type SignalMode,
  type SignalState,
  type SignalVerb,
  signalChainSignature,
} from '@shared/type-level';

type SignalRouteBucket = {
  readonly route: SignalCatalogUnion;
  readonly envelope: {
    readonly family: ReturnType<typeof signalChainSignature<SignalCatalogUnion, SignalMode>>['family'];
    readonly severity: ReturnType<typeof signalChainSignature<SignalCatalogUnion, SignalMode>>['severity'];
    readonly domain: SignalDomain;
    readonly verb: SignalVerb;
    readonly status: SignalState;
  };
  readonly score: number;
  readonly index: number;
};

type BinaryPanelProps = {
  readonly compact?: boolean;
};

const scoreSignal = (value: number): 'critical' | 'high' | 'normal' => {
  return value >= 75 ? 'critical' : value >= 40 ? 'high' : 'normal';
};

const classifyMode = (mode: SignalMode): string => {
  return mode === 'mode-fast'
    ? 'throughput'
    : mode === 'mode-safe'
      ? 'recovery'
      : mode === 'mode-batch'
        ? 'background'
        : mode === 'mode-offline'
          ? 'cold'
          : mode === 'mode-replay'
            ? 'replay'
            : 'diagnostic';
};

const labelFromSeverity = (route: SignalCatalogUnion): string => {
  const status = route.split('/')[3] ?? '';
  if (route.includes('recover') || route.includes('triage')) {
    return `critical:${status}`;
  }
  if (route.includes('active')) {
    return `active:${status}`;
  }
  if (route.includes('pending')) {
    return `pending:${status}`;
  }
  if (route.includes('degraded')) {
    return `degraded:${status}`;
  }
  return `other:${status}`;
};

export const StressBinaryFlowPanel: FC<BinaryPanelProps> = ({ compact = false }) => {
  const [mode, setMode] = useState<SignalMode>('mode-fast');
  const [active, setActive] = useState<boolean>(true);
  const [minScore, setMinScore] = useState<number>(0);

  const payload = useMemo(
    () => analyzeSignalCatalog(mode, signalRouteCatalog as readonly SignalCatalogUnion[]),
    [mode],
  );

  const signatures = useMemo(() => {
    const values = payload.routes.map((route, index) => {
      const typedRoute: SignalCatalogUnion = route;
      const signature = signalChainSignature(typedRoute, mode, mode);
      const parts = typedRoute.split('/');
      const envelope = {
        domain: parts[1] as SignalDomain,
        verb: parts[2] as SignalVerb,
        status: (parts[3] as SignalState) ?? 'new',
        family: signature.family,
        severity: signature.severity,
      };

      const routeParts = typedRoute.split('/');
      const score = (routeParts[1] ? signalPriority.medium : 0) + (routeParts[2] === 'degraded' ? 24 : 9) + index;
      return {
        route: typedRoute,
        envelope,
        score,
        index,
      };
    });
    return values.sort((left, right) => right.score - left.score);
  }, [mode, payload.routes]);

  const bucketed = useMemo<Record<'critical' | 'high' | 'normal', SignalRouteBucket[]>>(() => {
    const base = signalTruthProfile.map((expr) => expr.includes('1'));
    const severity = base.reduce((acc, truth, index) => {
      const weight = index + (truth ? 1 : 0) * 17;
      if (weight >= 12) {
        acc.critical.push(signatures[index % signatures.length] as SignalRouteBucket);
      } else if (weight >= 6) {
        acc.high.push(signatures[index % signatures.length] as SignalRouteBucket);
      } else {
        acc.normal.push(signatures[index % signatures.length] as SignalRouteBucket);
      }
      return acc;
    }, {
      critical: [],
      high: [],
      normal: [],
    } as Record<'critical' | 'high' | 'normal', SignalRouteBucket[]>);
    return severity;
  }, [signatures]);

  const filtered = signatures.filter((entry) => {
    const passActive = active ? payload.active.includes(entry.route) : true;
    const passScore = entry.score >= minScore;
    return passActive && passScore;
  });

  const summary = filtered.reduce((acc, entry) => {
    if (entry.score > 60) {
      acc.hot += 1;
    } else if (entry.score > 30) {
      acc.warm += 1;
    } else {
      acc.cool += 1;
    }
    return acc;
  }, { hot: 0, warm: 0, cool: 0 });

  return (
    <section style={{ border: '1px solid #2f3650', borderRadius: 12, padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3>Binary signal flow panel</h3>
        <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
          <button type="button" onClick={() => setMode((value) => (value === 'mode-fast' ? 'mode-safe' : value === 'mode-safe' ? 'mode-diagnostic' : value === 'mode-diagnostic' ? 'mode-batch' : value === 'mode-batch' ? 'mode-replay' : 'mode-offline'))}>
            mode={mode}
          </button>
          <button type="button" onClick={() => setActive((value) => !value)}>
            active={String(active)}
          </button>
        </div>
      </header>
      <div style={{ marginBottom: 8, fontSize: 12 }}>
        <span>routeCount={payload.routes.length}</span>
        {' '}
        <span>modeProfile={classifyMode(mode)}</span>
        {' '}
        <span>disabled={payload.disabled.length}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        {(['critical', 'high', 'normal'] as const).map((bucket) => (
          <span
            key={bucket}
            style={{ marginRight: 12, color: bucket === 'critical' ? '#f26b61' : bucket === 'high' ? '#f2b45b' : '#70d0ff' }}
          >
            {bucket}:{bucketed[bucket].length}
          </span>
        ))}
      </div>
      <div style={{ marginBottom: 10, display: 'grid', gap: 4, fontSize: 12 }}>
        <div>summary hot={summary.hot} warm={summary.warm} cool={summary.cool}</div>
        <div>
          threshold:
          <input
            type="range"
            value={minScore}
            min={0}
            max={100}
            onChange={(event) => setMinScore(Number(event.target.value))}
            style={{ marginLeft: 8 }}
          />
          {minScore}
        </div>
      </div>
      <div style={{ display: compact ? 'grid' : 'block', gap: 8 }}>
        {filtered.map((entry) => {
          const label = labelFromSeverity(entry.route);
          const scoreClass = scoreSignal(entry.score);
          const detail = `${entry.envelope.domain}/${entry.envelope.verb}/${entry.envelope.status}`;
          const confidence = `${entry.envelope.family}-${entry.envelope.severity}`;
          const statusBadge = scoreClass === 'critical' ? 'red' : scoreClass === 'high' ? 'orange' : 'green';
          return (
            <article
              key={`${entry.route}-${entry.index}`}
              style={{ border: `1px solid ${statusBadge}`, borderRadius: 8, padding: 8, marginBottom: compact ? 0 : 6 }}
            >
              <div>{entry.route}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                {detail}
                {' '}
                ·
                {label}
                {' '}
                ·
                {confidence}
              </div>
              <div>{`score=${entry.score} class=${scoreClass}`}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
