// Generated type-level computation module

export type chain1_3_edge_pulse_CTUnion =
  | { readonly kind: 'chain1_3_edge_pulse_CT_v0'; readonly payload: string; readonly seq: number; readonly idx: 0 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v1'; readonly payload: string; readonly seq: number; readonly idx: 1 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v2'; readonly payload: string; readonly seq: number; readonly idx: 2 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v3'; readonly payload: string; readonly seq: number; readonly idx: 3 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v4'; readonly payload: string; readonly seq: number; readonly idx: 4 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v5'; readonly payload: string; readonly seq: number; readonly idx: 5 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v6'; readonly payload: string; readonly seq: number; readonly idx: 6 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v7'; readonly payload: string; readonly seq: number; readonly idx: 7 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v8'; readonly payload: string; readonly seq: number; readonly idx: 8 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v9'; readonly payload: string; readonly seq: number; readonly idx: 9 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v10'; readonly payload: string; readonly seq: number; readonly idx: 10 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v11'; readonly payload: string; readonly seq: number; readonly idx: 11 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v12'; readonly payload: string; readonly seq: number; readonly idx: 12 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v13'; readonly payload: string; readonly seq: number; readonly idx: 13 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v14'; readonly payload: string; readonly seq: number; readonly idx: 14 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v15'; readonly payload: string; readonly seq: number; readonly idx: 15 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v16'; readonly payload: string; readonly seq: number; readonly idx: 16 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v17'; readonly payload: string; readonly seq: number; readonly idx: 17 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v18'; readonly payload: string; readonly seq: number; readonly idx: 18 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v19'; readonly payload: string; readonly seq: number; readonly idx: 19 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v20'; readonly payload: string; readonly seq: number; readonly idx: 20 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v21'; readonly payload: string; readonly seq: number; readonly idx: 21 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v22'; readonly payload: string; readonly seq: number; readonly idx: 22 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v23'; readonly payload: string; readonly seq: number; readonly idx: 23 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v24'; readonly payload: string; readonly seq: number; readonly idx: 24 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v25'; readonly payload: string; readonly seq: number; readonly idx: 25 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v26'; readonly payload: string; readonly seq: number; readonly idx: 26 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v27'; readonly payload: string; readonly seq: number; readonly idx: 27 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v28'; readonly payload: string; readonly seq: number; readonly idx: 28 }
  | { readonly kind: 'chain1_3_edge_pulse_CT_v29'; readonly payload: string; readonly seq: number; readonly idx: 29 };

export type chain1_3_edge_pulse_CTResolve0<T extends chain1_3_edge_pulse_CTUnion> = T extends { readonly kind: 'chain1_3_edge_pulse_CT_v0' }
  ? T['payload']
  : T extends { readonly idx: 0 }
    ? `resolved_0_${T['seq']}`
    : unknown;

export type chain1_3_edge_pulse_CTResolve1<T extends chain1_3_edge_pulse_CTUnion> = T extends { readonly kind: 'chain1_3_edge_pulse_CT_v1' }
  ? T['payload']
  : T extends { readonly idx: 1 }
    ? `resolved_1_${T['seq']}`
    : unknown;

export type chain1_3_edge_pulse_CTResolve2<T extends chain1_3_edge_pulse_CTUnion> = T extends { readonly kind: 'chain1_3_edge_pulse_CT_v2' }
  ? T['payload']
  : T extends { readonly idx: 2 }
    ? `resolved_2_${T['seq']}`
    : unknown;

export type chain1_3_edge_pulse_CTResolve3<T extends chain1_3_edge_pulse_CTUnion> = T extends { readonly kind: 'chain1_3_edge_pulse_CT_v3' }
  ? T['payload']
  : T extends { readonly idx: 3 }
    ? `resolved_3_${T['seq']}`
    : unknown;

export type chain1_3_edge_pulse_CTResolve4<T extends chain1_3_edge_pulse_CTUnion> = T extends { readonly kind: 'chain1_3_edge_pulse_CT_v4' }
  ? T['payload']
  : T extends { readonly idx: 4 }
    ? `resolved_4_${T['seq']}`
    : unknown;

export type chain1_3_edge_pulse_CTResolve5<T extends chain1_3_edge_pulse_CTUnion> = T extends { readonly kind: 'chain1_3_edge_pulse_CT_v5' }
  ? T['payload']
  : T extends { readonly idx: 5 }
    ? `resolved_5_${T['seq']}`
    : unknown;

export type chain1_3_edge_pulse_CTResolve6<T extends chain1_3_edge_pulse_CTUnion> = T extends { readonly kind: 'chain1_3_edge_pulse_CT_v6' }
  ? T['payload']
  : T extends { readonly idx: 6 }
    ? `resolved_6_${T['seq']}`
    : unknown;

export type chain1_3_edge_pulse_CTResolve7<T extends chain1_3_edge_pulse_CTUnion> = T extends { readonly kind: 'chain1_3_edge_pulse_CT_v7' }
  ? T['payload']
  : T extends { readonly idx: 7 }
    ? `resolved_7_${T['seq']}`
    : unknown;

export type chain1_3_edge_pulse_CTDeepResolve<T extends chain1_3_edge_pulse_CTUnion> =
  chain1_3_edge_pulse_CTResolve0<T> extends infer R0
  ?   chain1_3_edge_pulse_CTResolve1<T> extends infer R1
  ?   chain1_3_edge_pulse_CTResolve2<T> extends infer R2
  ?   chain1_3_edge_pulse_CTResolve3<T> extends infer R3
  ?   chain1_3_edge_pulse_CTResolve4<T> extends infer R4
  ?   chain1_3_edge_pulse_CTResolve5<T> extends infer R5
  ?   chain1_3_edge_pulse_CTResolve6<T> extends infer R6
  ?   chain1_3_edge_pulse_CTResolve7<T> extends infer R7
  ? [R0, R1, R2, R3, R4, R5, R6, R7]
  : never
  : never
  : never
  : never
  : never
  : never
  : never
  : never
;

export type chain1_3_edge_pulse_CTDistribute<T extends chain1_3_edge_pulse_CTUnion> = T extends infer U extends chain1_3_edge_pulse_CTUnion
  ? { readonly distributed: U['kind']; readonly resolved: U['payload'] }
  : never;

export type chain1_3_edge_pulse_MTKeys<T> = {
  [K in keyof T as K extends string ? `chain1_3_edge_pulse_MT_${Uppercase<K>}` : never]: T[K] extends object ? chain1_3_edge_pulse_MTKeys<T[K]> : T[K];
};

export type chain1_3_edge_pulse_MTReadonlyDeep<T> = {
  readonly [K in keyof T]: T[K] extends object ? chain1_3_edge_pulse_MTReadonlyDeep<T[K]> : T[K];
};

export type chain1_3_edge_pulse_MTPickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};

export type chain1_3_edge_pulse_TLEntity = 'chain1_3_edge_pulse_TLEntity0' | 'chain1_3_edge_pulse_TLEntity1' | 'chain1_3_edge_pulse_TLEntity2' | 'chain1_3_edge_pulse_TLEntity3' | 'chain1_3_edge_pulse_TLEntity4' | 'chain1_3_edge_pulse_TLEntity5';
export type chain1_3_edge_pulse_TLAction = 'create' | 'read' | 'update' | 'delete' | 'list' | 'search';
export type chain1_3_edge_pulse_TLRoute = `/api/${chain1_3_edge_pulse_TLEntity}/${chain1_3_edge_pulse_TLAction}`;

export type chain1_3_edge_pulse_TLExtractEntity<T> = T extends `/api/${infer E}/${string}` ? E : never;
export type chain1_3_edge_pulse_TLExtractAction<T> = T extends `/api/${string}/${infer A}` ? A : never;

export type chain1_3_edge_pulse_TLEventName<T extends string> = `on${Capitalize<T>}Changed`;
export type chain1_3_edge_pulse_TLAllEvents = chain1_3_edge_pulse_TLEventName<chain1_3_edge_pulse_TLAction>;

export type chain1_3_edge_pulse_RTBuildTuple<N extends number, T extends unknown[] = []> =
  T['length'] extends N ? T : chain1_3_edge_pulse_RTBuildTuple<N, [...T, unknown]>;

export type chain1_3_edge_pulse_RTPaths<T, Depth extends unknown[] = []> =
  Depth['length'] extends 5 ? never :
  T extends object
    ? { [K in keyof T & string]: K | `${K}.${chain1_3_edge_pulse_RTPaths<T[K], [...Depth, unknown]>}` }[keyof T & string]
    : never;

export type chain1_3_edge_pulse_RTDeepPartial<T> = T extends object
  ? { [K in keyof T]?: chain1_3_edge_pulse_RTDeepPartial<T[K]> }
  : T;

