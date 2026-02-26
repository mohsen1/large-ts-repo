export interface LayerPayload<TLabel extends string = string> {
  readonly marker: TLabel;
  readonly checksum: number;
  readonly source: string;
}

export interface LayerDepthNode {
  readonly marker: string;
  readonly checksum: number;
  readonly source: string;
}

export interface LayerRoot {
  readonly className: 'root';
  readonly state: 0;
  readonly checksum: number;
  readonly marker: 'root';
  readonly parentTag: 'root';
  readonly parent: null;
  readonly payload: LayerPayload<'root'>;
}

export interface LayerBase<
  TMarker extends LayerTag,
  TDepth extends number = number,
  TParent extends LayerUnion | null = LayerUnion | null,
  TPrevious extends string = string,
> {
  readonly className: TMarker;
  readonly state: TDepth;
  readonly checksum: number;
  readonly marker: TMarker;
  readonly parentTag: TPrevious;
  readonly parent: TParent;
  readonly payload: LayerPayload<TMarker>;
}

export type LayerTag =
  | 'L00'
  | 'L01'
  | 'L02'
  | 'L03'
  | 'L04'
  | 'L05'
  | 'L06'
  | 'L07'
  | 'L08'
  | 'L09'
  | 'L10'
  | 'L11'
  | 'L12'
  | 'L13'
  | 'L14'
  | 'L15'
  | 'L16'
  | 'L17'
  | 'L18'
  | 'L19'
  | 'L20'
  | 'L21'
  | 'L22'
  | 'L23'
  | 'L24'
  | 'L25'
  | 'L26'
  | 'L27'
  | 'L28'
  | 'L29';

export interface Layer00 extends LayerBase<'L00', 0, LayerRoot, 'root'> {}
export interface Layer01 extends LayerBase<'L01', 1, Layer00, 'L00'> {}
export interface Layer02 extends LayerBase<'L02', 2, Layer01, 'L01'> {}
export interface Layer03 extends LayerBase<'L03', 3, Layer02, 'L02'> {}
export interface Layer04 extends LayerBase<'L04', 4, Layer03, 'L03'> {}
export interface Layer05 extends LayerBase<'L05', 5, Layer04, 'L04'> {}
export interface Layer06 extends LayerBase<'L06', 6, Layer05, 'L05'> {}
export interface Layer07 extends LayerBase<'L07', 7, Layer06, 'L06'> {}
export interface Layer08 extends LayerBase<'L08', 8, Layer07, 'L07'> {}
export interface Layer09 extends LayerBase<'L09', 9, Layer08, 'L08'> {}
export interface Layer10 extends LayerBase<'L10', 10, Layer09, 'L09'> {}
export interface Layer11 extends LayerBase<'L11', 11, Layer10, 'L10'> {}
export interface Layer12 extends LayerBase<'L12', 12, Layer11, 'L11'> {}
export interface Layer13 extends LayerBase<'L13', 13, Layer12, 'L12'> {}
export interface Layer14 extends LayerBase<'L14', 14, Layer13, 'L13'> {}
export interface Layer15 extends LayerBase<'L15', 15, Layer14, 'L14'> {}
export interface Layer16 extends LayerBase<'L16', 16, Layer15, 'L15'> {}
export interface Layer17 extends LayerBase<'L17', 17, Layer16, 'L16'> {}
export interface Layer18 extends LayerBase<'L18', 18, Layer17, 'L17'> {}
export interface Layer19 extends LayerBase<'L19', 19, Layer18, 'L18'> {}
export interface Layer20 extends LayerBase<'L20', 20, Layer19, 'L19'> {}
export interface Layer21 extends LayerBase<'L21', 21, Layer20, 'L20'> {}
export interface Layer22 extends LayerBase<'L22', 22, Layer21, 'L21'> {}
export interface Layer23 extends LayerBase<'L23', 23, Layer22, 'L22'> {}
export interface Layer24 extends LayerBase<'L24', 24, Layer23, 'L23'> {}
export interface Layer25 extends LayerBase<'L25', 25, Layer24, 'L24'> {}
export interface Layer26 extends LayerBase<'L26', 26, Layer25, 'L25'> {}
export interface Layer27 extends LayerBase<'L27', 27, Layer26, 'L26'> {}
export interface Layer28 extends LayerBase<'L28', 28, Layer27, 'L27'> {}
export interface Layer29 extends LayerBase<'L29', 29, Layer28, 'L28'> {}

export type LayerUnion =
  | LayerRoot
  | Layer00
  | Layer01
  | Layer02
  | Layer03
  | Layer04
  | Layer05
  | Layer06
  | Layer07
  | Layer08
  | Layer09
  | Layer10
  | Layer11
  | Layer12
  | Layer13
  | Layer14
  | Layer15
  | Layer16
  | Layer17
  | Layer18
  | Layer19
  | Layer20
  | Layer21
  | Layer22
  | Layer23
  | Layer24
  | Layer25
  | Layer26
  | Layer27
  | Layer28
  | Layer29;

export type DeepClassChain = [
  LayerRoot,
  Layer00,
  Layer01,
  Layer02,
  Layer03,
  Layer04,
  Layer05,
  Layer06,
  Layer07,
  Layer08,
  Layer09,
  Layer10,
  Layer11,
  Layer12,
  Layer13,
  Layer14,
  Layer15,
  Layer16,
  Layer17,
  Layer18,
  Layer29,
];

export type LayerTuple = readonly [
  LayerRoot,
  Layer00,
  Layer01,
  Layer02,
  Layer03,
  Layer04,
  Layer05,
  Layer06,
  Layer07,
  Layer08,
  Layer09,
  Layer10,
  Layer11,
  Layer12,
  Layer13,
  Layer14,
  Layer15,
  Layer16,
  Layer17,
  Layer18,
  Layer19,
  Layer20,
  Layer21,
  Layer22,
  Layer23,
  Layer24,
  Layer25,
  Layer26,
  Layer27,
  Layer28,
  Layer29,
];

export type LayerPathEdge = LayerUnion;

export interface LayerPath {
  readonly edges: readonly LayerPathEdge[];
  readonly terminal: LayerPathEdge;
  readonly length: number;
}

export type LayerResult = {
  readonly id: number;
  readonly state: 'stable' | 'adaptive' | 'critical';
  readonly notes: readonly string[];
};

export type LayerProfile<T extends LayerUnion = LayerUnion> = {
  readonly layer: T['className'];
  readonly marker: T['marker'];
  readonly depth: T['state'];
  readonly checksum: T['checksum'];
  readonly parentTag: T['parentTag'];
};

const markerOrder: LayerTag[] = [
  'L00',
  'L01',
  'L02',
  'L03',
  'L04',
  'L05',
  'L06',
  'L07',
  'L08',
  'L09',
  'L10',
  'L11',
  'L12',
  'L13',
  'L14',
  'L15',
  'L16',
  'L17',
  'L18',
  'L19',
  'L20',
  'L21',
  'L22',
  'L23',
  'L24',
  'L25',
  'L26',
  'L27',
  'L28',
  'L29',
];

const rootNode: LayerRoot = {
  className: 'root',
  state: 0,
  checksum: 0,
  marker: 'root',
  parentTag: 'root',
  parent: null,
  payload: { marker: 'root', checksum: 0, source: 'runtime' },
};

const buildLayerNode = (index: number, parent: LayerUnion): LayerUnion => {
  const marker = markerOrder[index % markerOrder.length] as LayerTag;
  return {
    className: marker,
    state: index + 1,
    checksum: (index + 1) * 17,
    marker,
    parentTag: parent.marker as LayerTag,
    parent,
    payload: {
      marker,
      checksum: (index + 1) * 17,
      source: `builder:${index}`,
    },
  } as LayerUnion;
};

export const baselinePath: LayerPath = {
  edges: [rootNode],
  terminal: rootNode,
  length: 1,
};

export const buildClassChain = (seed: LayerPayload<'L00'>, depth = 29): LayerPath => {
  const safeDepth = Math.max(1, Math.min(29, depth));
  const edges: LayerUnion[] = [
    {
      className: 'L00',
      state: 0,
      checksum: seed.checksum,
      marker: 'L00',
      parentTag: 'root',
      parent: rootNode,
      payload: {
        marker: 'L00',
        checksum: seed.checksum,
        source: seed.source,
      },
    },
  ] as LayerUnion[];

  let current: LayerUnion = edges[0] as LayerUnion;
  for (let index = 1; index <= safeDepth; index += 1) {
    current = buildLayerNode(index, current);
    edges.push(current);
  }

  return {
    edges,
    terminal: edges[edges.length - 1] ?? rootNode,
    length: edges.length,
  };
};

export type BranchLevel<T extends LayerPath = LayerPath> = T['edges'][number]['state'];

export const evaluateLayerPath = (path: LayerPath): LayerResult[] => {
  const out: LayerResult[] = [];
  for (const entry of path.edges) {
    const state = entry.state >= 20 ? 'critical' : entry.state % 2 === 0 ? 'stable' : 'adaptive';
    out.push({
      id: entry.state,
      state,
      notes: [entry.className, String(entry.checksum)],
    });
  }
  return out;
};

export type BranchFrame = {
  readonly id: LayerUnion['state'];
  readonly notes: readonly string[];
};

export const classifyLayer = (seed: LayerUnion): LayerResult['state'] => {
  if (seed.state >= 20) {
    return 'critical';
  }
  return seed.state % 2 === 0 ? 'stable' : 'adaptive';
};

export const classifyLayerTrace = (seed: readonly LayerUnion[]): LayerProfile[] =>
  seed.map((entry) => ({
    layer: entry.className,
    marker: entry.marker,
    depth: entry.state,
    checksum: entry.checksum,
    parentTag: entry.parentTag,
  }));

export type LayerChainEnvelope = {
  readonly path: LayerPath;
  readonly report: LayerResult[];
  readonly profiles: LayerProfile[];
};

export const baselinePathReport = evaluateLayerPath(buildClassChain({ marker: 'L00', checksum: 200, source: 'seed' }, 12));

export const analyzeLayerPath = (seed: LayerPayload<'L00'>, depth: number): LayerChainEnvelope => {
  const path = buildClassChain(seed, depth);
  const report = evaluateLayerPath(path);
  return {
    path,
    report,
    profiles: classifyLayerTrace(path.edges),
  };
};
