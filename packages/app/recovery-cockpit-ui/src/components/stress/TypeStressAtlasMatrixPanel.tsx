import { useMemo } from 'react';
import { useTypeStressAtlas } from '../../hooks/useTypeStressAtlas';
import { type AtlasAction } from '../../hooks/useTypeStressAtlas';
import { type AtlasRegistryInput } from '@shared/type-level-hub';

type MatrixMode = 'collapsed' | 'expanded' | 'filtered';

type MatrixBucket = {
  readonly key: string;
  readonly count: number;
  readonly averageConfidence: number;
  readonly routes: readonly AtlasRegistryInput[];
};

type MatrixCell = {
  readonly bucket: string;
  readonly score: number;
  readonly rows: readonly string[];
};

const bucketByTenant = (input: AtlasRegistryInput): string => `${input.tenant.split('-')[0]}:${input.action}`;

const bucketPriority = (bucket: string): number => {
  const [prefix] = bucket.split(':');
  if (prefix === 'global') {
    return 0;
  }
  if (prefix === 'tenant') {
    return 1;
  }
  return 2;
};

const bucketMetrics = (items: readonly AtlasRegistryInput[]): MatrixBucket => {
  const confidence = items.reduce((acc, item) => acc + item.confidence, 0);
  return {
    key: bucketByTenant(items[0]),
    count: items.length,
    averageConfidence: items.length === 0 ? 0 : confidence / items.length,
    routes: items,
  };
};

const toCell = (bucket: MatrixBucket): MatrixCell => ({
  bucket: bucket.key,
  score: bucket.count * 10 + Math.round(bucket.averageConfidence),
  rows: bucket.routes.map((route) => `${route.target}:${route.confidence}`),
});

export type MatrixPanelProps = {
  readonly title: string;
  readonly initialMode?: MatrixMode;
  readonly onBucketSelect?: (bucket: MatrixCell) => void;
};

export const TypeStressAtlasMatrixPanel = ({ title, initialMode = 'collapsed', onBucketSelect }: MatrixPanelProps) => {
  const { sessions, filtered, session, index, atlasManifest } = useTypeStressAtlas();

  const byAction = useMemo(() => {
    const grouped = sessions.reduce<Record<string, AtlasRegistryInput[]>>((acc, current) => {
      const key = bucketByTenant(current);
      const bucket = acc[key] ?? [];
      bucket.push(current);
      acc[key] = bucket;
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([, entries]) => entries as AtlasRegistryInput[])
      .map(bucketMetrics)
      .sort((a, b) => bucketPriority(a.key) - bucketPriority(b.key));
  }, [filtered]);

  const matrix = useMemo(() => byAction.map(toCell), [byAction]);

  const rendered = useMemo(
    () =>
      matrix.map((cell) => {
        const [tenant, action] = cell.bucket.split(':');
        const manifest = atlasManifest({
          tenant,
          action: (action as AtlasAction) ?? 'bootstrap',
          target: `${cell.bucket}:cell`,
          confidence: cell.score,
        });
        return {
          cell,
          manifest,
          valid: manifest.route === cell.bucket || manifest.payload.tenant === cell.bucket,
        };
      }),
    [atlasManifest, matrix],
  );

  return (
    <section style={{ padding: 12, border: '1px dashed #0369a1', borderRadius: 8 }}>
      <h4>{title}</h4>
      <p>
        mode:
        {' '}
        {initialMode}
      </p>
      <p>
        session:
        {' '}
        {session.state}
        {' · total '}
        {filtered.length}
      </p>
      <p>
        index:
        {' '}
        {Object.keys(index).length}
      </p>
      <ul>
        {rendered.map((item) => (
          <li key={item.cell.bucket}>
            <button
              type="button"
              onClick={() => onBucketSelect?.({ ...item.cell })}
            >
              {item.cell.bucket}
              {' '}
              score=
              {item.cell.score}
              {' '}
              valid=
              {String(item.valid)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
