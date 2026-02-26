import type { Brand, OrbitalRoute, RouteUnion, ResolveOrbitalRoute } from '@shared/type-level';

export type TypeStressRoute = Brand<OrbitalRoute | RouteUnion[number], 'TypeStressRoute'>;

export type TypeStressKind =
  | 'catalog'
  | 'resolver'
  | 'workflow'
  | 'validator'
  | 'dispatcher'
  | 'profiler';

export interface TypeStressNode {
  readonly route: TypeStressRoute;
  readonly kind: TypeStressKind;
  readonly enabled: boolean;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TypeStressProfile {
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly value: number;
  readonly code: 0 | 1 | 2;
  readonly outcome: 'pass' | 'retry' | 'failed';
  readonly action: string;
}

export interface TypeStressRecord {
  readonly id: Brand<string, 'stress-id'>;
  readonly tenant: Brand<string, 'tenant-id'>;
  readonly route: TypeStressRoute;
  readonly kind: TypeStressKind;
  readonly resolver: ResolveOrbitalRoute<OrbitalRoute>;
  readonly profile: TypeStressProfile;
}

export interface TypeStressFilter {
  readonly kinds: readonly TypeStressKind[];
  readonly includeDisabled: boolean;
  readonly severities: readonly TypeStressRecord['profile']['severity'][];
}

export type TypeWorklet = {
  readonly id: Brand<string, 'worklet-id'>;
  readonly title: string;
  readonly nodes: readonly TypeStressNode[];
  readonly metadata: {
    readonly createdAt: string;
    readonly tags: readonly string[];
  };
};

export type TypeStressWorkspaceState = {
  readonly workspaceId: Brand<string, 'workspace-id'>;
  readonly records: readonly TypeStressRecord[];
  readonly active: readonly TypeWorklet[];
  readonly filter: TypeStressFilter;
  readonly score: number;
};

export type TypeStressWorkspacePatch = Partial<{
  readonly records: readonly TypeStressRecord[];
  readonly active: readonly TypeWorklet[];
  readonly filter: TypeStressFilter;
  readonly score: number;
}>;

export type TypeStressError =
  | { readonly ok: true; readonly output: TypeStressWorkspaceState }
  | { readonly ok: false; readonly message: string; readonly code: Brand<string, 'error-code'> };

export type Noop = () => void;
