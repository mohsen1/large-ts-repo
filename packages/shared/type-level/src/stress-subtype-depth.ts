import {
  type OrbitDomain,
  type OrbitAction,
  type OrbitRoute,
  type OrbitScope,
  type RouteParts,
  type RouteStateTuple,
} from './stress-conditional-orbit';

export interface LayerContract {
  readonly contractId: string;
  readonly tags: readonly string[];
}

interface OrbitLayerBase {
  readonly step: number;
  readonly name: string;
  readonly meta: {
    readonly label: string;
    readonly value: number;
    readonly previous?: number;
  };
}

export interface OrbitLayer0 extends OrbitLayerBase {
  readonly step: number;

}

export interface OrbitLayer1 extends OrbitLayer0 {
  readonly step: number;

}

export interface OrbitLayer2 extends OrbitLayer1 {
  readonly step: number;

}

export interface OrbitLayer3 extends OrbitLayer2 {
  readonly step: number;

}

export interface OrbitLayer4 extends OrbitLayer3 {
  readonly step: number;

}

export interface OrbitLayer5 extends OrbitLayer4 {
  readonly step: number;

}

export interface OrbitLayer6 extends OrbitLayer5 {
  readonly step: number;

}

export interface OrbitLayer7 extends OrbitLayer6 {
  readonly step: number;

}

export interface OrbitLayer8 extends OrbitLayer7 {
  readonly step: number;

}

export interface OrbitLayer9 extends OrbitLayer8 {
  readonly step: number;

}

export interface OrbitLayer10 extends OrbitLayer9 {
  readonly step: number;

}

export interface OrbitLayer11 extends OrbitLayer10 {
  readonly step: number;

}

export interface OrbitLayer12 extends OrbitLayer11 {
  readonly step: number;

}

export interface OrbitLayer13 extends OrbitLayer12 {
  readonly step: number;

}

export interface OrbitLayer14 extends OrbitLayer13 {
  readonly step: number;

}

export interface OrbitLayer15 extends OrbitLayer14 {
  readonly step: number;

}

export interface OrbitLayer16 extends OrbitLayer15 {
  readonly step: number;

}

export interface OrbitLayer17 extends OrbitLayer16 {
  readonly step: number;

}

export interface OrbitLayer18 extends OrbitLayer17 {
  readonly step: number;

}

export interface OrbitLayer19 extends OrbitLayer18 {
  readonly step: number;

}

export interface OrbitLayer20 extends OrbitLayer19 {
  readonly step: number;

}

export interface OrbitLayer21 extends OrbitLayer20 {
  readonly step: number;

}

export interface OrbitLayer22 extends OrbitLayer21 {
  readonly step: number;

}

export interface OrbitLayer23 extends OrbitLayer22 {
  readonly step: number;

}

export interface OrbitLayer24 extends OrbitLayer23 {
  readonly step: number;

}

export interface OrbitLayer25 extends OrbitLayer24 {
  readonly step: number;

}

export interface OrbitLayer26 extends OrbitLayer25 {
  readonly step: number;

}

export interface OrbitLayer27 extends OrbitLayer26 {
  readonly step: number;

}

export interface OrbitLayer28 extends OrbitLayer27 {
  readonly step: number;

}

export interface OrbitLayer29 extends OrbitLayer28 {
  readonly step: number;

}

export interface OrbitLayer30 extends OrbitLayer29 {
  readonly step: number;

}

export interface OrbitLayer31 extends OrbitLayer30 {
  readonly step: number;

}

export interface OrbitLayer32 extends OrbitLayer31 {
  readonly step: number;

}

export interface OrbitLayer33 extends OrbitLayer32 {
  readonly step: number;

}

export interface OrbitLayer34 extends OrbitLayer33 {
  readonly step: number;

}

export type OrbitLayerUnion =
  | OrbitLayer0
  | OrbitLayer1
  | OrbitLayer2
  | OrbitLayer3
  | OrbitLayer4
  | OrbitLayer5
  | OrbitLayer6
  | OrbitLayer7
  | OrbitLayer8
  | OrbitLayer9
  | OrbitLayer10
  | OrbitLayer11
  | OrbitLayer12
  | OrbitLayer13
  | OrbitLayer14
  | OrbitLayer15
  | OrbitLayer16
  | OrbitLayer17
  | OrbitLayer18
  | OrbitLayer19
  | OrbitLayer20
  | OrbitLayer21
  | OrbitLayer22
  | OrbitLayer23
  | OrbitLayer24
  | OrbitLayer25
  | OrbitLayer26
  | OrbitLayer27
  | OrbitLayer28
  | OrbitLayer29
  | OrbitLayer30
  | OrbitLayer31
  | OrbitLayer32
  | OrbitLayer33
  | OrbitLayer34;

export type OrbitLayerUnionTuple = readonly [OrbitLayerUnion, ...OrbitLayerUnion[]];

export type OrbitLayerTrail = {
  readonly length: number;
  readonly first: string;
  readonly last: string;
  readonly sum: number;
};

export type OrbitDomainTrail = {
  readonly entries: readonly [string, string, string, string, string];
};

export type LayerEnvelope<T extends OrbitLayerUnion> = {
  readonly step: T['step'];
  readonly label: string;
  readonly route: RouteParts<`/${OrbitDomain & string}/${OrbitAction & string}/${OrbitScope & string}`>;
};

export type OrbitLayerRoute<T extends OrbitLayerUnion> = {
  readonly route: T;
  readonly envelope: LayerEnvelope<T>;
  readonly chain: true;
};

export type LayerState<T extends OrbitLayerUnion> = {
  readonly layer: T;
  readonly envelope: LayerEnvelope<T>;
  readonly contract: LayerContract;
};

export type DeepLayerMatch<T extends OrbitLayerUnion> = T extends OrbitLayerUnion
  ? T extends OrbitLayer34
    ? { readonly depth: 34; readonly layer: T; readonly nested: true }
    : { readonly depth: T['step']; readonly layer: T; readonly parent: true }
  : never;

export type OrbitLayerTuple = OrbitLayerUnionTuple;

export const orbitLayerByStep = {
  0: { step: 0, name: 'layer-0', meta: { label: 'layer-0', value: 0 } } as const,
  10: { step: 10, name: 'layer-10', meta: { label: 'layer-10', value: 10, previous: 9 } } as const,
  20: { step: 20, name: 'layer-20', meta: { label: 'layer-20', value: 20, previous: 19 } } as const,
  34: { step: 34, name: 'layer-34', meta: { label: 'layer-34', value: 34, previous: 33 } } as const,
} as const satisfies Record<number, OrbitLayerUnion>;

export const layerTrail: OrbitLayerUnionTuple = [
  orbitLayerByStep[0],
  orbitLayerByStep[10],
  orbitLayerByStep[20],
  orbitLayerByStep[34],
] as const;

export const buildSubTypeChainDepth = <T extends OrbitLayerUnion>(
  start: T,
  layers: OrbitLayerTuple,
): OrbitLayerTuple => [...layers, start];

export const mapLayerTrail = <T extends OrbitLayerUnionTuple>(
  trail: T,
): { readonly length: T['length']; readonly stepSum: number } => {
  const stepSum = trail.reduce((acc, item) => acc + item.meta.value, 0);
  return { length: trail.length, stepSum };
};

export const catalogFromTrail = (trail: OrbitLayerTuple): OrbitLayerTrail => {
  const first = trail[0]?.name ?? 'layer-0';
  const last = trail[trail.length - 1]?.name ?? 'layer-0';
  return {
    length: trail.length,
    first,
    last,
    sum: trail.reduce((sum, item) => sum + item.meta.value, 0),
  };
};

export const buildTrailGrid = (count: number): OrbitLayerTrail[] => {
  const out: OrbitLayerTrail[] = [];
  for (let index = 0; index < count; index += 1) {
    out.push({
      length: count,
      first: `layer-${index}`,
      last: `layer-${Math.max(0, index - 1)}`,
      sum: index * 34,
    });
  }
  return out;
};

export interface ClassLayer0<TPayload extends object = LayerContract> {
  readonly level: 0;
  readonly value: TPayload;
  promote<TNext extends object>(payload: TNext): ClassLayer1<TPayload & TNext>;
}

export class ClassLayer0Impl<TPayload extends object = LayerContract> implements ClassLayer0<TPayload> {
  public constructor(public readonly level: 0 = 0, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer1<TPayload & TNext> {
    return new ClassLayer1(this.level + 1, { ...this.value, ...payload }) as ClassLayer1<TPayload & TNext>;
  }
}

export class ClassLayer1<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 1, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer2<TPayload & TNext> {
    return new ClassLayer2(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer2<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 2, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer3<TPayload & TNext> {
    return new ClassLayer3(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer3<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 3, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer4<TPayload & TNext> {
    return new ClassLayer4(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer4<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 4, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer5<TPayload & TNext> {
    return new ClassLayer5(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer5<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 5, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer6<TPayload & TNext> {
    return new ClassLayer6(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer6<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 6, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer7<TPayload & TNext> {
    return new ClassLayer7(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer7<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 7, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer8<TPayload & TNext> {
    return new ClassLayer8(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer8<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 8, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer9<TPayload & TNext> {
    return new ClassLayer9(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer9<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 9, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer10<TPayload & TNext> {
    return new ClassLayer10(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer10<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 10, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer11<TPayload & TNext> {
    return new ClassLayer11(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer11<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 11, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer12<TPayload & TNext> {
    return new ClassLayer12(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer12<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 12, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer13<TPayload & TNext> {
    return new ClassLayer13(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer13<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 13, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer14<TPayload & TNext> {
    return new ClassLayer14(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer14<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 14, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer15<TPayload & TNext> {
    return new ClassLayer15(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer15<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 15, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer16<TPayload & TNext> {
    return new ClassLayer16(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer16<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 16, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer17<TPayload & TNext> {
    return new ClassLayer17(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer17<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 17, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer18<TPayload & TNext> {
    return new ClassLayer18(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer18<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 18, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer19<TPayload & TNext> {
    return new ClassLayer19(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer19<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 19, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer20<TPayload & TNext> {
    return new ClassLayer20(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer20<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 20, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer21<TPayload & TNext> {
    return new ClassLayer21(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer21<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 21, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer22<TPayload & TNext> {
    return new ClassLayer22(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer22<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 22, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer23<TPayload & TNext> {
    return new ClassLayer23(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer23<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 23, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer24<TPayload & TNext> {
    return new ClassLayer24(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer24<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 24, public readonly value: TPayload) {}
  public promote<TNext extends object>(payload: TNext): ClassLayer25<TPayload & TNext> {
    return new ClassLayer25(this.level + 1, { ...this.value, ...payload });
  }
}

export class ClassLayer25<TPayload extends object = LayerContract> {
  public constructor(public readonly level = 25, public readonly value: TPayload) {}
}

export type DeepClassChain =
  | ClassLayer0<object>
  | ClassLayer1<object>
  | ClassLayer2<object>
  | ClassLayer3<object>
  | ClassLayer4<object>
  | ClassLayer5<object>
  | ClassLayer6<object>
  | ClassLayer7<object>
  | ClassLayer8<object>
  | ClassLayer9<object>
  | ClassLayer10<object>
  | ClassLayer11<object>
  | ClassLayer12<object>
  | ClassLayer13<object>
  | ClassLayer14<object>
  | ClassLayer15<object>
  | ClassLayer16<object>
  | ClassLayer17<object>
  | ClassLayer18<object>
  | ClassLayer19<object>
  | ClassLayer20<object>
  | ClassLayer21<object>
  | ClassLayer22<object>
  | ClassLayer23<object>
  | ClassLayer24<object>
  | ClassLayer25<object>;

export type WalkClassChain<TLayer extends DeepClassChain> = TLayer extends ClassLayer25<infer TPayload>
  ? { readonly atEnd: true; readonly payload: TPayload }
  : TLayer extends { level: infer L; value: infer V }
    ? { readonly atEnd: false; readonly level: L; readonly payload: V; readonly next: true }
    : never;

export const routePartsFromLayer = <T extends OrbitRoute>(
  parts: RouteParts<T>,
): WalkClassChain<ClassLayer25<{ readonly route: T; readonly parts: RouteParts<T> }>> => {
  const layer = new ClassLayer25<{ readonly route: T; readonly parts: RouteParts<T> }>(25, {
    route: '/atlas/bootstrap/global' as T,
    parts,
  });
  return {
    atEnd: true,
    payload: {
      route: layer.value.route,
      parts: layer.value.parts,
    },
  };
};

export const layerDepth = (depth: number): OrbitLayerUnionTuple => {
  const base: OrbitLayerUnion[] = [];
  const steps: OrbitLayerUnion[] = [
    { step: 0, name: 'layer-0', meta: { label: 'layer-0', value: 0 } },
    { step: 1, name: 'layer-1', meta: { label: 'layer-1', value: 1, previous: 0 } },
  ];
  for (let index = 0; index < depth; index += 1) {
    base.push(steps[index % steps.length] as OrbitLayerUnion);
  }
  return base as unknown as OrbitLayerUnionTuple;
};
