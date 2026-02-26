export type NoInfer<T> = [T][T extends any ? 0 : never];

export interface ShipNodeBase {
  readonly marker: string;
  readonly active: boolean;
  readonly depth: number;
}

export interface ShipNode0 extends ShipNodeBase {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode1 extends ShipNode0 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode2 extends ShipNode1 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode3 extends ShipNode2 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode4 extends ShipNode3 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode5 extends ShipNode4 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode6 extends ShipNode5 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode7 extends ShipNode6 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode8 extends ShipNode7 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode9 extends ShipNode8 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode10 extends ShipNode9 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode11 extends ShipNode10 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode12 extends ShipNode11 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode13 extends ShipNode12 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode14 extends ShipNode13 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode15 extends ShipNode14 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode16 extends ShipNode15 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode17 extends ShipNode16 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode18 extends ShipNode17 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode19 extends ShipNode18 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode20 extends ShipNode19 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode21 extends ShipNode20 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode22 extends ShipNode21 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode23 extends ShipNode22 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode24 extends ShipNode23 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode25 extends ShipNode24 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode26 extends ShipNode25 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode27 extends ShipNode26 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode28 extends ShipNode27 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode29 extends ShipNode28 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode30 extends ShipNode29 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode31 extends ShipNode30 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode32 extends ShipNode31 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode33 extends ShipNode32 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode34 extends ShipNode33 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode35 extends ShipNode34 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode36 extends ShipNode35 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode37 extends ShipNode36 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode38 extends ShipNode37 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode39 extends ShipNode38 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export interface ShipNode40 extends ShipNode39 {
  readonly marker: string;
  readonly depth: number;
  readonly parent: unknown;
}

export type ChainNode =
  | ShipNode0
  | ShipNode1
  | ShipNode2
  | ShipNode3
  | ShipNode4
  | ShipNode5
  | ShipNode6
  | ShipNode7
  | ShipNode8
  | ShipNode9
  | ShipNode10
  | ShipNode11
  | ShipNode12
  | ShipNode13
  | ShipNode14
  | ShipNode15
  | ShipNode16
  | ShipNode17
  | ShipNode18
  | ShipNode19
  | ShipNode20
  | ShipNode21
  | ShipNode22
  | ShipNode23
  | ShipNode24
  | ShipNode25
  | ShipNode26
  | ShipNode27
  | ShipNode28
  | ShipNode29
  | ShipNode30
  | ShipNode31
  | ShipNode32
  | ShipNode33
  | ShipNode34
  | ShipNode35
  | ShipNode36
  | ShipNode37
  | ShipNode38
  | ShipNode39
  | ShipNode40;

export const chainFactory = (
  scope: string,
  anchor: number,
  hops: number,
): { readonly label: string; readonly depth: number; readonly hops: number; getLabel(): string } => {
  const label = `${scope}:${anchor}:${hops}`;
  return {
    label,
    depth: Math.min(40, Math.max(0, hops)),
    hops: Math.max(0, hops),
    getLabel() {
      return `${label}::${anchor + hops}`;
    },
  };
};

export const flattenDeepNode = (nodes: {
  [key: string]: number;
}): { readonly keys: string[]; readonly values: number[] } => {
  const keys = Object.keys(nodes);
  const values = keys.map((key) => nodes[key]);
  return {
    keys,
    values,
  };
};

export const requiresDepth40 = (nodes: {
  node01?: number;
  node02?: number;
  node03?: number;
  node04?: number;
  node05?: number;
  node06?: number;
  node07?: number;
  node08?: number;
  node09?: number;
  node10?: number;
  node11?: number;
  node12?: number;
  node13?: number;
  node14?: number;
  node15?: number;
  node16?: number;
  node17?: number;
  node18?: number;
  node19?: number;
  node20?: number;
  node21?: number;
  node22?: number;
  node23?: number;
  node24?: number;
  node25?: number;
  node26?: number;
  node27?: number;
  node28?: number;
  node29?: number;
  node30?: number;
  node31?: number;
  node32?: number;
  node33?: number;
  node34?: number;
  node35?: number;
  node36?: number;
  node37?: number;
  node38?: number;
  node39?: number;
  node40?: number;
}): NoInfer<ChainNode> => {
  const entries = Object.entries(nodes);
  const score = entries.reduce((memo, [key, value]) => memo + (value ?? 0) + key.length, 0);
  const node = {
    marker: `ship-${Math.min(40, entries.length)}` as const,
    active: true,
    depth: Math.min(40, entries.length),
    parent: null as never,
  };

  if (entries.length >= 40) {
    return node as ChainNode;
  }

  return node as ChainNode;
};
